import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Middleware for route protection and auth redirects.
 *
 * - Unauthenticated users hitting protected routes → redirected to /login
 * - Authenticated users hitting /login or /register → redirected to /dashboard
 *
 * BetterAuth stores the session token in a cookie. We check for the cookie as
 * a fast-path gate; full session validation still happens server-side in the
 * tRPC auth middleware.
 */
export function middleware(request: NextRequest) {
  const sessionCookie =
    request.cookies.get("better-auth.session_token") ??
    request.cookies.get("__Secure-better-auth.session_token");

  const isAuthenticated = !!sessionCookie?.value;
  const { pathname, search } = request.nextUrl;

  // Auth pages — redirect already-logged-in users to dashboard
  const isAuthPage = pathname === "/login" || pathname === "/register";
  if (isAuthPage && isAuthenticated) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  // Protected routes — redirect unauthenticated users to login
  if (!isAuthPage && !isAuthenticated) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", `${pathname}${search}`);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Auth pages (redirect logged-in users away)
    "/login",
    "/register",
    // Protected dashboard routes (redirect logged-out users to login)
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
