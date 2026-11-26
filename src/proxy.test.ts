import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "./proxy";
import { SESSION_COOKIE, createSessionToken } from "@/server/auth";

const env = { AUTH_USERNAME: "owner", AUTH_PASSWORD: "correct horse battery", AUTH_SECRET: "x".repeat(40) };
const saved = { ...process.env };
beforeEach(() => Object.assign(process.env, env));
afterEach(() => {
  process.env = { ...saved };
});

function get(path: string, signedIn = false) {
  const headers: Record<string, string> = {};
  if (signedIn) headers.cookie = `${SESSION_COOKIE}=${encodeURIComponent(createSessionToken("owner"))}`;
  return proxy(new NextRequest(`http://localhost:3000${path}`, { headers }));
}

const passedThrough = (res: Response) => res.headers.get("x-middleware-next") === "1";

describe("proxy in live mode", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_DATA_MODE = "live";
  });

  it("sends signed-out page requests to sign-in", () => {
    const res = get("/payroll");
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost:3000/login?next=%2Fpayroll");
  });

  it("refuses signed-out API requests", () => {
    expect(get("/api/ops").status).toBe(401);
  });

  it("lets signed-in requests through", () => {
    expect(passedThrough(get("/payroll", true))).toBe(true);
    expect(passedThrough(get("/api/ops", true))).toBe(true);
  });
});

describe("proxy in sample mode", () => {
  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_DATA_MODE;
  });

  it("opens pages without a session, since sample mode has no sign-in form", () => {
    expect(passedThrough(get("/payroll"))).toBe(true);
    expect(passedThrough(get("/"))).toBe(true);
  });

  it("still refuses signed-out API requests", () => {
    expect(get("/api/ops").status).toBe(401);
  });

  it("keeps public paths public", () => {
    expect(passedThrough(get("/login"))).toBe(true);
    expect(passedThrough(get("/api/health"))).toBe(true);
  });
});
