import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { FeaturePhase } from "@shipflow/database";
import { Permission } from "@shipflow/auth/server";
import {
  createTRPCRouter,
  workspaceProcedure,
  roleGuardedProcedure,
} from "../trpc";
import { recordActivity } from "../services/activity";

/**
 * All feature phases, used to provide zero-defaults in the stats aggregate.
 */
const ALL_PHASES: FeaturePhase[] = [
  FeaturePhase.DISCOVERY,
  FeaturePhase.PLANNING,
  FeaturePhase.DEVELOPMENT,
  FeaturePhase.AI_REVIEW,
  FeaturePhase.HUMAN_APPROVAL,
  FeaturePhase.SHIPPED,
  FeaturePhase.FIX_NEEDED,
];

export const projectRouter = createTRPCRouter({
  /**
   * List projects for a workspace. Excludes archived projects by default.
   */
  list: workspaceProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        includeArchived: z.boolean().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const projects = await ctx.db.project.findMany({
        where: {
          workspaceId: input.workspaceId,
          ...(input.includeArchived ? {} : { archived: false }),
        },
        include: {
          _count: {
            select: {
              featureRequests: true,
              repositories: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      });

      return projects;
    }),

  /**
   * Get a single project by ID with counts. Verifies workspace ownership.
   */
  getById: workspaceProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        id: z.string(),
      })
    )
    .query(async ({ ctx, input }) => {
      const project = await ctx.db.project.findUnique({
        where: { id: input.id },
        include: {
          _count: {
            select: {
              featureRequests: true,
              repositories: true,
            },
          },
        },
      });

      if (!project || project.workspaceId !== input.workspaceId) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Project not found.",
        });
      }

      return project;
    }),

  /**
   * Create a new project. Requires CREATE_PROJECT permission.
   */
  create: roleGuardedProcedure(Permission.CREATE_PROJECT)
    .input(
      z.object({
        workspaceId: z.string(),
        name: z.string().min(1, "Project name is required").max(100),
        description: z.string().max(500).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const project = await ctx.db.project.create({
        data: {
          workspaceId: input.workspaceId,
          name: input.name,
          description: input.description,
        },
      });

      await recordActivity(ctx.db, {
        workspaceId: input.workspaceId,
        actorId: ctx.session.user.id,
        type: "project.created",
        message: `Created project "${project.name}"`,
        entityType: "project",
        entityId: project.id,
      });

      return project;
    }),

  /**
   * Update a project. Requires EDIT_PROJECT permission. Verifies ownership.
   */
  update: roleGuardedProcedure(Permission.EDIT_PROJECT)
    .input(
      z.object({
        workspaceId: z.string(),
        id: z.string(),
        name: z.string().min(1).max(100).optional(),
        description: z.string().max(500).optional(),
        reviewGuidelines: z.string().max(4000).nullable().optional(),
        archived: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.project.findUnique({
        where: { id: input.id },
      });

      if (!existing || existing.workspaceId !== input.workspaceId) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Project not found.",
        });
      }

      const project = await ctx.db.project.update({
        where: { id: input.id },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.description !== undefined
            ? { description: input.description }
            : {}),
          ...(input.reviewGuidelines !== undefined
            ? { reviewGuidelines: input.reviewGuidelines }
            : {}),
          ...(input.archived !== undefined ? { archived: input.archived } : {}),
        },
      });

      return project;
    }),

  /**
   * Delete a project. Requires EDIT_PROJECT permission. Verifies ownership.
   * Cascade handles children (repositories, feature requests).
   */
  delete: roleGuardedProcedure(Permission.EDIT_PROJECT)
    .input(
      z.object({
        workspaceId: z.string(),
        id: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.project.findUnique({
        where: { id: input.id },
      });

      if (!existing || existing.workspaceId !== input.workspaceId) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Project not found.",
        });
      }

      await ctx.db.project.delete({
        where: { id: input.id },
      });

      await recordActivity(ctx.db, {
        workspaceId: input.workspaceId,
        actorId: ctx.session.user.id,
        type: "project.deleted",
        message: `Deleted project "${existing.name}"`,
        entityType: "project",
        entityId: existing.id,
      });

      return { success: true };
    }),

  /**
   * Feature-request counts grouped by phase across the entire workspace.
   * Returns an object keyed by phase, defaulting missing phases to 0.
   */
  stats: workspaceProcedure
    .input(z.object({ workspaceId: z.string() }))
    .query(async ({ ctx, input }) => {
      const grouped = await ctx.db.featureRequest.groupBy({
        by: ["phase"],
        where: {
          project: {
            workspaceId: input.workspaceId,
          },
        },
        _count: { _all: true },
      });

      const counts = Object.fromEntries(
        ALL_PHASES.map((phase) => [phase, 0])
      ) as Record<FeaturePhase, number>;

      for (const row of grouped) {
        counts[row.phase] = row._count._all;
      }

      return counts;
    }),
});
