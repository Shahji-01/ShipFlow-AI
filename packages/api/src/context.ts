import { prisma } from "@shipflow/database";
import { auth } from "@shipflow/auth/server";
import type { Context } from "./trpc";

/**
 * Creates the tRPC context for each request.
 * Extracts the user session from BetterAuth using request headers.
 */
export async function createContext(opts: {
  headers: Headers;
}): Promise<Context> {
  const session = await auth.api.getSession({
    headers: opts.headers,
  });

  return {
    db: prisma,
    session: session
      ? {
          user: {
            id: session.user.id,
            email: session.user.email,
            name: session.user.name,
          },
        }
      : null,
    headers: opts.headers,
  };
}
