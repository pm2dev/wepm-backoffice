import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildSampleData, SAMPLE_BUSINESS_DATE } from "@/lib/data/sample-fixtures";
import { syncQuickBooks } from "@/lib/domain/quickbooks-sync";
import type { QboInvoice } from "./quickbooks";
import { parseQboWebhook, planQboFetches, QboWebhookError, verifyIntuitSignature } from "./quickbooks-webhooks";

const REALM = "9130350000000000";
const body = (entities: { name: string; id: string; operation: string; lastUpdated: string }[], realmId = REALM) => ({
  eventNotifications: [{ realmId, dataChangeEvent: { entities } }],
});

describe("QuickBooks webhooks via Slashbin", () => {
  it("parses change notices (IDs only, no amounts)", () => {
    const events = parseQboWebhook(body([{ name: "Payment", id: "5538", operation: "Create", lastUpdated: "2026-10-30T15:04:05.000Z" }]));
    expect(events).toEqual([{ realmId: REALM, entity: "Payment", id: "5538", operation: "Create", lastUpdated: "2026-10-30T15:04:05.000Z" }]);
    expect(() => parseQboWebhook({ hello: "world" })).toThrow(QboWebhookError);
    expect(() => parseQboWebhook(body([{ name: "Invoice", id: "", operation: "Create", lastUpdated: "x" }]))).toThrow(QboWebhookError);
  });

  it("collapses retries and out-of-order events into one fetch per entity", () => {
    const events = [
      ...parseQboWebhook(body([{ name: "Invoice", id: "1031", operation: "Update", lastUpdated: "2026-10-30T16:00:00Z" }])),
      ...parseQboWebhook(body([{ name: "Invoice", id: "1031", operation: "Create", lastUpdated: "2026-10-12T09:00:00Z" }])), // late retry
      ...parseQboWebhook(body([{ name: "Invoice", id: "1031", operation: "Update", lastUpdated: "2026-10-30T16:00:00Z" }])), // duplicate
      ...parseQboWebhook(body([{ name: "Payment", id: "77", operation: "Delete", lastUpdated: "2026-10-31T10:00:00Z" }])),
      ...parseQboWebhook(body([{ name: "Customer", id: "QB-1042", operation: "Update", lastUpdated: "2026-10-31T10:00:00Z" }])),
      ...parseQboWebhook(body([{ name: "Invoice", id: "1", operation: "Create", lastUpdated: "2026-10-31T10:00:00Z" }], "another-company")),
    ];
    const plan = planQboFetches(events, REALM);
    expect(plan.fetch).toEqual([{ entity: "Invoice", id: "1031", lastUpdated: "2026-10-30T16:00:00Z" }]);
    expect(plan.deleted).toEqual([{ entity: "Payment", id: "77" }]);
    expect(plan.ignored.map((e) => e.entity)).toEqual(["Customer", "Invoice"]);
  });

  it("verifies Intuit's HMAC-SHA256 signature over the raw body", async () => {
    const raw = JSON.stringify(body([{ name: "Invoice", id: "1031", operation: "Update", lastUpdated: "2026-10-30T16:00:00Z" }]));
    const token = "verifier-token-from-intuit";
    const sig = createHmac("sha256", token).update(raw).digest("base64");
    expect(await verifyIntuitSignature(raw, sig, token)).toBe(true);
    expect(await verifyIntuitSignature(raw + " ", sig, token)).toBe(false);
    expect(await verifyIntuitSignature(raw, sig, "wrong-token")).toBe(false);
    expect(await verifyIntuitSignature(raw, null, token)).toBe(false);
  });

  it("ignores an older version of an entity that arrives after a newer one", () => {
    const inv = (balance: number, updated: string): QboInvoice => ({ Id: "3001", DocNumber: "INV-X", TxnDate: "2026-10-20", TotalAmt: 500, Balance: balance, CustomerRef: { value: "QB-1042" }, MetaData: { LastUpdatedTime: updated } });
    const newer = syncQuickBooks(buildSampleData(), { invoices: [inv(0, "2026-10-31T12:00:00Z")] }, SAMPLE_BUSINESS_DATE).data;
    const r = syncQuickBooks(newer, { invoices: [inv(500, "2026-10-20T08:00:00Z")] }, SAMPLE_BUSINESS_DATE);
    expect(r.stale).toBe(1);
    expect(r.data.quickbooksInvoices.find((i) => i.qbInvoiceId === "3001")!.balanceCents).toBe(0);
  });
});
