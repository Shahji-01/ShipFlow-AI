import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { type PrismaClient, type WorkspaceRole } from "@shipflow/database";
import { hasPermission, type Permission } from "@shipflow/auth/server";
import { z } from "zod";
import { rateLimitAsync, getClientIp } from "./lib/rate-limit";

/**
 * Session shape from BetterAuth.
 */
export interface Session {
  user: {
    id: string;
    email: string;
    name: string | null;
  };
}

/**
 * Context for tRPC procedures.
 * Includes database client, optional session, and request headers.
 */
export interface Context {
  db: PrismaClient;
  session: Session | null;
  headers: Headers;
}

/**
 * Initialize tRPC with superjson transformer for rich type serialization.
 */
const t = initTRPC.context<Context>().create({
  transformer: superjson,
});

/**
 * Export reusable router and procedure helpers.
 */
export const createTRPCRouter = t.router;
export const createCallerFactory = t.createCallerFactory;
export const publicProcedure = t.procedure;

/**
 * Auth middleware - validates that a session exists.
 * Throws UNAUTHORIZED if no session is present.
 */
const authMiddleware = t.middleware(async ({ ctx, next }) => {
  if (!ctx.session) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "You must be logged in to access this resource.",
    });
  }
  return next({
    ctx: {
      ...ctx,
      session: ctx.session,
    },
  });
});

/**
 * Protected procedure - requires authenticated session.
 */
export const protectedProcedure = t.procedure.use(authMiddleware);

/**
 * Workspace middleware - validates workspace membership.
 * Requires `workspaceId` in the procedure input.
 * Adds `membership` (with role) to the context.
 */
const workspaceMiddleware = t.middleware(async ({ ctx, next, getRawInput }) => {
  if (!ctx.session) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "You must be logged in to access this resource.",
    });
  }

  // Extract workspaceId from input
  const rawInput = await getRawInput();
  const parsed = z.object({ workspaceId: z.string() }).safeParse(rawInput);
  if (!parsed.success) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "workspaceId is required for workspace-scoped procedures.",
    });
  }

  const { workspaceId } = parsed.data;

  const membership = await ctx.db.workspaceMember.findUnique({
    where: {
      workspaceId_userId: {
        workspaceId,
        userId: ctx.session.user.id,
      },
    },
  });

  if (!membership) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You are not a member of this workspace.",
    });
  }

  return next({
    ctx: {
      ...ctx,
      session: ctx.session,
      membership,
      workspaceId,
    },
  });
});

/**
 * Workspace procedure - requires auth + workspace membership.
 * Ensures all queries are scoped by workspaceId for data isolation.
 */
export const workspaceProcedure = t.procedure.use(workspaceMiddleware);

/**
 * Role middleware factory - validates that the user has a specific permission.
 * Must be used after workspaceMiddleware (use with workspaceProcedure).
 *
 * @param requiredPermission - The permission required to access the procedure
 */
export function roleMiddleware(requiredPermission: Permission) {
  return t.middleware(async ({ ctx, next, getRawInput }) => {
    if (!ctx.session) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "You must be logged in to access this resource.",
      });
    }

    const rawInput = await getRawInput();
    const parsed = z.object({ workspaceId: z.string() }).safeParse(rawInput);
    if (!parsed.success) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "workspaceId is required for role-gated procedures.",
      });
    }

    const { workspaceId } = parsed.data;

    const membership = await ctx.db.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId,
          userId: ctx.session.user.id,
        },
      },
    });

    if (!membership) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "You are not a member of this workspace.",
      });
    }

    if (!hasPermission(membership.role as WorkspaceRole, requiredPermission)) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "You do not have the required permissions for this action.",
      });
    }

    return next({
      ctx: {
        ...ctx,
        session: ctx.session,
        membership,
        workspaceId,
      },
    });
  });
}

/**
 * Create a role-guarded procedure that requires both workspace membership and a specific permission.
 */
export function roleGuardedProcedure(requiredPermission: Permission) {
  return t.procedure.use(roleMiddleware(requiredPermission));
}

/**
 * Rate-limiting middleware factory for expensive / abuse-prone procedures
 * (e.g. AI generation triggers, invites). Keyed per authenticated user, or by
 * client IP for unauthenticated calls. Backed by the distributed limiter so it
 * holds across serverless instances when Upstash is configured.
 *
 * Usage: `workspaceProcedure.use(rateLimitMiddleware("review.trigger", 20, 60_000))`
 */
export function rateLimitMiddleware(
  key: string,
  limit: number,
  windowMs: number
) {
  return t.middleware(async ({ ctx, next }) => {
    const identity = ctx.session?.user.id ?? getClientIp(ctx.headers);
    const result = await rateLimitAsync(
      `trpc:${key}:${identity}`,
      limit,
      windowMs
    );
    if (!result.success) {
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: "Rate limit exceeded. Please wait a moment and try again.",
      });
    }
    return next();
  });
}
