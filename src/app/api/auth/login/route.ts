import { NextResponse } from "next/server";
import { authConfig, checkCredentials, clearFailures, clientIp, createSessionToken, isRateLimited, recordFailure, SESSION_COOKIE, sessionCookieOptions } from "@/server/auth";

/** POST /api/auth/login — { username, password } → sets the session cookie. */
export async function POST(request: Request) {
  if (!authConfig().configured) {
    return NextResponse.json({ error: "Sign-in isn't set up on this server yet (AUTH_USERNAME, AUTH_PASSWORD, AUTH_SECRET)." }, { status: 503 });
  }
  const ip = clientIp(request);
  if (isRateLimited(ip)) {
    return NextResponse.json({ error: "Too many failed attempts. Try again in 15 minutes." }, { status: 429 });
  }
  const body = (await request.json().catch(() => null)) as { username?: unknown; password?: unknown } | null;
  const username = typeof body?.username === "string" ? body.username : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (!checkCredentials(username, password)) {
    recordFailure(ip);
    // Small fixed delay slows down guessing.
    await new Promise((r) => setTimeout(r, 400));
    return NextResponse.json({ error: "That username and password don't match." }, { status: 401 });
  }
  clearFailures(ip);
  const res = NextResponse.json({ ok: true, username: username.trim() });
  res.cookies.set(SESSION_COOKIE, createSessionToken(username.trim()), sessionCookieOptions(request));
  return res;
}
