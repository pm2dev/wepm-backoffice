import { NextResponse } from "next/server";
import { SESSION_COOKIE, sessionCookieOptions } from "@/server/auth";
import { errorJson, isCrossSite } from "@/server/http";

/** POST /api/auth/logout — clears the session cookie. */
export async function POST(request: Request) {
  if (isCrossSite(request)) return errorJson(403, "Cross-site request refused.", "auth");
  const res = NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } });
  res.cookies.set(SESSION_COOKIE, "", { ...sessionCookieOptions(request), maxAge: 0 });
  return res;
}
