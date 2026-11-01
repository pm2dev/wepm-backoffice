import { NextResponse } from "next/server";
import { authConfig, checkCredentials, clearFailures, clientIp, createSessionToken, isRateLimited, recordFailure, SESSION_COOKIE, sessionCookieOptions } from "@/server/auth";
import { errorJson, isCrossSite, LOGIN_MAX_BYTES, readJson } from "@/server/http";

/** POST /api/auth/login — { username, password } → sets the session cookie. */
export async function POST(request: Request) {
  // Refuse sign-in submitted from another site (login CSRF).
  if (isCrossSite(request)) return errorJson(403, "Cross-site request refused.", "auth");
  if (!authConfig().configured) {
    return NextResponse.json({ error: "Sign-in isn't set up on this server yet (AUTH_USERNAME, AUTH_PASSWORD, AUTH_SECRET)." }, { status: 503, headers: { "cache-control": "no-store" } });
  }
  const ip = clientIp(request);
  if (isRateLimited(ip)) {
    return NextResponse.json({ error: "Too many failed attempts. Try again in 15 minutes." }, { status: 429, headers: { "cache-control": "no-store", "retry-after": "900" } });
  }
  const body = await readJson(request, LOGIN_MAX_BYTES);
  if (!body.ok) return body.response;
  const value = body.value as { username?: unknown; password?: unknown } | null;
  const username = typeof value?.username === "string" ? value.username.slice(0, 200) : "";
  const password = typeof value?.password === "string" ? value.password.slice(0, 500) : "";
  if (!checkCredentials(username, password)) {
    recordFailure(ip);
    // Small fixed delay slows down guessing.
    await new Promise((r) => setTimeout(r, 400));
    return NextResponse.json({ error: "That username and password don't match." }, { status: 401, headers: { "cache-control": "no-store" } });
  }
  clearFailures(ip);
  const res = NextResponse.json({ ok: true, username: username.trim() }, { headers: { "cache-control": "no-store" } });
  res.cookies.set(SESSION_COOKIE, createSessionToken(username.trim()), sessionCookieOptions(request));
  return res;
}
