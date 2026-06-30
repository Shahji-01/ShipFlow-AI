import { z } from "zod";
import { createTRPCRouter, workspaceProcedure } from "../trpc";

export const activityRouter = createTRPCRouter({
  /**
   * List recent activities for a workspace, newest first.
   * Cursor-paginated for infinite scroll.
   */
  list: workspaceProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        limit: z.number().int().min(1).max(50).default(20),
        cursor: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const activities = await ctx.db.activity.findMany({
        where: { workspaceId: input.workspaceId },
        include: {
          actor: {
            select: {
              id: true,
              name: true,
              email: true,
              avatarUrl: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: input.limit + 1,
        ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
      });

      let nextCursor: string | undefined;
      if (activities.length > input.limit) {
        const next = activities.pop();
        nextCursor = next?.id;
      }

      return { items: activities, nextCursor };
    }),
});
