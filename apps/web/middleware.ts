import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Middleware to protect dashboard routes.
 * Redirects unauthenticated users to /login with a redirect-back param.
 *
 * BetterAuth stores the session token in a cookie. We check for the
 * cookie presence as a fast-path gate; full session validation still
 * happens server-side in the tRPC auth middleware.
 *
 * NOTE: Next.js route groups like (dashboard) are NOT part of the URL,
 * so the matcher below lists each real path prefix explicitly.
 */
export function middleware(request: NextRequest) {
  const sessionCookie =
    request.cookies.get("better-auth.session_token") ??
    request.cookies.get("__Secure-better-auth.session_token");

  const isAuthenticated = !!sessionCookie?.value;
  const { pathname, search } = request.nextUrl;

  if (!isAuthenticated) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", `${pathname}${search}`);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  /**
   * Match all protected route prefixes. The matcher cannot use the
   * (dashboard) route group, so each real path segment is listed.
   * Static assets, _next, and API routes are excluded by construction.
   */
  matcher: [
    "/dashboard/:path*",
    "/features/:path*",
    "/prd/:path*",
    "/tasks/:path*",
    "/reviews/:path*",
    "/github/:path*",
    "/approvals/:path*",
    "/analytics/:path*",
    "/billing/:path*",
    "/workspace/:path*",
    "/settings/:path*",
  ],
};
