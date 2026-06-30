import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";

export const userRouter = createTRPCRouter({
  /**
   * Return the current authenticated user's profile.
   */
  me: protectedProcedure.query(async ({ ctx }) => {
    const user = await ctx.db.user.findUnique({
      where: { id: ctx.session.user.id },
      select: {
        id: true,
        email: true,
        name: true,
        avatarUrl: true,
        notificationPrefs: true,
      },
    });

    if (!user) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "User not found.",
      });
    }

    return user;
  }),

  /**
   * Return which OAuth providers the current user has linked (e.g. GitHub).
   */
  connections: protectedProcedure.query(async ({ ctx }) => {
    const accounts = await ctx.db.account.findMany({
      where: { userId: ctx.session.user.id },
      select: { provider: true, scope: true },
    });
    const github = accounts.find((a) => a.provider === "github");
    const githubScopes =
      github?.scope?.split(",").map((s) => s.trim().toLowerCase()) ?? [];
    // Repository tracking / PR reviews require the `repo` scope. An identity
    // -only link (read:user, user:email) is not a usable GitHub connection.
    const githubRepoAccess = githubScopes.includes("repo");
    return {
      github: !!github,
      githubRepoAccess,
    };
  }),

  /**
   * Update the current user's profile (name and/or avatar).
   */
  updateProfile: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(100).optional(),
        avatarUrl: z.string().url().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.db.user.update({
        where: { id: ctx.session.user.id },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.avatarUrl !== undefined
            ? { avatarUrl: input.avatarUrl }
            : {}),
        },
        select: {
          id: true,
          email: true,
          name: true,
          avatarUrl: true,
          notificationPrefs: true,
        },
      });

      return user;
    }),

  /**
   * Update the current user's notification preferences (a map of boolean flags).
   */
  updateNotificationPrefs: protectedProcedure
    .input(
      z.object({
        prefs: z.record(z.string(), z.boolean()),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.db.user.update({
        where: { id: ctx.session.user.id },
        data: { notificationPrefs: input.prefs },
        select: { notificationPrefs: true },
      });

      return user.notificationPrefs;
    }),
});
