import { afterEach, describe, expect, it } from "vitest";
import { parseOperationArgs } from "@/lib/data/operation-schemas";
import { applyOperation } from "@/lib/data/operations";
import { buildSampleData } from "@/lib/data/sample-fixtures";
import { clientIp, clearFailures, isRateLimited, recordFailure, sessionCookieOptions, trackedFailureCount } from "./auth";
import { appEnv } from "./db";
import { isCrossSite, readJson } from "./http";

const saved = { ...process.env };
afterEach(() => {
  process.env = { ...saved };
});

const expense = {
  vendor: "Figma",
  type: "subscription",
  projectId: null,
  frequency: "monthly",
  firstDueDate: "2026-11-01",
  amountKind: "fixed",
  amountCents: 4500,
  autopay: true,
  accountId: "acct_chase",
  notes: "",
};

describe("#1 input validation / mass assignment", () => {
  it("accepts the shapes the app's forms send", () => {
    expect(parseOperationArgs("addExpense", { input: expense, today: "2026-11-01" }).ok).toBe(true);
    expect(parseOperationArgs("addContractor", { input: { name: "A", startDate: "", payDelayDays: 5, preferredMethod: "venmo", email: "", initialRateCents: 2500 }, today: "2026-11-01" }).ok).toBe(true);
    expect(parseOperationArgs("setPaymentDone", { receiptId: "r1", value: null }).ok).toBe(true);
    expect(parseOperationArgs("resetToSample", {}).ok).toBe(true);
  });

  it("rejects unknown fields, wrong types, bad enums and oversized values", () => {
    expect(parseOperationArgs("updateExpense", { id: "exp_figma", input: { ...expense, id: "exp_hijacked" }, today: "2026-11-01" })).toMatchObject({ ok: false });
    expect(parseOperationArgs("addExpense", { input: { ...expense, isAdmin: true }, today: "2026-11-01" })).toMatchObject({ ok: false });
    expect(parseOperationArgs("addExpense", { input: { ...expense, notes: "x".repeat(2_000_000) }, today: "2026-11-01" })).toMatchObject({ ok: false });
    expect(parseOperationArgs("addCustomer", { input: { name: "Y", billingCadence: "hourly-ish" } })).toMatchObject({ ok: false });
    expect(parseOperationArgs("addRate", { input: { contractorId: "c", effectiveDate: "2026-11-01", hourlyRateCents: "2500" } })).toMatchObject({ ok: false });
    expect(parseOperationArgs("setChargesPaid", { keys: Array(5000).fill("k"), paidOn: null })).toMatchObject({ ok: false });
    expect(parseOperationArgs("resetToSample", { anything: 1 })).toMatchObject({ ok: false });
    expect(parseOperationArgs("syncQuickBooks", { batch: {}, today: "2026-11-01" })).toMatchObject({ ok: false });
  });

  it("domain functions keep ids and drop unknown keys even without the schema", () => {
    const d = buildSampleData();
    const figma = d.expenses.find((e) => e.id === "exp_figma")!;
    const injected = { ...figma, id: "exp_hijacked", createdOn: "1999-01-01", isAdmin: true } as never;
    const { data } = applyOperation(d, "updateExpense", { id: "exp_figma", input: injected, today: "2026-11-01" });
    const e = data.expenses.find((x) => x.vendor === "Figma")! as Record<string, unknown>;
    expect([e.id, e.createdOn, e.isAdmin]).toEqual(["exp_figma", figma.createdOn, undefined]);
    const { data: d2 } = applyOperation(d, "addCustomer", { input: { name: "Z", billingCadence: "monthly", id: "cust_acme", role: "admin" } as never });
    expect(d2.customers.filter((c) => c.id === "cust_acme")).toHaveLength(1);
    expect(Object.keys(d2.customers.at(-1)!).sort()).toEqual(["billingCadence", "id", "name", "notes", "quickbooksCustomerId"]);
  });
});

describe("#2 environment fails closed", () => {
  it("only exactly 'development' enables development tools", () => {
    delete process.env.APP_ENV;
    expect(appEnv()).toBe("production");
    process.env.APP_ENV = "Development";
    expect(appEnv()).toBe("production");
    process.env.APP_ENV = "development";
    expect(appEnv()).toBe("development");
  });
});

describe("#3 cross-site requests", () => {
  const req = (headers: Record<string, string>) => new Request("https://app.example.com/api/ops", { method: "POST", headers: { host: "app.example.com", ...headers } });
  it("refuses other origins and cross-site fetch metadata; allows same-origin and non-browser clients", () => {
    expect(isCrossSite(req({ origin: "https://evil.example" }))).toBe(true);
    expect(isCrossSite(req({ origin: "null" }))).toBe(true);
    expect(isCrossSite(req({ "sec-fetch-site": "cross-site" }))).toBe(true);
    expect(isCrossSite(req({ "sec-fetch-site": "same-site" }))).toBe(true);
    expect(isCrossSite(req({ origin: "https://app.example.com", "sec-fetch-site": "same-origin" }))).toBe(false);
    expect(isCrossSite(req({}))).toBe(false);
    expect(isCrossSite(req({ origin: "https://app.example.com", "x-forwarded-host": "app.example.com" }))).toBe(false);
  });

  it("requires a JSON content type (forms can't send it cross-site)", async () => {
    const r = await readJson(new Request("https://x.test/", { method: "POST", headers: { "content-type": "text/plain" }, body: "{}" }), 1000);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.response.status).toBe(415);
  });
});

describe("#4 sign-in rate limiting", () => {
  it("uses the proxy-appended address, not the client-supplied one", () => {
    const req = new Request("https://x.test/", { headers: { "x-forwarded-for": "6.6.6.6, 203.0.113.50" } });
    expect(clientIp(req)).toBe("203.0.113.50");
    process.env.TRUSTED_PROXY_HOPS = "2";
    expect(clientIp(req)).toBe("6.6.6.6");
  });

  it("rotating a spoofed first entry doesn't escape the limit", () => {
    const ip = (n: number) => clientIp(new Request("https://x.test/", { headers: { "x-forwarded-for": `10.0.0.${n}, 198.51.100.9` } }));
    clearFailures("198.51.100.9");
    for (let n = 0; n < 10; n++) recordFailure(ip(n));
    expect(isRateLimited(ip(99))).toBe(true);
    clearFailures("198.51.100.9");
  });

  it("can't grow without bound", () => {
    const now = Date.now();
    for (let i = 0; i < 12_000; i++) recordFailure(`flood-${i}`, now);
    expect(trackedFailureCount()).toBeLessThanOrEqual(10_001);
  });
});

describe("#5 request size limits", () => {
  it("rejects bodies over the limit by header or while streaming", async () => {
    const big = JSON.stringify({ x: "a".repeat(5000) });
    const declared = await readJson(new Request("https://x.test/", { method: "POST", headers: { "content-type": "application/json", "content-length": String(big.length) }, body: big }), 1000);
    expect(declared.ok ? 200 : declared.response.status).toBe(413);
    const stream = new ReadableStream({
      start(c) {
        c.enqueue(new TextEncoder().encode(big));
        c.close();
      },
    });
    const streamed = await readJson(new Request("https://x.test/", { method: "POST", headers: { "content-type": "application/json" }, body: stream, duplex: "half" } as RequestInit), 1000);
    expect(streamed.ok ? 200 : streamed.response.status).toBe(413);
    const fine = await readJson(new Request("https://x.test/", { method: "POST", headers: { "content-type": "application/json; charset=utf-8" }, body: '{"a":1}' }), 1000);
    expect(fine).toMatchObject({ ok: true, value: { a: 1 } });
  });
});

describe("#9 cookie flags", () => {
  it("Secure everywhere except plain-http localhost, regardless of forwarded headers", () => {
    expect(sessionCookieOptions(new Request("https://backoffice.up.railway.app/")).secure).toBe(true);
    expect(sessionCookieOptions(new Request("http://backoffice.up.railway.app/", { headers: { "x-forwarded-proto": "http" } })).secure).toBe(true);
    expect(sessionCookieOptions(new Request("http://localhost:3000/")).secure).toBe(false);
  });
});
