import { z } from "zod";
import { FeaturePhase, IssueCategory, ReviewStatus } from "@shipflow/database";
import { createTRPCRouter, workspaceProcedure } from "../trpc";

const ALL_PHASES: FeaturePhase[] = [
  FeaturePhase.DISCOVERY,
  FeaturePhase.PLANNING,
  FeaturePhase.DEVELOPMENT,
  FeaturePhase.AI_REVIEW,
  FeaturePhase.HUMAN_APPROVAL,
  FeaturePhase.SHIPPED,
  FeaturePhase.FIX_NEEDED,
];

const MS_PER_DAY = 1000 * 60 * 60 * 24;

/**
 * Analytics router — aggregates delivery-lifecycle metrics for a workspace.
 *
 * Surfaces feature throughput, average cycle time, AI-review pass rate, and
 * blocking-issue rate so teams can see how their delivery pipeline performs.
 */
export const analyticsRouter = createTRPCRouter({
  getMetrics: workspaceProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        // Lookback window for throughput, in days.
        windowDays: z.number().int().min(1).max(365).default(30),
      })
    )
    .query(async ({ ctx, input }) => {
      const windowStart = new Date(
        Date.now() - input.windowDays * MS_PER_DAY
      );

      // Feature counts by phase across the workspace.
      const grouped = await ctx.db.featureRequest.groupBy({
        by: ["phase"],
        where: { project: { workspaceId: input.workspaceId } },
        _count: { _all: true },
      });

      const featuresByPhase = Object.fromEntries(
        ALL_PHASES.map((p) => [p, 0])
      ) as Record<FeaturePhase, number>;
      for (const row of grouped) {
        featuresByPhase[row.phase] = row._count._all;
      }

      const totalFeatures = Object.values(featuresByPhase).reduce(
        (a, b) => a + b,
        0
      );

      // Shipped features for cycle-time and throughput calculations.
      const shippedFeatures = await ctx.db.featureRequest.findMany({
        where: {
          phase: FeaturePhase.SHIPPED,
          project: { workspaceId: input.workspaceId },
        },
        select: { createdAt: true, updatedAt: true },
      });

      const shippedInWindow = shippedFeatures.filter(
        (f) => f.updatedAt >= windowStart
      ).length;

      // Average cycle time (days) from creation to shipped.
      const avgCycleTimeDays =
        shippedFeatures.length > 0
          ? shippedFeatures.reduce(
              (sum, f) =>
                sum +
                (f.updatedAt.getTime() - f.createdAt.getTime()) / MS_PER_DAY,
              0
            ) / shippedFeatures.length
          : 0;

      // AI review aggregates (scoped to this workspace's repositories).
      const reviews = await ctx.db.aIReview.findMany({
        where: {
          pullRequest: {
            repository: { project: { workspaceId: input.workspaceId } },
          },
        },
        select: {
          status: true,
          issues: { select: { category: true } },
        },
      });

      const completedReviews = reviews.filter(
        (r) => r.status === ReviewStatus.COMPLETED
      );
      const reviewsWithBlocking = completedReviews.filter((r) =>
        r.issues.some((i) => i.category === IssueCategory.BLOCKING)
      ).length;

      const totalReviews = reviews.length;
      const passRate =
        completedReviews.length > 0
          ? (completedReviews.length - reviewsWithBlocking) /
            completedReviews.length
          : 0;
      const blockingRate =
        completedReviews.length > 0
          ? reviewsWithBlocking / completedReviews.length
          : 0;

      return {
        windowDays: input.windowDays,
        totalFeatures,
        featuresByPhase,
        shipped: {
          total: shippedFeatures.length,
          inWindow: shippedInWindow,
          avgCycleTimeDays: Math.round(avgCycleTimeDays * 10) / 10,
        },
        reviews: {
          total: totalReviews,
          completed: completedReviews.length,
          withBlocking: reviewsWithBlocking,
          passRate: Math.round(passRate * 100), // percentage 0-100
          blockingRate: Math.round(blockingRate * 100),
        },
      };
    }),
});
