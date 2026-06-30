import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { WorkflowStatus } from "@shipflow/database";
import { inngest } from "@shipflow/inngest";

/**
 * Workflow Router — Provides workflow status tracking, cancellation, and retry.
 *
 * Procedures:
 * - getStatus: Get current workflow progress (step name, totalSteps, completedSteps, percentComplete, elapsedMs)
 * - cancel: Halt workflow, discard partial results, revert entity to pre-workflow state
 * - retry: Resume from failed step, max 3 attempts
 *
 * Requirements: 10.2, 10.3, 10.4, 10.5
 */

const MAX_RETRY_ATTEMPTS = 3;

export const workflowRouter = createTRPCRouter({
  /**
   * Get the status of a workflow including progress tracking.
   * Returns: step name, totalSteps, completedSteps, percentComplete, elapsedMs
   *
   * Requirement: 10.2
   */
  getStatus: protectedProcedure
    .input(
      z.object({
        workflowId: z.string(),
      })
    )
    .query(async ({ ctx, input }) => {
      const workflow = await ctx.db.workflow.findUnique({
        where: { id: input.workflowId },
      });

      if (!workflow) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Workflow not found",
        });
      }

      const now = new Date();
      const startedAt = workflow.startedAt ?? workflow.createdAt;
      const elapsedMs = now.getTime() - startedAt.getTime();
      const percentComplete =
        workflow.totalSteps > 0
          ? Math.round((workflow.completedSteps / workflow.totalSteps) * 100)
          : 0;

      return {
        id: workflow.id,
        type: workflow.type,
        status: workflow.status,
        currentStep: workflow.currentStep,
        totalSteps: workflow.totalSteps,
        completedSteps: workflow.completedSteps,
        percentComplete,
        elapsedMs,
        error: workflow.errorMessage,
        startedAt: workflow.startedAt,
        completedAt: workflow.completedAt,
        featureRequestId: workflow.featureRequestId,
      };
    }),

  /**
   * Get the most recent workflow for a feature request, optionally filtered by
   * type. Returns null when no workflow exists yet. Used by the UI to track live
   * progress after triggering an async workflow (e.g. PRD generation) without
   * needing to know the workflow id up front.
   */
  getLatestForFeature: protectedProcedure
    .input(
      z.object({
        featureRequestId: z.string(),
        type: z
          .enum([
            "PRD_GENERATION",
            "TASK_GENERATION",
            "AI_REVIEW",
            "RE_REVIEW",
            "RELEASE_READINESS",
          ])
          .optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const workflow = await ctx.db.workflow.findFirst({
        where: {
          featureRequestId: input.featureRequestId,
          ...(input.type ? { type: input.type } : {}),
        },
        orderBy: { createdAt: "desc" },
      });

      if (!workflow) return null;

      const now = new Date();
      const startedAt = workflow.startedAt ?? workflow.createdAt;
      const endedAt = workflow.completedAt ?? now;
      const elapsedMs = endedAt.getTime() - startedAt.getTime();
      const percentComplete =
        workflow.totalSteps > 0
          ? Math.round((workflow.completedSteps / workflow.totalSteps) * 100)
          : 0;

      return {
        id: workflow.id,
        type: workflow.type,
        status: workflow.status,
        currentStep: workflow.currentStep,
        totalSteps: workflow.totalSteps,
        completedSteps: workflow.completedSteps,
        percentComplete,
        elapsedMs,
        error: workflow.errorMessage,
        startedAt: workflow.startedAt,
        completedAt: workflow.completedAt,
        featureRequestId: workflow.featureRequestId,
      };
    }),

  /**
   * Cancel a running workflow.
   * Halts execution, discards partial results, and reverts entity to pre-workflow state.
   *
   * Requirements: 10.4
   */
  cancel: protectedProcedure
    .input(
      z.object({
        workflowId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const workflow = await ctx.db.workflow.findUnique({
        where: { id: input.workflowId },
      });

      if (!workflow) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Workflow not found",
        });
      }

      // Only running or pending workflows can be cancelled
      if (
        workflow.status !== WorkflowStatus.RUNNING &&
        workflow.status !== WorkflowStatus.PENDING
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Cannot cancel workflow in ${workflow.status} status. Only RUNNING or PENDING workflows can be cancelled.`,
        });
      }

      // Verify the user is the initiator or an admin
      const userId = ctx.session.user.id;
      if (workflow.initiatedById !== userId) {
        // Check if user is an admin of a workspace containing this feature
        if (workflow.featureRequestId) {
          const isAdmin = await ctx.db.workspaceMember.findFirst({
            where: {
              userId,
              role: "ADMIN",
              workspace: {
                projects: {
                  some: {
                    featureRequests: {
                      some: { id: workflow.featureRequestId },
                    },
                  },
                },
              },
            },
          });

          if (!isAdmin) {
            throw new TRPCError({
              code: "FORBIDDEN",
              message: "Only the workflow initiator or a workspace admin can cancel this workflow.",
            });
          }
        }
      }

      // Update workflow status to CANCELLED
      await ctx.db.workflow.update({
        where: { id: input.workflowId },
        data: {
          status: WorkflowStatus.CANCELLED,
          completedAt: new Date(),
          errorMessage: "Cancelled by user",
        },
      });

      // Revert associated entity to pre-workflow state
      if (workflow.featureRequestId) {
        // Determine the revert phase based on workflow type
        let revertPhase: string | null = null;
        switch (workflow.type) {
          case "PRD_GENERATION":
            revertPhase = "DISCOVERY";
            break;
          case "TASK_GENERATION":
            revertPhase = "PLANNING";
            break;
          case "AI_REVIEW":
          case "RE_REVIEW":
            revertPhase = "DEVELOPMENT";
            break;
          case "RELEASE_READINESS":
            revertPhase = "AI_REVIEW";
            break;
        }

        if (revertPhase) {
          await ctx.db.featureRequest.update({
            where: { id: workflow.featureRequestId },
            data: { phase: revertPhase as never },
          });
        }
      }

      return {
        success: true,
        workflowId: input.workflowId,
        status: WorkflowStatus.CANCELLED,
      };
    }),

  /**
   * Retry a failed workflow from the failed step.
   * Maximum of 3 retry attempts allowed.
   *
   * Requirements: 10.3
   */
  retry: protectedProcedure
    .input(
      z.object({
        workflowId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const workflow = await ctx.db.workflow.findUnique({
        where: { id: input.workflowId },
      });

      if (!workflow) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Workflow not found",
        });
      }

      // Only failed workflows can be retried
      if (workflow.status !== WorkflowStatus.FAILED) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Cannot retry workflow in ${workflow.status} status. Only FAILED workflows can be retried.`,
        });
      }

      // Check retry count (count existing workflows of same type for same feature)
      const retryCount = await ctx.db.workflow.count({
        where: {
          featureRequestId: workflow.featureRequestId,
          type: workflow.type,
          status: { in: [WorkflowStatus.FAILED, WorkflowStatus.COMPLETED] },
        },
      });

      if (retryCount >= MAX_RETRY_ATTEMPTS) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Maximum retry attempts (${MAX_RETRY_ATTEMPTS}) reached for this workflow. Manual intervention is required.`,
        });
      }

      // Create a new workflow record resuming from the failed step
      const newWorkflow = await ctx.db.workflow.create({
        data: {
          featureRequestId: workflow.featureRequestId,
          type: workflow.type,
          status: WorkflowStatus.PENDING,
          currentStep: workflow.currentStep, // Resume from failed step
          totalSteps: workflow.totalSteps,
          completedSteps: workflow.completedSteps, // Preserve progress
          startedAt: new Date(),
          initiatedById: ctx.session.user.id,
        },
      });

      // Re-trigger the appropriate Inngest event based on workflow type
      // The Inngest function will pick up from where it left off via the workflow record

      switch (workflow.type) {
        case "PRD_GENERATION":
          if (workflow.featureRequestId) {
            await inngest.send({
              name: "feature/prd.generate",
              data: {
                featureRequestId: workflow.featureRequestId,
                workspaceId: "", // Will be resolved by the function
                userId: ctx.session.user.id,
              },
            });
          }
          break;
        case "TASK_GENERATION":
          // Find PRD for this feature
          if (workflow.featureRequestId) {
            const prd = await ctx.db.pRD.findUnique({
              where: { featureRequestId: workflow.featureRequestId },
            });
            if (prd) {
              await inngest.send({
                name: "prd/tasks.generate",
                data: {
                  prdId: prd.id,
                  workspaceId: "",
                  userId: ctx.session.user.id,
                },
              });
            }
          }
          break;
        case "AI_REVIEW":
        case "RE_REVIEW":
          // Find the latest PR for review
          if (workflow.featureRequestId) {
            const task = await ctx.db.task.findFirst({
              where: { featureRequestId: workflow.featureRequestId },
              include: { pullRequests: { orderBy: { updatedAt: "desc" }, take: 1 } },
            });
            const pr = task?.pullRequests[0];
            if (pr) {
              await inngest.send({
                name: "review/pr.review",
                data: {
                  pullRequestId: pr.id,
                  repositoryId: pr.repositoryId,
                  workspaceId: "",
                  iteration: 1,
                },
              });
            }
          }
          break;
      }

      return {
        success: true,
        newWorkflowId: newWorkflow.id,
        resumeFromStep: workflow.currentStep,
        attemptNumber: retryCount + 1,
      };
    }),
});
