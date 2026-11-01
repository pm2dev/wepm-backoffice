import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { checkCredentials, clearFailures, createSessionToken, isRateLimited, recordFailure, sessionFromRequest, verifySessionToken } from "./auth";

const env = { AUTH_USERNAME: "owner", AUTH_PASSWORD: "correct horse battery", AUTH_SECRET: "x".repeat(40) };
const saved = { ...process.env };
beforeEach(() => Object.assign(process.env, env));
afterEach(() => {
  process.env = { ...saved };
});

describe("sign-in", () => {
  it("accepts only the configured username and password", () => {
    expect(checkCredentials("owner", "correct horse battery")).toBe(true);
    expect(checkCredentials(" owner ", "correct horse battery")).toBe(true);
    expect(checkCredentials("owner", "wrong")).toBe(false);
    expect(checkCredentials("someone", "correct horse battery")).toBe(false);
  });

  it("fails closed when not configured or the secret is too short", () => {
    delete process.env.AUTH_PASSWORD;
    expect(checkCredentials("owner", "")).toBe(false);
    Object.assign(process.env, env, { AUTH_SECRET: "short" });
    expect(checkCredentials("owner", "correct horse battery")).toBe(false);
  });

  it("issues signed sessions that expire and can't be forged", () => {
    const now = Date.now();
    const token = createSessionToken("owner", now);
    expect(verifySessionToken(token, now)?.u).toBe("owner");
    expect(verifySessionToken(token, now + 8 * 24 * 3600 * 1000)).toBeNull();
    const [payload] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ u: "owner", iat: 0, exp: 9_999_999_999 })).toString("base64url");
    expect(verifySessionToken(`${forged}.${token.split(".")[1]}`, now)).toBeNull();
    expect(verifySessionToken(`${payload}.AAAA`, now)).toBeNull();
    expect(verifySessionToken("garbage", now)).toBeNull();
  });

  it("changing the password or secret signs everyone out", () => {
    const token = createSessionToken("owner");
    process.env.AUTH_PASSWORD = "new password";
    expect(verifySessionToken(token)).toBeNull();
    process.env.AUTH_PASSWORD = env.AUTH_PASSWORD;
    process.env.AUTH_SECRET = "y".repeat(40);
    expect(verifySessionToken(token)).toBeNull();
  });

  it("reads the session cookie from a request", () => {
    const token = createSessionToken("owner");
    const req = new Request("https://x.test/payroll", { headers: { cookie: `a=1; backoffice_session=${encodeURIComponent(token)}` } });
    expect(sessionFromRequest(req)?.u).toBe("owner");
    expect(sessionFromRequest(new Request("https://x.test/"))).toBeNull();
  });

  it("limits repeated failures per IP", () => {
    const ip = "203.0.113.9";
    clearFailures(ip);
    for (let i = 0; i < 10; i++) recordFailure(ip);
    expect(isRateLimited(ip)).toBe(true);
    expect(isRateLimited(ip, Date.now() + 16 * 60 * 1000)).toBe(false);
    clearFailures(ip);
  });
});
