import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  ReviewStatus,
  IssueCategory,
  FeaturePhase,
} from "@shipflow/database";
import { createTRPCRouter, workspaceProcedure, rateLimitMiddleware } from "../trpc";
import { inngest } from "@shipflow/inngest";
import { transitionFeature } from "../lib/state-machine";
import { runQAReview, type QAReviewContext } from "../services/qa-agent";
import { createOctokit, fetchDiff } from "../services/github";
import { checkUsageLimit, USAGE_TYPES } from "../services/billing";

/**
 * Maximum number of successful review iterations per pull request.
 * Only COMPLETED reviews count toward this limit.
 * Requirements: 5.5
 */
const MAX_ITERATIONS = 5;

/**
 * Review tRPC router.
 * Manages AI-powered code review lifecycle including triggering reviews,
 * tracking iterations, posting GitHub comments, and handling failures.
 *
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 5.9
 */
export const reviewRouter = createTRPCRouter({
  /**
   * Get the review history for a pull request.
   * Returns all reviews with their issues, ordered by iteration.
   * Requirement: 5.8
   */
  getReviewHistory: workspaceProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        pullRequestId: z.string(),
      })
    )
    .query(async ({ ctx, input }) => {
      // Verify PR belongs to a repository in this workspace
      const pullRequest = await ctx.db.pullRequest.findUnique({
        where: { id: input.pullRequestId },
        include: {
          repository: {
            include: {
              project: {
                select: { workspaceId: true },
              },
            },
          },
        },
      });

      if (!pullRequest) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Pull request not found.",
        });
      }

      if (pullRequest.repository.project.workspaceId !== input.workspaceId) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Pull request not found in this workspace.",
        });
      }

      const reviews = await ctx.db.aIReview.findMany({
        where: { pullRequestId: input.pullRequestId },
        include: {
          issues: {
            orderBy: { createdAt: "asc" },
          },
        },
        orderBy: { iteration: "asc" },
      });

      return {
        pullRequest: {
          id: pullRequest.id,
          number: pullRequest.number,
          title: pullRequest.title,
          branchName: pullRequest.branchName,
          status: pullRequest.status,
        },
        reviews: reviews.map((review) => ({
          id: review.id,
          iteration: review.iteration,
          status: review.status,
          startedAt: review.startedAt,
          completedAt: review.completedAt,
          errorMessage: review.errorMessage,
          createdAt: review.createdAt,
          issues: review.issues.map((issue) => ({
            id: issue.id,
            category: issue.category,
            filePath: issue.filePath,
            lineNumber: issue.lineNumber,
            title: issue.title,
            description: issue.description,
            resolved: issue.resolved,
            resolvedAt: issue.resolvedAt,
          })),
          blockingCount: review.issues.filter(
            (i) => i.category === IssueCategory.BLOCKING
          ).length,
          nonBlockingCount: review.issues.filter(
            (i) => i.category === IssueCategory.NON_BLOCKING
          ).length,
        })),
        totalIterations: reviews.filter(
          (r) => r.status === ReviewStatus.COMPLETED
        ).length,
        maxIterations: MAX_ITERATIONS,
      };
    }),

  /**
   * Trigger an AI review for a pull request.
   * Creates a new review record and runs the QA Agent.
   * Posts results as GitHub comments and transitions feature phase.
   *
   * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7
   */
  triggerReview: workspaceProcedure
    .use(rateLimitMiddleware("review.trigger", 20, 60_000))
    .input(
      z.object({
        workspaceId: z.string(),
        pullRequestId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Verify PR belongs to this workspace
      const pullRequest = await ctx.db.pullRequest.findUnique({
        where: { id: input.pullRequestId },
        include: {
          repository: {
            include: {
              project: {
                select: { workspaceId: true, id: true },
              },
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

      if (!pullRequest) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Pull request not found.",
        });
      }

      if (pullRequest.repository.project.workspaceId !== input.workspaceId) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Pull request not found in this workspace.",
        });
      }

      // Check iteration limit - only count COMPLETED reviews (Requirement 5.5)
      const completedReviews = await ctx.db.aIReview.count({
        where: {
          pullRequestId: input.pullRequestId,
          status: ReviewStatus.COMPLETED,
        },
      });

      if (completedReviews >= MAX_ITERATIONS) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `Maximum review iterations (${MAX_ITERATIONS}) reached for this pull request. Manual intervention is required.`,
        });
      }

      // Enforce the workspace's monthly AI review credit limit (Requirement 9.2).
      // Usage is recorded by the ai-review workflow on completion; here we block
      // new reviews once the plan's credits are exhausted.
      const usage = await checkUsageLimit(
        ctx.db,
        input.workspaceId,
        USAGE_TYPES.AI_REVIEW
      );
      if (!usage.allowed) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message:
            usage.message ??
            "AI review credit limit reached for this billing cycle.",
        });
      }

      // Determine the next iteration number
      const nextIteration = completedReviews + 1;

      // Create a new review record in PENDING status
      const review = await ctx.db.aIReview.create({
        data: {
          pullRequestId: input.pullRequestId,
          iteration: nextIteration,
          status: ReviewStatus.PENDING,
        },
      });

      // Send Inngest event for async processing
      await inngest.send({
        name: "review/pr.review",
        data: {
          pullRequestId: input.pullRequestId,
          repositoryId: pullRequest.repositoryId,
          workspaceId: input.workspaceId,
          iteration: nextIteration,
        },
      });

      return {
        reviewId: review.id,
        iteration: nextIteration,
        status: review.status,
        message: "AI review triggered successfully.",
      };
    }),

  /**
   * Retry a failed review without counting toward iteration limit.
   * Only allows retrying reviews that are in FAILED status.
   *
   * Requirement: 5.9
   */
  retryReview: workspaceProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        reviewId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Find the failed review
      const review = await ctx.db.aIReview.findUnique({
        where: { id: input.reviewId },
        include: {
          pullRequest: {
            include: {
              repository: {
                include: {
                  project: {
                    select: { workspaceId: true },
                  },
                },
              },
            },
          },
        },
      });

      if (!review) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Review not found.",
        });
      }

      if (review.pullRequest.repository.project.workspaceId !== input.workspaceId) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Review not found in this workspace.",
        });
      }

      if (review.status !== ReviewStatus.FAILED) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Only failed reviews can be retried.",
        });
      }

      // Reset the review to PENDING status for retry
      // Failed attempts don't count toward iteration limit (Requirement 5.9)
      await ctx.db.aIReview.update({
        where: { id: input.reviewId },
        data: {
          status: ReviewStatus.PENDING,
          errorMessage: null,
          startedAt: null,
          completedAt: null,
        },
      });

      // Send Inngest event to re-process this review
      await inngest.send({
        name: "review/pr.review",
        data: {
          pullRequestId: review.pullRequestId,
          repositoryId: review.pullRequest.repositoryId,
          workspaceId: input.workspaceId,
          iteration: review.iteration,
        },
      });

      return {
        reviewId: review.id,
        iteration: review.iteration,
        status: ReviewStatus.PENDING,
        message: "Review retry triggered. Failed attempts do not count toward the iteration limit.",
      };
    }),
});
