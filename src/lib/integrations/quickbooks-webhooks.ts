/**
 * QuickBooks Online webhooks, relayed by Slashbin (a webhook gateway).
 *
 * Flow (production, Phase 5):
 *   QuickBooks ──webhook──▶ Slashbin (receive, retry, forward) ──▶ Backoffice server endpoint
 *     1. verifyIntuitSignature()   — if Slashbin forwards Intuit's raw body + `intuit-signature` header
 *     2. parseQboWebhook()         — change notices only: entity name, id, operation, time
 *     3. planQboFetches()          — dedupe; deletes need no fetch
 *     4. fetch each Invoice/Payment from the QuickBooks Accounting API (server-side OAuth)
 *     5. syncQuickBooks()          — upsert by QuickBooks ID, newest wins, owner marks kept
 *
 * QuickBooks webhooks do NOT contain the invoice or payment itself, which is why
 * step 4 exists. Unverified: whether Slashbin preserves the raw body and Intuit's
 * signature header (or signs with its own secret), and whether the account uses
 * Intuit's newer CloudEvents webhook format. Confirm before implementing step 1.
 */

export type QboWebhookEntityName = "Invoice" | "Payment" | "Customer" | (string & {});
export type QboWebhookOperation = "Create" | "Update" | "Delete" | "Merge" | "Void" | "Emailed" | (string & {});

/** Intuit's (legacy) webhook body. */
export type QboWebhookBody = {
  eventNotifications: {
    realmId: string;
    dataChangeEvent: {
      entities: { name: QboWebhookEntityName; id: string; operation: QboWebhookOperation; lastUpdated: string; deletedId?: string }[];
    };
  }[];
};

export type QboChangeEvent = {
  realmId: string;
  entity: QboWebhookEntityName;
  id: string;
  operation: QboWebhookOperation;
  /** ISO timestamp from QuickBooks. */
  lastUpdated: string;
};

export class QboWebhookError extends Error {}

export function parseQboWebhook(body: unknown): QboChangeEvent[] {
  const b = body as Partial<QboWebhookBody> | null;
  if (!b || !Array.isArray(b.eventNotifications)) throw new QboWebhookError("Not a QuickBooks webhook: missing eventNotifications");
  const out: QboChangeEvent[] = [];
  for (const n of b.eventNotifications) {
    if (!n?.realmId || !Array.isArray(n.dataChangeEvent?.entities)) throw new QboWebhookError("Malformed event notification");
    for (const e of n.dataChangeEvent.entities) {
      if (!e?.name || !e.id || !e.operation || !e.lastUpdated || Number.isNaN(Date.parse(e.lastUpdated))) throw new QboWebhookError("Malformed entity change");
      out.push({ realmId: n.realmId, entity: e.name, id: e.id, operation: e.operation, lastUpdated: e.lastUpdated });
    }
  }
  return out;
}

export type QboFetchPlan = {
  /** Fetch these from the Accounting API, then pass to syncQuickBooks. */
  fetch: { entity: "Invoice" | "Payment"; id: string; lastUpdated: string }[];
  /** Already known to be deleted — send as `{ Id, status: "Deleted" }`. */
  deleted: { entity: "Invoice" | "Payment"; id: string }[];
  /** Entities Backoffice doesn't use (yet), or another QuickBooks company. */
  ignored: QboChangeEvent[];
};

/**
 * Collapse change events (gateways retry, so duplicates and out-of-order
 * delivery are expected) into the minimal set of fetches: one per entity,
 * keeping the latest event. Events for other QuickBooks companies are ignored.
 */
export function planQboFetches(events: QboChangeEvent[], realmId: string): QboFetchPlan {
  const latest = new Map<string, QboChangeEvent>();
  const ignored: QboChangeEvent[] = [];
  for (const e of events) {
    if (e.realmId !== realmId || (e.entity !== "Invoice" && e.entity !== "Payment")) {
      ignored.push(e);
      continue;
    }
    const key = `${e.entity}:${e.id}`;
    const prev = latest.get(key);
    if (!prev || Date.parse(e.lastUpdated) >= Date.parse(prev.lastUpdated)) latest.set(key, e);
  }
  const plan: QboFetchPlan = { fetch: [], deleted: [], ignored };
  for (const e of latest.values()) {
    const entity = e.entity as "Invoice" | "Payment";
    if (e.operation === "Delete") plan.deleted.push({ entity, id: e.id });
    else plan.fetch.push({ entity, id: e.id, lastUpdated: e.lastUpdated });
  }
  return plan;
}

/**
 * Verify Intuit's `intuit-signature` header: base64(HMAC-SHA256(rawBody, verifierToken)).
 * Must use the exact raw request body. Server-side only — the verifier token is a secret.
 */
export async function verifyIntuitSignature(rawBody: string, signatureHeader: string | null, verifierToken: string): Promise<boolean> {
  if (!signatureHeader || !verifierToken) return false;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(verifierToken), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(rawBody)));
  let binary = "";
  for (const byte of mac) binary += String.fromCharCode(byte);
  const expected = btoa(binary);
  // Constant-time comparison.
  if (expected.length !== signatureHeader.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ signatureHeader.charCodeAt(i);
  return diff === 0;
}
