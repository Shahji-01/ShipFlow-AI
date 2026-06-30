import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { toNextJsHandler } from "better-auth/next-js";
import { prisma } from "@shipflow/database";
import { encryptSecret, isEncrypted } from "@shipflow/inngest";

/** Encrypt a token value at rest if present and not already encrypted. */
function encryptToken(value?: string | null): string | null | undefined {
  if (!value || isEncrypted(value)) return value;
  return encryptSecret(value);
}

// Re-export permissions for use in API middleware (accessible via @shipflow/auth/server)
export {
  hasPermission,
  canAccess,
  Permission,
  ROLE_PERMISSIONS,
  WorkspaceRole,
} from "./permissions";
export type { Permission as PermissionType } from "./permissions";

/**
 * Server-side BetterAuth instance.
 *
 * Configured with:
 * - Prisma adapter for PostgreSQL persistence
 * - Email/password authentication (min 8 character passwords)
 * - GitHub OAuth social login
 * - 24-hour inactivity session expiry
 */
export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),

  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,

  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
  },

  socialProviders: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
      // `repo` grants the repository access ShipFlow needs for PR tracking and
      // AI reviews. Without it the link only carries identity scopes
      // (read:user, user:email) and repository features won't work.
      scope: ["repo"],
    },
  },

  session: {
    expiresIn: 60 * 60 * 24, // 24 hours in seconds
    updateAge: 0, // Update session expiry on every request to track inactivity
  },

  user: {
    modelName: "User",
    fields: {
      image: "avatarUrl",
    },
  },

  account: {
    modelName: "Account",
    fields: {
      accountId: "providerAccountId",
      providerId: "provider",
      password: "password",
    },
    // Allow linking a GitHub account to an existing (email/password) user,
    // even when the GitHub email differs from the sign-up email.
    accountLinking: {
      enabled: true,
      trustedProviders: ["github"],
      allowDifferentEmails: true,
    },
  },

  /**
   * Encrypt OAuth tokens (GitHub access/refresh tokens) at rest. These grant
   * repository access, so they are the most sensitive secrets in the system.
   * Read sites (Inngest workflows) decrypt with decryptSecret, which falls back
   * to plaintext for any legacy rows written before encryption was enabled.
   */
  databaseHooks: {
    account: {
      create: {
        before: async (account: Record<string, unknown>) => ({
          data: {
            ...account,
            accessToken: encryptToken(account.accessToken as string | null),
            refreshToken: encryptToken(account.refreshToken as string | null),
          },
        }),
      },
      update: {
        before: async (account: Record<string, unknown>) => ({
          data: {
            ...account,
            ...(account.accessToken !== undefined
              ? { accessToken: encryptToken(account.accessToken as string | null) }
              : {}),
            ...(account.refreshToken !== undefined
              ? { refreshToken: encryptToken(account.refreshToken as string | null) }
              : {}),
          },
        }),
      },
    },
  },
});

export type Auth = typeof auth;

/**
 * Next.js App Router route handlers for BetterAuth.
 * Mount these in `app/api/auth/[...all]/route.ts`.
 */
export const { GET, POST } = toNextJsHandler(auth);
