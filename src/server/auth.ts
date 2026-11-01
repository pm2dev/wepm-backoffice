/**
 * Single-owner sign-in. Credentials come from environment variables (set per
 * Railway environment), never from code:
 *   AUTH_USERNAME, AUTH_PASSWORD — the login (temporary for now)
 *   AUTH_SECRET                  — random string used to sign session cookies
 * If any is missing, sign-in is refused ("fail closed").
 *
 * A session is a signed, HttpOnly cookie: base64url(payload).base64url(HMAC-SHA256).
 * Changing AUTH_SECRET or AUTH_PASSWORD signs everyone out.
 */
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "backoffice_session";
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

type Session = { u: string; iat: number; exp: number };

export function authConfig() {
  const username = process.env.AUTH_USERNAME ?? "";
  const password = process.env.AUTH_PASSWORD ?? "";
  const secret = process.env.AUTH_SECRET ?? "";
  return { username, password, secret, configured: !!(username && password && secret.length >= 32) };
}

function b64url(buf: Buffer | string) {
  return Buffer.from(buf).toString("base64url");
}

/** Signing key also depends on the password, so changing the password revokes sessions. */
function signingKey(secret: string, password: string) {
  return createHash("sha256").update(`${secret}\u0000${password}`).digest();
}

function sign(payload: string, secret: string, password: string) {
  return createHmac("sha256", signingKey(secret, password)).update(payload).digest();
}

/** Constant-time string comparison (hash first so lengths don't leak). */
function safeEqual(a: string, b: string) {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

export function checkCredentials(username: string, password: string): boolean {
  const cfg = authConfig();
  if (!cfg.configured) return false;
  // Evaluate both comparisons regardless of the first result.
  const userOk = safeEqual(username.trim(), cfg.username);
  const passOk = safeEqual(password, cfg.password);
  return userOk && passOk;
}

export function createSessionToken(username: string, now = Date.now()): string {
  const cfg = authConfig();
  if (!cfg.configured) throw new Error("Sign-in is not configured.");
  const iat = Math.floor(now / 1000);
  const payload = b64url(JSON.stringify({ u: username, iat, exp: iat + SESSION_TTL_SECONDS } satisfies Session));
  return `${payload}.${b64url(sign(payload, cfg.secret, cfg.password))}`;
}

export function verifySessionToken(token: string | undefined, now = Date.now()): Session | null {
  const cfg = authConfig();
  if (!cfg.configured || !token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = sign(payload, cfg.secret, cfg.password);
  const given = Buffer.from(sig, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const s = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Session;
    if (typeof s.exp !== "number" || s.exp * 1000 <= now) return null;
    if (s.u !== cfg.username) return null; // username changed → signed out
    return s;
  } catch {
    return null;
  }
}

export function sessionCookieOptions(request: Request) {
  const secure = new URL(request.url).protocol === "https:" || request.headers.get("x-forwarded-proto") === "https";
  return { httpOnly: true, secure, sameSite: "lax" as const, path: "/", maxAge: SESSION_TTL_SECONDS };
}

// ---------------------------------------------------------------------------
// Failed-attempt limiting (per client IP, in memory — fine for one server)
// ---------------------------------------------------------------------------

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 10;
const failures = new Map<string, { count: number; resetAt: number }>();

export function clientIp(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
}

export function isRateLimited(ip: string, now = Date.now()): boolean {
  const f = failures.get(ip);
  if (!f || f.resetAt <= now) return false;
  return f.count >= MAX_FAILURES;
}

export function recordFailure(ip: string, now = Date.now()) {
  const f = failures.get(ip);
  if (!f || f.resetAt <= now) failures.set(ip, { count: 1, resetAt: now + WINDOW_MS });
  else f.count++;
}

export function clearFailures(ip: string) {
  failures.delete(ip);
}

/** Read and verify the session from a request's Cookie header. */
export function sessionFromRequest(request: Request): Session | null {
  const cookie = request.headers.get("cookie") ?? "";
  const match = cookie.split(/;\s*/).find((c) => c.startsWith(`${SESSION_COOKIE}=`));
  return verifySessionToken(match ? decodeURIComponent(match.slice(SESSION_COOKIE.length + 1)) : undefined);
}
