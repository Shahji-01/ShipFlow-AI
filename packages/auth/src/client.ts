import { createAuthClient } from "better-auth/react";

/**
 * Client-side BetterAuth instance for use in React/Next.js components.
 *
 * Exports typed hooks and functions:
 * - signIn: Sign in with email/password or social providers
 * - signUp: Create new account with email/password
 * - signOut: End the current session
 * - useSession: React hook for session state
 */
export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_BETTER_AUTH_URL ?? "",
});

export const { signIn, signUp, signOut, useSession } = authClient;
