import { inngest } from "../client";
import { NonRetriableError } from "inngest";
import prisma, {
  WorkflowStatus,
  WorkflowType,
  ReviewStatus,
  FeaturePhase,
  IssueCategory,
  TaskStatus,
} from "@shipflow/database";
import { Octokit } from "octokit";
import { z } from "zod";
import { aiGenerateObject } from "../ai";
import { decryptSecret } from "../crypto";

/**
 * AI Review Inngest Workflow
 *
 * Steps: fetch PR context + PRD + tasks → analyze code changes via AI SDK →
 *        categorize issues → post GitHub comments → update feature status
 * Handles re-review trigger.
 *
 * Requirements: 5.1, 5.4, 10.1, 10.2
 */

const TOTAL_STEPS = 5;

const reviewIssueSchema = z.object({
  category: z.enum(["BLOCKING", "NON_BLOCKING"]),
  filePath: z.string(),
  lineNumber: z.number().nullable(),
  title: z.string(),
  description: z.string(),
});

const qaReviewResultSchema = z.object({
  issues: z.array(reviewIssueSchema),
  summary: z.string(),
});

interface ReviewContextData {
  pullRequest: { id: string; number: number; title: string; branchName: string };
  repository: { id: string; fullName: string; projectId: string };
  prdContent: unknown;
  acceptanceCriteria: string;
  tasks: Array<{ title: string; description: string; acceptanceCriteria: string }>;
  diffSummary: { files: Array<{ path: string; additions: number; deletions: number; patch?: string }> };
  accessToken: string | null;
  featureRequestId: string | null;
  reviewGuidelines: string | null;
}

interface ReviewResultData {
  reviewId: string;
  issues: Array<{ category: string; filePath: string; lineNumber: number | null; title: string; description: string }>;
  summary: string;
}

interface StoredIssue {
  id: string;
  category: string;
  filePath: string;
  lineNumber: number | null;
  title: string;
  description: string;
}

async function updateWorkflowProgress(
  workflowId: string,
  stepName: string,
  completedSteps: number,
  status?: WorkflowStatus
) {
  await prisma.workflow.update({
    where: { id: workflowId },
    data: {
      currentStep: stepName,
      completedSteps,
      ...(status ? { status } : {}),
      updatedAt: new Date(),
    },
  });
}

export const aiReview = inngest.createFunction(
  {
    id: "ai-review",
    name: "AI Code Review",
    retries: 3,
    onFailure: async ({ event, error }) => {
      const { reviewId } = event.data.event.data;
      if (reviewId) {
        const review = await prisma.aIReview.update({
          where: { id: reviewId },
          data: {
            status: ReviewStatus.FAILED,
            errorMessage: error.message || "An unknown error occurred during AI review.",
            completedAt: new Date(),
          },
          include: { pullRequest: { include: { task: true } } }
        });

        if (review.pullRequest.task?.featureRequestId) {
          await prisma.workflow.updateMany({
            where: {
              featureRequestId: review.pullRequest.task.featureRequestId,
              type: { in: [WorkflowType.AI_REVIEW, WorkflowType.RE_REVIEW] },
              status: WorkflowStatus.RUNNING
            },
            data: {
              status: WorkflowStatus.FAILED,
              errorMessage: error.message || "An unknown error occurred during AI review.",
              completedAt: new Date(),
            }
          });
        }
      }
    },
  },
  { event: "review/pr.review" },
  async ({ event, step }) => {
    const { pullRequestId, workspaceId, iteration, reviewId } = event.data;

    // Create workflow record
    const workflow = await step.run("create-workflow", async () => {
      const pr = await prisma.pullRequest.findUnique({
        where: { id: pullRequestId },
        include: { task: { select: { featureRequestId: true } } },
      });

      return await prisma.workflow.create({
        data: {
          featureRequestId: pr?.task?.featureRequestId ?? null,
          type: iteration > 1 ? WorkflowType.RE_REVIEW : WorkflowType.AI_REVIEW,
          status: WorkflowStatus.RUNNING,
          currentStep: "fetch-context",
          totalSteps: TOTAL_STEPS,
          completedSteps: 0,
          startedAt: new Date(),
          initiatedById: "system",
        },
      });
    });

    // Step 1: Fetch PR context + PRD + tasks
    const reviewContext = await step.run("fetch-context", async (): Promise<ReviewContextData> => {
      await updateWorkflowProgress(workflow.id, "fetch-context", 0, WorkflowStatus.RUNNING);

      const pr = await prisma.pullRequest.findUnique({
        where: { id: pullRequestId },
        include: {
          repository: {
            include: {
              project: { select: { reviewGuidelines: true } },
            },
          },
          task: {
            include: {
              featureRequest: {
                include: {
                  prd: true,
                  tasks: true,
                },
              },
            },
          },
        },
      });

      if (!pr) {
        throw new Error(`Pull request ${pullRequestId} not found`);
      }

      // Get GitHub access token
      const account = await prisma.account.findFirst({
        where: {
          provider: "github",
          user: {
            workspaceMembers: {
              some: {
                workspace: {
                  projects: {
                    some: { id: pr.repository.projectId },
                  },
                },
              },
            },
          },
        },
        select: { accessToken: true },
      });

      // Get GitHub access token and decrypt safely
      let decryptedToken: string | null = null;
      if (account?.accessToken) {
        try {
          decryptedToken = decryptSecret(account.accessToken);
        } catch {
          throw new NonRetriableError(
            "Failed to authenticate GitHub token. Your encryption key may have changed or the token is corrupted. Please reconnect your GitHub account in Settings."
          );
        }
      }

      // Fetch fresh diff from GitHub
      let diffSummary: { files: Array<{ path: string; additions: number; deletions: number; patch?: string }> } =
        (pr.diffSummary as { files: Array<{ path: string; additions: number; deletions: number; patch?: string }> }) ?? { files: [] };

      if (decryptedToken) {
        const octokit = new Octokit({ auth: decryptedToken });
        const [owner, repo] = pr.repository.fullName.split("/");
        if (owner && repo) {
          const response = await octokit.rest.pulls.listFiles({
            owner,
            repo,
            pull_number: pr.number,
            per_page: 100,
          });
          diffSummary = {
            files: response.data.map((file: { filename: string; additions: number; deletions: number; patch?: string }) => ({
              path: file.filename,
              additions: file.additions,
              deletions: file.deletions,
              patch: file.patch,
            })),
          };
        }
      }

      const featureRequest = pr.task?.featureRequest;
      const prd = featureRequest?.prd;
      const tasks = featureRequest?.tasks ?? [];

      return {
        pullRequest: {
          id: pr.id,
          number: pr.number,
          title: pr.title,
          branchName: pr.branchName,
        },
        repository: {
          id: pr.repository.id,
          fullName: pr.repository.fullName,
          projectId: pr.repository.projectId,
        },
        prdContent: prd?.content ?? null,
        acceptanceCriteria: pr.task
          ? pr.task.acceptanceCriteria || ""
          : tasks
              .map((t) => t.acceptanceCriteria)
              .filter(Boolean)
              .join("\n"),
        tasks: pr.task
          ? [
              {
                title: pr.task.title,
                description: pr.task.description,
                acceptanceCriteria: pr.task.acceptanceCriteria,
              },
            ]
          : tasks.map((t) => ({
              title: t.title,
              description: t.description,
              acceptanceCriteria: t.acceptanceCriteria,
            })),
        diffSummary,
        accessToken: decryptedToken,
        featureRequestId: featureRequest?.id ?? null,
        reviewGuidelines: pr.repository.project?.reviewGuidelines ?? null,
      };
    });

    // Step 2: Analyze code changes via AI SDK
    const reviewResult = await step.run("analyze-code", async (): Promise<ReviewResultData> => {
      await updateWorkflowProgress(workflow.id, "analyze-code", 1);

      const ctx = reviewContext as ReviewContextData;

      // Update existing review record to IN_PROGRESS
      const review = await prisma.aIReview.update({
        where: { id: reviewId },
        data: {
          status: ReviewStatus.IN_PROGRESS,
          startedAt: new Date(),
        },
      });

      // Run QA review via AI SDK
      const { object } = await aiGenerateObject({
        schema: qaReviewResultSchema,
        system: `You are an expert QA engineer performing a thorough code review. Review code changes against PRD requirements, acceptance criteria, engineering tasks, security concerns, performance considerations, edge cases, and code quality.

Categorize issues as:
- BLOCKING: Violates PRD requirement, acceptance criterion, or introduces security vulnerability
- NON_BLOCKING: Style suggestions, minor optimizations, and other non-critical issues${
          ctx.reviewGuidelines
            ? `\n\nThis team has additional review guidelines you MUST apply. Treat violations of these guidelines with the severity the guidelines imply:\n${ctx.reviewGuidelines}`
            : ""
        }`,
        prompt: `Review the following pull request:

## Pull Request
**Title:** ${ctx.pullRequest.title}

## PRD Content
${JSON.stringify(ctx.prdContent, null, 2)}

## Acceptance Criteria
${ctx.acceptanceCriteria}

## Engineering Tasks
${ctx.tasks.map((t) => `- **${t.title}**: ${t.description}\n  Acceptance: ${t.acceptanceCriteria}`).join("\n")}

## Changed Files
${ctx.diffSummary.files.map((f) => `- ${f.path} (+${f.additions}, -${f.deletions})${f.patch ? `\n\`\`\`\n${f.patch}\n\`\`\`` : ""}`).join("\n")}

Provide your findings as a structured list of issues with appropriate categorization.`,
      });

      return {
        reviewId: review.id,
        issues: object.issues,
        summary: object.summary,
      };
    });

    // Step 3: Categorize issues and store in database
    const storedIssues = await step.run("categorize-issues", async (): Promise<StoredIssue[]> => {
      await updateWorkflowProgress(workflow.id, "categorize-issues", 2);

      const result = reviewResult as ReviewResultData;

      const issues = await Promise.all(
        result.issues.map((issue) =>
          prisma.reviewIssue.create({
            data: {
              reviewId: result.reviewId,
              category: issue.category as IssueCategory,
              filePath: issue.filePath,
              lineNumber: issue.lineNumber,
              title: issue.title,
              description: issue.description,
            },
          })
        )
      );

      // Update review status to completed
      await prisma.aIReview.update({
        where: { id: result.reviewId },
        data: {
          status: ReviewStatus.COMPLETED,
          completedAt: new Date(),
        },
      });

      return issues.map((i) => ({
        id: i.id,
        category: i.category,
        filePath: i.filePath,
        lineNumber: i.lineNumber,
        title: i.title,
        description: i.description,
      }));
    });

    // Step 4: Post GitHub comments
    await step.run("post-github-comments", async () => {
      await updateWorkflowProgress(workflow.id, "post-github-comments", 3);

      const ctx = reviewContext as ReviewContextData;
      const issues = storedIssues as StoredIssue[];
      const result = reviewResult as ReviewResultData;

      if (!ctx.accessToken) {
        return { posted: false, reason: "No GitHub access token available" };
      }

      const octokit = new Octokit({ auth: ctx.accessToken });
      const [owner, repo] = ctx.repository.fullName.split("/");

      if (!owner || !repo) {
        return { posted: false, reason: "Invalid repository name" };
      }

      // Get latest commit SHA for the PR
      const prData = await octokit.rest.pulls.get({
        owner,
        repo,
        pull_number: ctx.pullRequest.number,
      });
      const commitSha = prData.data.head.sha;

      // Post inline comments for issues with line numbers
      const inlineComments = issues
        .filter((i) => i.lineNumber !== null)
        .map((i) => ({
          path: i.filePath,
          line: i.lineNumber as number,
          body: `**[${i.category === "BLOCKING" ? "🚫 BLOCKING" : "💡 NON-BLOCKING"}] ${i.title}**\n\n${i.description}`,
        }));

      if (inlineComments.length > 0) {
        await octokit.rest.pulls.createReview({
          owner,
          repo,
          pull_number: ctx.pullRequest.number,
          commit_id: commitSha,
          event: "COMMENT",
          comments: inlineComments,
        });
      }

      // Post general issues as PR comments
      const generalIssues = issues.filter((i) => i.lineNumber === null);
      for (const issue of generalIssues) {
        await octokit.rest.issues.createComment({
          owner,
          repo,
          issue_number: ctx.pullRequest.number,
          body: `**[${issue.category === "BLOCKING" ? "🚫 BLOCKING" : "💡 NON-BLOCKING"}] ${issue.title}**\n\n${issue.description}`,
        });
      }

      // Post summary comment
      const blockingCount = issues.filter((i) => i.category === "BLOCKING").length;
      const nonBlockingCount = issues.filter((i) => i.category === "NON_BLOCKING").length;
      const statusEmoji = blockingCount > 0 ? "🚫" : "✅";
      const statusText = blockingCount > 0
        ? "**Changes Requested** — Blocking issues found"
        : "**Approved** — No blocking issues found";

      await octokit.rest.issues.createComment({
        owner,
        repo,
        issue_number: ctx.pullRequest.number,
        body: `## ${statusEmoji} ShipFlow AI Review — Iteration ${iteration}\n\n${statusText}\n\n### Summary\n${result.summary}\n\n| Category | Count |\n|----------|-------|\n| 🚫 Blocking | ${blockingCount} |\n| 💡 Non-blocking | ${nonBlockingCount} |\n| **Total** | **${issues.length}** |\n\n---\n*Powered by ShipFlow AI QA Agent*`,
      });

      return { posted: true };
    });

    // Step 5: Update feature status
    const _statusResult = await step.run("update-feature-status", async () => {
      await updateWorkflowProgress(workflow.id, "update-feature-status", 4);

      const ctx = reviewContext as ReviewContextData;
      const issues = storedIssues as StoredIssue[];

      const hasBlockingIssues = issues.some(
        (i) => i.category === IssueCategory.BLOCKING
      );

      // Update feature phase based on review result
      if (ctx.featureRequestId) {
        let newPhase: FeaturePhase = FeaturePhase.HUMAN_APPROVAL;
        
        if (hasBlockingIssues) {
          newPhase = FeaturePhase.FIX_NEEDED;
        } else {
          // Check if there are other incomplete tasks
          const pendingTasks = await prisma.task.count({
            where: {
              featureRequestId: ctx.featureRequestId,
              status: { in: [TaskStatus.BACKLOG, TaskStatus.IN_PROGRESS] },
            },
          });
          
          if (pendingTasks > 0) {
            newPhase = FeaturePhase.DEVELOPMENT; // remain in development
          }
        }

        await prisma.featureRequest.update({
          where: { id: ctx.featureRequestId },
          data: { phase: newPhase },
        });
      }

      // Record AI review usage for billing. Stamp the usage log with the
      // workspace's *billing cycle* window so it matches how billing reads it
      // (getCurrentUsage filters by subscription.billingCycleStart/End). Using
      // the calendar month here caused recorded reviews to fall outside the
      // billing window and never count toward credits.
      const sub = await prisma.billingSubscription.findUnique({
        where: { workspaceId },
        select: { billingCycleStart: true, billingCycleEnd: true },
      });
      const now = new Date();
      const periodStart =
        sub?.billingCycleStart ??
        new Date(now.getFullYear(), now.getMonth(), 1);
      const periodEnd =
        sub?.billingCycleEnd ??
        new Date(now.getFullYear(), now.getMonth() + 1, 0);
      await prisma.usageLog.create({
        data: {
          workspaceId,
          type: "ai_review",
          count: 1,
          periodStart,
          periodEnd,
        },
      });

      // Mark workflow complete
      await prisma.workflow.update({
        where: { id: workflow.id },
        data: {
          status: WorkflowStatus.COMPLETED,
          completedSteps: TOTAL_STEPS,
          currentStep: "complete",
          completedAt: new Date(),
        },
      });

      return {
        hasBlockingIssues,
        totalIssues: issues.length,
        blockingCount: issues.filter((i) => i.category === IssueCategory.BLOCKING).length,
        nonBlockingCount: issues.filter((i) => i.category === IssueCategory.NON_BLOCKING).length,
      };
    });

    const issues = storedIssues as StoredIssue[];
    const hasBlockingIssues = issues.some(
      (i) => i.category === IssueCategory.BLOCKING
    );

    // Emit a dedicated completion event so release-readiness runs AFTER this
    // review finishes (avoids concurrent phase-transition races).
    await step.sendEvent("emit-review-completed", {
      name: "review/completed",
      data: {
        pullRequestId,
        workspaceId,
        iteration,
        hasBlockingIssues,
      },
    });

    return {
      status: "completed",
      workflowId: workflow.id,
      reviewId: (reviewResult as ReviewResultData).reviewId,
      issueCount: issues.length,
      hasBlockingIssues,
    };
  }
);
