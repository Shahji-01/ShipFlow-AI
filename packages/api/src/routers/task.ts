import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { TaskStatus, FeaturePhase, type PrismaClient } from "@shipflow/database";
import { createTRPCRouter, workspaceProcedure } from "../trpc";
import { inngest } from "@shipflow/inngest";
import { transitionFeature } from "../lib/state-machine";

/**
 * Zod schema for task title validation (1-120 characters).
 */
const titleSchema = z
  .string()
  .min(1, "Title is required")
  .max(120, "Title cannot exceed 120 characters");

/**
 * Zod schema for task description validation (non-empty).
 */
const descriptionSchema = z
  .string()
  .min(1, "Description is required");

/**
 * Zod schema for task acceptance criteria validation (non-empty).
 */
const acceptanceCriteriaSchema = z
  .string()
  .min(1, "Acceptance criteria is required");

/**
 * Helper to verify a feature request belongs to the given workspace.
 * Returns the feature request with its project, or throws NOT_FOUND.
 */
async function verifyFeatureRequestInWorkspace(
  db: PrismaClient,
  featureRequestId: string,
  workspaceId: string
) {
  const featureRequest = await db.featureRequest.findUnique({
    where: { id: featureRequestId },
    include: {
      project: {
        select: { workspaceId: true },
      },
    },
  });

  if (!featureRequest) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Feature request not found.",
    });
  }

  if (featureRequest.project.workspaceId !== workspaceId) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Feature request not found in this workspace.",
    });
  }

  return featureRequest;
}

/**
 * Task tRPC router.
 * Handles task CRUD, Kanban board operations, and task plan generation/approval.
 */
export const taskRouter = createTRPCRouter({
  /**
   * List tasks for a feature request, ordered by `order` field.
   * Requires workspace membership.
   */
  list: workspaceProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        featureRequestId: z.string(),
        status: z.nativeEnum(TaskStatus).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      await verifyFeatureRequestInWorkspace(
        ctx.db,
        input.featureRequestId,
        input.workspaceId
      );

      const where: Record<string, unknown> = {
        featureRequestId: input.featureRequestId,
      };

      if (input.status) {
        where.status = input.status;
      }

      const tasks = await ctx.db.task.findMany({
        where,
        orderBy: { order: "asc" },
      });

      return tasks;
    }),

  /**
   * Create a task manually.
   * Validates title (1-120 chars), description (non-empty), acceptanceCriteria (non-empty).
   * New tasks are placed in BACKLOG status.
   */
  create: workspaceProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        featureRequestId: z.string(),
        title: titleSchema,
        description: descriptionSchema,
        acceptanceCriteria: acceptanceCriteriaSchema,
      })
    )
    .mutation(async ({ ctx, input }) => {
      await verifyFeatureRequestInWorkspace(
        ctx.db,
        input.featureRequestId,
        input.workspaceId
      );

      // Get the highest order value for this feature request to place new task at end
      const lastTask = await ctx.db.task.findFirst({
        where: { featureRequestId: input.featureRequestId },
        orderBy: { order: "desc" },
        select: { order: true },
      });

      const nextOrder = (lastTask?.order ?? -1) + 1;

      const task = await ctx.db.task.create({
        data: {
          featureRequestId: input.featureRequestId,
          title: input.title,
          description: input.description,
          acceptanceCriteria: input.acceptanceCriteria,
          status: TaskStatus.BACKLOG,
          order: nextOrder,
        },
      });

      return task;
    }),

  /**
   * Update task title, description, acceptanceCriteria, or linkedBranch.
   * Requires workspace membership.
   */
  update: workspaceProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        id: z.string(),
        title: titleSchema.optional(),
        description: descriptionSchema.optional(),
        acceptanceCriteria: acceptanceCriteriaSchema.optional(),
        linkedBranch: z.string().nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Verify the task exists and belongs to the workspace
      const task = await ctx.db.task.findUnique({
        where: { id: input.id },
        include: {
          featureRequest: {
            include: {
              project: {
                select: { workspaceId: true },
              },
            },
          },
        },
      });

      if (!task) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Task not found.",
        });
      }

      if (task.featureRequest.project.workspaceId !== input.workspaceId) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Task not found in this workspace.",
        });
      }

      const data: Record<string, unknown> = {};
      if (input.title !== undefined) data.title = input.title;
      if (input.description !== undefined) data.description = input.description;
      if (input.acceptanceCriteria !== undefined)
        data.acceptanceCriteria = input.acceptanceCriteria;
      if (input.linkedBranch !== undefined)
        data.linkedBranch = input.linkedBranch;

      const updated = await ctx.db.task.update({
        where: { id: input.id },
        data,
      });

      return updated;
    }),

  /**
   * Move task to a different status column (Kanban operation).
   * Valid statuses: BACKLOG, IN_PROGRESS, IN_REVIEW, DONE.
   */
  move: workspaceProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        id: z.string(),
        status: z.nativeEnum(TaskStatus),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Verify the task exists and belongs to the workspace
      const task = await ctx.db.task.findUnique({
        where: { id: input.id },
        include: {
          featureRequest: {
            include: {
              project: {
                select: { workspaceId: true },
              },
            },
          },
        },
      });

      if (!task) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Task not found.",
        });
      }

      if (task.featureRequest.project.workspaceId !== input.workspaceId) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Task not found in this workspace.",
        });
      }

      const updated = await ctx.db.task.update({
        where: { id: input.id },
        data: { status: input.status },
      });

      return updated;
    }),

  /**
   * Reorder task position within the same column.
   * Updates the order field to the new position.
   */
  reorder: workspaceProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        id: z.string(),
        newOrder: z.number().int().min(0),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Verify the task exists and belongs to the workspace
      const task = await ctx.db.task.findUnique({
        where: { id: input.id },
        include: {
          featureRequest: {
            include: {
              project: {
                select: { workspaceId: true },
              },
            },
          },
        },
      });

      if (!task) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Task not found.",
        });
      }

      if (task.featureRequest.project.workspaceId !== input.workspaceId) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Task not found in this workspace.",
        });
      }

      const oldOrder = task.order;
      const newOrder = input.newOrder;

      if (oldOrder === newOrder) {
        return task;
      }

      // Shift other tasks in the same status column to make room
      if (newOrder < oldOrder) {
        // Moving up: shift tasks between newOrder and oldOrder-1 down by 1
        await ctx.db.task.updateMany({
          where: {
            featureRequestId: task.featureRequestId,
            status: task.status,
            order: { gte: newOrder, lt: oldOrder },
          },
          data: { order: { increment: 1 } },
        });
      } else {
        // Moving down: shift tasks between oldOrder+1 and newOrder up by 1
        await ctx.db.task.updateMany({
          where: {
            featureRequestId: task.featureRequestId,
            status: task.status,
            order: { gt: oldOrder, lte: newOrder },
          },
          data: { order: { decrement: 1 } },
        });
      }

      const updated = await ctx.db.task.update({
        where: { id: input.id },
        data: { order: newOrder },
      });

      return updated;
    }),

  /**
   * Delete a task.
   * Requires workspace membership.
   */
  delete: workspaceProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        id: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Verify the task exists and belongs to the workspace
      const task = await ctx.db.task.findUnique({
        where: { id: input.id },
        include: {
          featureRequest: {
            include: {
              project: {
                select: { workspaceId: true },
              },
            },
          },
        },
      });

      if (!task) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Task not found.",
        });
      }

      if (task.featureRequest.project.workspaceId !== input.workspaceId) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Task not found in this workspace.",
        });
      }

      await ctx.db.task.delete({
        where: { id: input.id },
      });

      return { success: true };
    }),

  /**
   * Trigger task generation workflow from PRD.
   * Sends `prd/tasks.generate` event to Inngest.
   * Requires workspace membership.
   */
  generateFromPRD: workspaceProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        featureRequestId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const _featureRequest = await verifyFeatureRequestInWorkspace(
        ctx.db,
        input.featureRequestId,
        input.workspaceId
      );

      // Verify a PRD exists for this feature request
      const prd = await ctx.db.pRD.findUnique({
        where: { featureRequestId: input.featureRequestId },
      });

      if (!prd) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "A PRD must exist before generating tasks.",
        });
      }

      // Send the Inngest event to trigger task generation
      await inngest.send({
        name: "prd/tasks.generate",
        data: {
          prdId: prd.id,
          workspaceId: input.workspaceId,
          userId: ctx.session.user.id,
        },
      });

      return { success: true, message: "Task generation workflow started." };
    }),

  /**
   * Approve the task plan.
   * Transitions the feature from PLANNING to DEVELOPMENT phase.
   * Requires workspace membership.
   */
  approveTaskPlan: workspaceProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        featureRequestId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const featureRequest = await verifyFeatureRequestInWorkspace(
        ctx.db,
        input.featureRequestId,
        input.workspaceId
      );

      // Validate the transition using the state machine
      const targetPhase = transitionFeature(
        featureRequest.phase,
        FeaturePhase.DEVELOPMENT
      );

      // Update the feature request phase
      const updated = await ctx.db.featureRequest.update({
        where: { id: input.featureRequestId },
        data: { phase: targetPhase },
      });

      return updated;
    }),

  /**
   * Reject the task plan with optional guidance notes.
   * Triggers regeneration of tasks.
   * Requires workspace membership.
   */
  rejectTaskPlan: workspaceProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        featureRequestId: z.string(),
        guidanceNotes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const featureRequest = await verifyFeatureRequestInWorkspace(
        ctx.db,
        input.featureRequestId,
        input.workspaceId
      );

      // Feature must be in PLANNING phase to reject task plan
      if (featureRequest.phase !== FeaturePhase.PLANNING) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "Task plan can only be rejected during the PLANNING phase.",
        });
      }

      // Verify a PRD exists for this feature request
      const prd = await ctx.db.pRD.findUnique({
        where: { featureRequestId: input.featureRequestId },
      });

      if (!prd) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "A PRD must exist before regenerating tasks.",
        });
      }

      // Delete existing tasks for regeneration
      await ctx.db.task.deleteMany({
        where: { featureRequestId: input.featureRequestId },
      });

      // Trigger regeneration via Inngest
      await inngest.send({
        name: "prd/tasks.generate",
        data: {
          prdId: prd.id,
          workspaceId: input.workspaceId,
          userId: ctx.session.user.id,
        },
      });

      return {
        success: true,
        message: "Task plan rejected. Regeneration started.",
        guidanceNotes: input.guidanceNotes ?? null,
      };
    }),
});
