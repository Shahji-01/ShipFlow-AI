import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { PRDStatus } from "@shipflow/database";
import {
  createTRPCRouter,
  workspaceProcedure,
  roleGuardedProcedure,
  rateLimitMiddleware,
} from "../trpc";
import { Permission } from "@shipflow/auth/server";
import { inngest } from "@shipflow/inngest";

/**
 * Zod schema for structured PRD content.
 * Validates the JSON shape of a PRD document with all required sections.
 */
const prdContentSchema = z.object({
  problemStatement: z.string().min(1, "Problem statement is required"),
  goals: z.string().min(1, "Goals section is required"),
  nonGoals: z.string().min(1, "Non-goals section is required"),
  userStories: z.string().min(1, "User stories section is required"),
  acceptanceCriteria: z.string().min(1, "Acceptance criteria section is required"),
  edgeCases: z.string().min(1, "Edge cases section is required"),
  successMetrics: z.string().min(1, "Success metrics section is required"),
});

/**
 * PRD tRPC router.
 * Handles PRD retrieval, editing with version history, approval, and generation triggers.
 */
export const prdRouter = createTRPCRouter({
  /**
   * Get PRD by feature request ID.
   * Requires workspace membership (any role can view).
   */
  getByFeature: workspaceProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        featureRequestId: z.string(),
      })
    )
    .query(async ({ ctx, input }) => {
      // Verify the feature request belongs to this workspace
      const featureRequest = await ctx.db.featureRequest.findUnique({
        where: { id: input.featureRequestId },
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

      if (featureRequest.project.workspaceId !== input.workspaceId) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Feature request not found in this workspace.",
        });
      }

      const prd = await ctx.db.pRD.findUnique({
        where: { featureRequestId: input.featureRequestId },
        include: {
          versions: {
            orderBy: { createdAt: "desc" },
            take: 5,
          },
        },
      });

      if (!prd) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "PRD not found for this feature request.",
        });
      }

      return prd;
    }),

  /**
   * Update PRD content.
   * Only Admin or Member roles can edit. Creates a version history entry
   * with the prior content before applying the update.
   */
  update: roleGuardedProcedure(Permission.EDIT_FEATURE_REQUEST)
    .input(
      z.object({
        workspaceId: z.string(),
        featureRequestId: z.string(),
        content: prdContentSchema,
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Verify the feature request belongs to this workspace
      const featureRequest = await ctx.db.featureRequest.findUnique({
        where: { id: input.featureRequestId },
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

      if (featureRequest.project.workspaceId !== input.workspaceId) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Feature request not found in this workspace.",
        });
      }

      // Find the existing PRD
      const existingPrd = await ctx.db.pRD.findUnique({
        where: { featureRequestId: input.featureRequestId },
      });

      if (!existingPrd) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "PRD not found for this feature request.",
        });
      }

      // Cannot edit an approved PRD
      if (existingPrd.status === PRDStatus.APPROVED) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Cannot edit an approved PRD.",
        });
      }

      // Use a transaction to save version history and update atomically
      const updatedPrd = await ctx.db.$transaction(async (tx) => {
        // Create a PRDVersion record with the prior content
        await tx.pRDVersion.create({
          data: {
            prdId: existingPrd.id,
            content: existingPrd.content as object,
            editedBy: ctx.session.user.id,
          },
        });

        // Update the PRD content
        const prd = await tx.pRD.update({
          where: { id: existingPrd.id },
          data: {
            content: input.content,
            status: PRDStatus.DRAFT, // Reset to DRAFT on edit if it was REVISION_NEEDED
          },
        });

        return prd;
      });

      return updatedPrd;
    }),

  /**
   * Approve the PRD.
   * Sets status to APPROVED and records the approval timestamp.
   * Requires workspace membership.
   */
  approve: workspaceProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        featureRequestId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Verify the feature request belongs to this workspace
      const featureRequest = await ctx.db.featureRequest.findUnique({
        where: { id: input.featureRequestId },
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

      if (featureRequest.project.workspaceId !== input.workspaceId) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Feature request not found in this workspace.",
        });
      }

      // Find the existing PRD
      const existingPrd = await ctx.db.pRD.findUnique({
        where: { featureRequestId: input.featureRequestId },
      });

      if (!existingPrd) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "PRD not found for this feature request.",
        });
      }

      // Cannot approve a PRD that's already approved
      if (existingPrd.status === PRDStatus.APPROVED) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "PRD is already approved.",
        });
      }

      const approvedPrd = await ctx.db.pRD.update({
        where: { id: existingPrd.id },
        data: {
          status: PRDStatus.APPROVED,
          approvedAt: new Date(),
        },
      });

      return approvedPrd;
    }),

  /**
   * Get version history of a PRD.
   * Returns all PRDVersion records ordered by createdAt descending.
   * Requires workspace membership.
   */
  getVersionHistory: workspaceProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        featureRequestId: z.string(),
      })
    )
    .query(async ({ ctx, input }) => {
      // Verify the feature request belongs to this workspace
      const featureRequest = await ctx.db.featureRequest.findUnique({
        where: { id: input.featureRequestId },
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

      if (featureRequest.project.workspaceId !== input.workspaceId) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Feature request not found in this workspace.",
        });
      }

      const prd = await ctx.db.pRD.findUnique({
        where: { featureRequestId: input.featureRequestId },
      });

      if (!prd) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "PRD not found for this feature request.",
        });
      }

      const versions = await ctx.db.pRDVersion.findMany({
        where: { prdId: prd.id },
        orderBy: { createdAt: "desc" },
      });

      return versions;
    }),

  /**
   * Request revision of a PRD.
   * Sets the PRD status to REVISION_NEEDED.
   * Requires workspace membership.
   */
  requestRevision: workspaceProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        featureRequestId: z.string(),
        note: z.string().min(1, "Revision note is required"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Verify the feature request belongs to this workspace
      const featureRequest = await ctx.db.featureRequest.findUnique({
        where: { id: input.featureRequestId },
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

      if (featureRequest.project.workspaceId !== input.workspaceId) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Feature request not found in this workspace.",
        });
      }

      // Find the existing PRD
      const existingPrd = await ctx.db.pRD.findUnique({
        where: { featureRequestId: input.featureRequestId },
      });

      if (!existingPrd) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "PRD not found for this feature request.",
        });
      }

      // Cannot request revision on an already revision-needed PRD
      if (existingPrd.status === PRDStatus.REVISION_NEEDED) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "PRD already has a pending revision request.",
        });
      }

      const updatedPrd = await ctx.db.pRD.update({
        where: { id: existingPrd.id },
        data: {
          status: PRDStatus.REVISION_NEEDED,
        },
      });

      return updatedPrd;
    }),

  /**
   * Initiate PRD generation after clarification completes.
   * Checks that all clarifications are answered and no PRD exists yet.
   * Sends an Inngest event to trigger async PRD generation.
   * Requires Admin or Member role.
   */
  generateFromClarification: roleGuardedProcedure(Permission.EDIT_FEATURE_REQUEST)
    .use(rateLimitMiddleware("prd.generate", 10, 60_000))
    .input(
      z.object({
        workspaceId: z.string(),
        featureRequestId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Verify the feature request belongs to this workspace
      const featureRequest = await ctx.db.featureRequest.findUnique({
        where: { id: input.featureRequestId },
        include: {
          clarifications: true,
          project: {
            select: { workspaceId: true },
          },
          prd: true,
        },
      });

      if (!featureRequest) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Feature request not found.",
        });
      }

      if (featureRequest.project.workspaceId !== input.workspaceId) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Feature request not found in this workspace.",
        });
      }

      // Ensure all clarifications are resolved (answered or explicitly skipped)
      const unanswered = featureRequest.clarifications.filter(
        (c) => !c.answer && !c.skipped
      );

      if (unanswered.length > 0) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `All clarification questions must be answered or skipped before generating a PRD. ${unanswered.length} question(s) remain.`,
        });
      }

      // Check if a PRD already exists
      if (featureRequest.prd) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "A PRD has already been generated for this feature request.",
        });
      }

      // Send the Inngest event to trigger PRD generation
      await inngest.send({
        name: "feature/prd.generate",
        data: {
          featureRequestId: input.featureRequestId,
          workspaceId: input.workspaceId,
          userId: ctx.session.user.id,
        },
      });

      return { success: true, message: "PRD generation workflow started." };
    }),
});
