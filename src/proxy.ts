import { getSessionCookie } from "better-auth/cookies";
import { type NextRequest, NextResponse } from "next/server";

/**
 * Sends signed-out visitors of the tools to the sign-in page before anything loads.
 * This only looks for the session cookie; the pages and API routes verify the session themselves.
 */
export function proxy(request: NextRequest) {
  if (getSessionCookie(request)) return NextResponse.next();
  const login = new URL("/login", request.url);
  login.searchParams.set("next", request.nextUrl.pathname);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/depot", "/depot/:path*", "/cockpit", "/cockpit/:path*"],
};
