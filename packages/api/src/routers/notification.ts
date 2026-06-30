import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";

export const notificationRouter = createTRPCRouter({
  /**
   * List notifications for the current user, newest first.
   * Returns the items plus the user's total unread count.
   */
  list: protectedProcedure
    .input(
      z
        .object({
          limit: z.number().int().min(1).max(100).default(20),
          unreadOnly: z.boolean().optional(),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const limit = input?.limit ?? 20;

      const [items, unreadCount] = await Promise.all([
        ctx.db.notification.findMany({
          where: {
            userId,
            ...(input?.unreadOnly ? { read: false } : {}),
          },
          orderBy: { createdAt: "desc" },
          take: limit,
        }),
        ctx.db.notification.count({
          where: { userId, read: false },
        }),
      ]);

      return { items, unreadCount };
    }),

  /**
   * Mark a single notification as read. Verifies ownership.
   */
  markRead: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const notification = await ctx.db.notification.findUnique({
        where: { id: input.id },
      });

      if (!notification || notification.userId !== ctx.session.user.id) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Notification not found.",
        });
      }

      const updated = await ctx.db.notification.update({
        where: { id: input.id },
        data: { read: true, readAt: new Date() },
      });

      return updated;
    }),

  /**
   * Mark all of the current user's notifications as read.
   */
  markAllRead: protectedProcedure.mutation(async ({ ctx }) => {
    await ctx.db.notification.updateMany({
      where: { userId: ctx.session.user.id, read: false },
      data: { read: true, readAt: new Date() },
    });

    return { success: true };
  }),

  /**
   * Return the count of unread notifications for the current user.
   */
  unreadCount: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.notification.count({
      where: { userId: ctx.session.user.id, read: false },
    });
  }),
});
