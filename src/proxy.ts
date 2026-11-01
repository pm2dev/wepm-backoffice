import { NextResponse, type NextRequest } from "next/server";
import { sessionFromRequest } from "@/server/auth";

/** Paths reachable without signing in. */
const PUBLIC_PATHS = ["/login", "/api/auth/login", "/api/health"];

/**
 * Sign-in gate for the hosted app. Not part of the GitHub Pages preview build
 * (that build only includes .tsx route files, and has no server).
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (PUBLIC_PATHS.includes(pathname)) return NextResponse.next();
  if (sessionFromRequest(request)) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: { kind: "auth", message: "Please sign in." } }, { status: 401 });
  }
  const login = new URL("/login", request.url);
  if (pathname !== "/") login.searchParams.set("next", pathname + search);
  return NextResponse.redirect(login);
}

export const config = {
  // Everything except Next.js build assets and the favicon.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
