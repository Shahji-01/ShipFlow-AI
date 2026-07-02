import { inngest } from "../client";
import prisma, { WorkflowStatus, WorkflowType, PRStatus } from "@shipflow/database";
import { Octokit } from "octokit";
import { decryptSecret } from "../crypto";

/**
 * PR Processing Inngest Workflow
 *
 * Steps: validate → fetch-diff → match-task → store
 * Processes incoming pull request events and stores PR data.
 *
 * Requirements: 4.2, 4.3, 10.1
 */

const TOTAL_STEPS = 4;

interface PRData {
  prNumber: number;
  prTitle: string;
  prId: number;
  branchName: string;
  status: PRStatus;
  fullName: string;
  projectId: string;
  action: string;
}

interface DiffSummary {
  files: Array<{ path: string; additions: number; deletions: number }>;
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

export const prProcessing = inngest.createFunction(
  {
    id: "pr-processing",
    name: "PR Processing",
    retries: 3,
  },
  { event: "webhook/process" },
  async ({ event, step }) => {
    const { eventType, payload, repositoryId } = event.data;

    // Only process pull_request events in this function
    if (eventType !== "pull_request") {
      return { status: "skipped", reason: `Not a PR event: ${eventType}` };
    }

    // Create workflow record
    const workflow = await step.run("create-workflow", async () => {
      return await prisma.workflow.create({
        data: {
          type: WorkflowType.PR_PROCESSING,
          status: WorkflowStatus.RUNNING,
          currentStep: "validate",
          totalSteps: TOTAL_STEPS,
          completedSteps: 0,
          startedAt: new Date(),
          initiatedById: "system",
        },
      });
    });

    // Step 1: Validate
    const prData = await step.run("validate", async (): Promise<PRData> => {
      await updateWorkflowProgress(workflow.id, "validate", 0, WorkflowStatus.RUNNING);

      const pullRequest = payload.pull_request as Record<string, unknown> | undefined;
      if (!pullRequest) {
        throw new Error("No pull_request data in payload");
      }

      const repository = await prisma.repository.findUnique({
        where: { id: repositoryId },
      });

      if (!repository) {
        throw new Error(`Repository ${repositoryId} not found`);
      }

      const prNumber = pullRequest.number as number;
      const prTitle = pullRequest.title as string;
      const prId = pullRequest.id as number;
      const branchName = (pullRequest.head as Record<string, unknown>)?.ref as string;
      const prState = pullRequest.state as string;
      const merged = pullRequest.merged as boolean;

      let status: PRStatus = PRStatus.OPEN;
      if (merged) {
        status = PRStatus.MERGED;
      } else if (prState === "closed") {
        status = PRStatus.CLOSED;
      }

      return {
        prNumber,
        prTitle,
        prId,
        branchName,
        status,
        fullName: repository.fullName,
        projectId: repository.projectId,
        action: payload.action as string,
      };
    });

    // Step 2: Fetch diff
    const diffSummary = await step.run("fetch-diff", async (): Promise<DiffSummary | null> => {
      await updateWorkflowProgress(workflow.id, "fetch-diff", 1);

      const data = prData as PRData;
      const action = data.action;
      if (action !== "opened" && action !== "synchronize" && action !== "reopened") {
        return null;
      }

      // Get GitHub token
      const account = await prisma.account.findFirst({
        where: {
          provider: "github",
          user: {
            workspaceMembers: {
              some: {
                workspace: {
                  projects: {
                    some: { id: data.projectId },
                  },
                },
              },
            },
          },
        },
        select: { accessToken: true },
      });

      if (!account?.accessToken) {
        return null;
      }

      const octokit = new Octokit({ auth: decryptSecret(account.accessToken) });
      const [owner, repo] = data.fullName.split("/");
      if (!owner || !repo) return null;

      const response = await octokit.rest.pulls.listFiles({
        owner,
        repo,
        pull_number: data.prNumber,
        per_page: 100,
      });

      return {
        files: response.data.map((file: { filename: string; additions: number; deletions: number }) => ({
          path: file.filename,
          additions: file.additions,
          deletions: file.deletions,
        })),
      };
    });

    // Step 3: Match task by branch name
    const matchedTaskId = await step.run("match-task", async (): Promise<string | null> => {
      await updateWorkflowProgress(workflow.id, "match-task", 2);

      const data = prData as PRData;

      // Find task by linked branch within the same project scope
      const task = await prisma.task.findFirst({
        where: {
          linkedBranch: data.branchName,
          featureRequest: {
            project: {
              repositories: {
                some: { id: repositoryId },
              },
            },
          },
        },
        select: { id: true },
      });

      return task?.id ?? null;
    });

    // Step 4: Store PR data
    const storedPR = await step.run("store", async () => {
      await updateWorkflowProgress(workflow.id, "store", 3);

      const data = prData as PRData;
      const diff = diffSummary as DiffSummary | null;
      const taskId = matchedTaskId as string | null;

      const pullRequest = await prisma.pullRequest.upsert({
        where: {
          repositoryId_githubPrId: {
            repositoryId,
            githubPrId: BigInt(data.prId),
          },
        },
        create: {
          repositoryId,
          taskId,
          githubPrId: BigInt(data.prId),
          number: data.prNumber,
          title: data.prTitle,
          branchName: data.branchName,
          status: data.status,
          diffSummary: diff ? JSON.parse(JSON.stringify(diff)) : undefined,
        },
        update: {
          title: data.prTitle,
          status: data.status,
          ...(taskId ? { task: { connect: { id: taskId } } } : {}),
          ...(diff ? { diffSummary: JSON.parse(JSON.stringify(diff)) } : {}),
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

      return { pullRequestId: pullRequest.id };
    });

    // Step 5: Trigger AI review for actionable PR events (open/sync/reopen)
    // Only when the PR is linked to a task and the workspace has review credits.
    const data = prData as PRData;
    const storedPullRequestId = (storedPR as { pullRequestId: string })
      .pullRequestId;
    const matched = matchedTaskId as string | null;

    if (
      matched &&
      (data.action === "opened" ||
        data.action === "synchronize" ||
        data.action === "reopened")
    ) {
      const review = await step.run("check-credits-and-trigger", async (): Promise<{
        triggered: boolean;
        reason?: string;
        workspaceId?: string;
        iteration?: number;
        reviewId?: string;
      }> => {
        const repository = await prisma.repository.findUnique({
          where: { id: repositoryId },
          select: { project: { select: { workspaceId: true } } },
        });
        const workspaceId = repository?.project.workspaceId;
        if (!workspaceId) {
          return { triggered: false, reason: "Workspace not found" };
        }

        // Enforce AI review credit limit before triggering
        const subscription = await prisma.billingSubscription.findUnique({
          where: { workspaceId },
        });
        if (subscription) {
          const used = await prisma.usageLog.aggregate({
            where: {
              workspaceId,
              type: "ai_review",
              periodStart: { gte: subscription.billingCycleStart },
              periodEnd: { lte: subscription.billingCycleEnd },
            },
            _sum: { count: true },
          });
          if ((used._sum.count ?? 0) >= subscription.aiReviewCredits) {
            return {
              triggered: false,
              reason: "AI review credit limit reached",
              workspaceId,
            };
          }
        }

        // Count prior completed reviews to compute the next iteration
        const completedReviews = await prisma.aIReview.count({
          where: {
            pullRequestId: storedPullRequestId,
            status: "COMPLETED",
          },
        });
        const newReview = await prisma.aIReview.create({
          data: {
            pullRequestId: storedPullRequestId,
            iteration: completedReviews + 1,
            status: "PENDING",
          },
        });

        return {
          triggered: true,
          workspaceId,
          iteration: completedReviews + 1,
          reviewId: newReview.id,
        };
      });

      if (review.triggered && review.workspaceId) {
        await step.sendEvent("trigger-ai-review", {
          name: "review/pr.review",
          data: {
            pullRequestId: storedPullRequestId,
            repositoryId,
            workspaceId: review.workspaceId,
            iteration: review.iteration ?? 1,
            reviewId: review.reviewId!,
          },
        });
      }
    }

    return {
      status: "completed",
      workflowId: workflow.id,
      pullRequestId: storedPullRequestId,
      matchedTaskId: matched,
    };
  }
);
