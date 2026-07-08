import { inngest } from "../client";
import prisma, {
  WorkflowStatus,
  WorkflowType,
  FeaturePhase,
  IssueCategory,
  ReviewStatus,
  TaskStatus,
} from "@shipflow/database";

/**
 * Release Readiness Inngest Workflow
 *
 * Steps: aggregate reviews → check blocking → transition → notify
 * Checks if a feature is ready for human approval by verifying no blocking issues remain.
 *
 * Requirements: 4.2, 4.3, 10.1
 */

const TOTAL_STEPS = 4;

interface ReviewData {
  totalReviews: number;
  latestReviewId: string | null;
  latestIteration: number;
  allIssues: Array<{ id: string; category: string; resolved: boolean }>;
}

interface BlockingCheck {
  hasBlockingIssues: boolean;
  blockingCount: number;
  totalIssues: number;
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

export const releaseReadiness = inngest.createFunction(
  {
    id: "release-readiness",
    name: "Release Readiness Check",
    retries: 3,
  },
  { event: "review/completed" },
  async ({ event, step }) => {
    const { pullRequestId, workspaceId } = event.data;

    // Create workflow record
    const workflow = await step.run("create-workflow", async () => {
      const pr = await prisma.pullRequest.findUnique({
        where: { id: pullRequestId },
        include: { task: { select: { featureRequestId: true } } },
      });

      return await prisma.workflow.create({
        data: {
          featureRequestId: pr?.task?.featureRequestId ?? null,
          type: WorkflowType.RELEASE_READINESS,
          status: WorkflowStatus.RUNNING,
          currentStep: "aggregate-reviews",
          totalSteps: TOTAL_STEPS,
          completedSteps: 0,
          startedAt: new Date(),
          initiatedById: "system",
        },
      });
    });

    // Step 1: Aggregate reviews for the PR
    const reviewData = await step.run("aggregate-reviews", async (): Promise<ReviewData> => {
      await updateWorkflowProgress(workflow.id, "aggregate-reviews", 0, WorkflowStatus.RUNNING);

      const reviews = await prisma.aIReview.findMany({
        where: {
          pullRequestId,
          status: ReviewStatus.COMPLETED,
        },
        include: {
          issues: true,
        },
        orderBy: { iteration: "desc" },
      });

      const latestReview = reviews[0];

      return {
        totalReviews: reviews.length,
        latestReviewId: latestReview?.id ?? null,
        latestIteration: latestReview?.iteration ?? 0,
        allIssues: (latestReview?.issues ?? []).map((issue) => ({
          id: issue.id,
          category: issue.category,
          resolved: issue.resolved,
        })),
      };
    });

    // Step 2: Check for blocking issues
    const blockingCheck = await step.run("check-blocking", async (): Promise<BlockingCheck> => {
      await updateWorkflowProgress(workflow.id, "check-blocking", 1);

      const data = reviewData as ReviewData;
      const unresolvedBlocking = data.allIssues.filter(
        (issue) => issue.category === IssueCategory.BLOCKING && !issue.resolved
      );

      return {
        hasBlockingIssues: unresolvedBlocking.length > 0,
        blockingCount: unresolvedBlocking.length,
        totalIssues: data.allIssues.length,
      };
    });

    // Step 3: Transition feature status
    const transitionResult = await step.run("transition-status", async () => {
      await updateWorkflowProgress(workflow.id, "transition-status", 2);

      const check = blockingCheck as BlockingCheck;

      // Get the feature request associated with this PR
      const pr = await prisma.pullRequest.findUnique({
        where: { id: pullRequestId },
        include: {
          task: {
            include: {
              featureRequest: true,
            },
          },
        },
      });

      const featureRequest = pr?.task?.featureRequest;
      if (!featureRequest) {
        return { transitioned: false, reason: "No associated feature request" };
      }

      if (!check.hasBlockingIssues) {
        // No blocking issues on this PR — check if other tasks remain
        const pendingTasks = await prisma.task.count({
          where: {
            featureRequestId: featureRequest.id,
            status: { in: [TaskStatus.BACKLOG, TaskStatus.IN_PROGRESS] },
          },
        });

        if (pendingTasks > 0) {
          // Stay in development
          return { transitioned: true, newPhase: FeaturePhase.DEVELOPMENT };
        }

        // All tasks done — transition to HUMAN_APPROVAL
        await prisma.featureRequest.update({
          where: { id: featureRequest.id },
          data: { phase: FeaturePhase.HUMAN_APPROVAL },
        });
        return { transitioned: true, newPhase: FeaturePhase.HUMAN_APPROVAL };
      } else {
        // Blocking issues remain — keep in FIX_NEEDED
        await prisma.featureRequest.update({
          where: { id: featureRequest.id },
          data: { phase: FeaturePhase.FIX_NEEDED },
        });
        return { transitioned: true, newPhase: FeaturePhase.FIX_NEEDED };
      }
    });

    // Step 4: Notify workspace members
    await step.run("notify", async () => {
      await updateWorkflowProgress(workflow.id, "notify", 3);

      const check = blockingCheck as BlockingCheck;

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
        notified: true,
        readyForApproval: !check.hasBlockingIssues,
      };
    });

    const check = blockingCheck as BlockingCheck;

    // Notify the right people based on the outcome, via the central dispatcher.
    // - Ready  → notify approvers/admins (respects "approvalRequested" pref)
    // - Blocked → notify the feature creator (respects "aiReviewComplete" pref)
    if (workflow.featureRequestId) {
      const ready = !check.hasBlockingIssues;
      await step.sendEvent("notify-release-readiness", {
        name: "notify/dispatch",
        data: {
          workspaceId,
          featureRequestId: workflow.featureRequestId,
          target: ready
            ? { roles: ["APPROVER", "ADMIN"] }
            : { includeFeatureCreator: true },
          type: ready ? "approval_requested" : "ai_review",
          title: ready
            ? "Feature awaiting your approval"
            : "AI review requested changes",
          body: ready
            ? "A feature passed AI review with no blocking issues and is ready for human approval."
            : `AI review found ${check.blockingCount} blocking issue(s) that need to be fixed.`,
          link: ready ? "/approvals" : "/reviews",
          prefKey: ready ? "approvalRequested" : "aiReviewComplete",
          activity: {
            type: ready
              ? "feature.awaiting_approval"
              : "review.changes_requested",
            message: ready
              ? "Feature passed AI review and is awaiting human approval"
              : `AI review requested changes (${check.blockingCount} blocking issue(s))`,
            entityType: "feature",
            entityId: workflow.featureRequestId,
          },
        },
      });
    }

    return {
      status: "completed",
      workflowId: workflow.id,
      readyForApproval: !check.hasBlockingIssues,
      blockingIssues: check.blockingCount,
      transition: transitionResult,
    };
  }
);
