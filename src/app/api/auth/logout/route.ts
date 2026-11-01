import { NextResponse } from "next/server";
import { SESSION_COOKIE, sessionCookieOptions } from "@/server/auth";

/** POST /api/auth/logout — clears the session cookie. */
export async function POST(request: Request) {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { ...sessionCookieOptions(request), maxAge: 0 });
  return res;
}
