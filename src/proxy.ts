import { NextRequest, NextResponse } from "next/server";

/**
 * Optimistic auth gate (Next.js 16 Proxy, formerly Middleware).
 *
 * Runs on every /dashboard route and redirects to /login when the httpOnly
 * session cookie is absent. This is a cheap presence check only — the FastAPI
 * backend still validates the JWT on every API call, which is the real
 * authorization boundary.
 */
export function proxy(request: NextRequest) {
  const hasSession = Boolean(request.cookies.get("faraday_token")?.value);
  if (!hasSession) {
    const loginUrl = new URL("/login", request.nextUrl);
    return NextResponse.redirect(loginUrl);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*"],
};
