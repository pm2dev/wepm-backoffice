import { NextResponse, type NextRequest } from "next/server";
import { sessionFromRequest } from "@/server/auth";
import { isCrossSite } from "@/server/http";

/** Paths reachable without signing in. */
const PUBLIC_PATHS = ["/login", "/api/auth/login", "/api/health"];
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Request gate for the hosted app (not part of the GitHub Pages preview):
 * 1. API writes from another site are refused (CSRF), including sign-in.
 * 2. Everything except the public paths requires a signed-in session.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const isApi = pathname.startsWith("/api/");

  if (isApi && !SAFE_METHODS.has(request.method) && isCrossSite(request)) {
    return NextResponse.json({ error: { kind: "auth", message: "Cross-site request refused." } }, { status: 403, headers: { "cache-control": "no-store" } });
  }
  if (PUBLIC_PATHS.includes(pathname)) return NextResponse.next();
  if (sessionFromRequest(request)) return NextResponse.next();

  if (isApi) {
    return NextResponse.json({ error: { kind: "auth", message: "Please sign in." } }, { status: 401, headers: { "cache-control": "no-store" } });
  }
  const login = new URL("/login", request.url);
  if (pathname !== "/") login.searchParams.set("next", pathname + search);
  return NextResponse.redirect(login);
}

export const config = {
  // Everything except Next.js build assets and the favicon.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
