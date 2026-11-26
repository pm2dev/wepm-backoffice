# Integrations: QuickBooks and wepm.app via Slashbin

Slashbin is a **webhook gateway**. It receives webhooks from source systems, verifies their signatures, stores the raw payload, retries delivery, and forwards them to Backoffice. Slashbin can also transform payloads with its own models, but QuickBooks notices carry no entity data, so a transform can't replace fetching from the QuickBooks API. Backoffice therefore still has to understand QuickBooks' webhook format and fetch each changed record itself.

Slashbin's setup guide: <https://www.slashbin.io/docs/recipes/quickbooks-webhook-sync>

## Current setup (sandbox, verified 2026-11-25 US time)

The QuickBooks → Slashbin leg is set up and has delivered a live event. Slashbin → Backoffice is not connected yet, since no destination is configured.

| Piece | Where | State |
|---|---|---|
| Intuit developer app **Slashbin Webhook Sync** | Intuit Developer → Sample Workspace | Development mode. Scope `com.intuit.quickbooks.accounting` (Intuit grants it as read & write, and scopes can't be removed once added). No production keys yet. |
| Webhook subscription | App → Webhooks → Development | Endpoint = Slashbin ingestion URL. **Cloud event payload format: ON.** Subscribed to all entity types (Intuit's default). Narrow this before production. |
| Sandbox company **Sandbox Company US 5a1a** | Intuit Developer → Sandboxes | QuickBooks Online Plus, US. Connected to the app via the OAuth 2.0 Playground (test only; Backoffice needs its own OAuth connection). |
| Slashbin data stream **QuickBooks – Sandbox – Webhooks** | Slashbin console → Data Streams | Type Transactional. Topic path `$[0].type`. QuickBooks Inbound Secret = Intuit's **Verifier Token**. No model or outbound destination yet. |
| Slashbin CLI | `npm install -g slashbin-cli` (not `slashbin`) | Optional. `slashbin logs <data-stream-id>` shows the delivery log in the terminal. |

**End-to-end test:** creating customer "Slashbin Test Customer" (ID 58) in the sandbox produced one delivery in Slashbin within seconds. It passed signature verification and was routed under the topic `qbo.customer.created.v1`.

Lessons from setup:

- Intuit has no "signing secret". The shared secret is the app's **Verifier Token** (Webhooks page → "Show verifier token"), and it goes into Slashbin's QuickBooks Inbound Secret field. Don't use Slashbin's "Generate New" button, because Intuit wouldn't know that secret.
- QuickBooks only sends webhooks for companies that have **authorized the app via OAuth**. A sandbox company with no connection produces no events.
- Rotating the Verifier Token means updating it in both Intuit and Slashbin. Until both match, deliveries fail verification.

## Webhook format: CloudEvents (not `eventNotifications`)

Intuit moved QuickBooks webhooks to CloudEvents. The cutover was extended to 2026-07-31 and has passed, so **all new setups send CloudEvents**, and the Slashbin QuickBooks configuration expects it. Intuit sends a top-level **array**, which can be batched and can mix companies:

```json
[
  {
    "specversion": "1.0",
    "id": "c8219314-079e-4ab7-a3a2-6c97638e82ae-Customer-58",
    "source": "intuit.<app-identifier>",
    "type": "qbo.customer.created.v1",
    "time": "2026-11-26T04:08:57Z",
    "intuitentityid": "58",
    "intuitaccountid": "<sandbox-company-id>"
  }
]
```

(This is the actual test event, with the app identifier and company ID replaced by placeholders. Slashbin's Incoming Data view displays it wrapped as `{"items": [ … ]}`.)

| Field | Meaning | Old `eventNotifications` equivalent |
|---|---|---|
| `id` | Event ID. **Dedupe on this.** It isn't the entity ID. | none |
| `type` | `qbo.<entity>.<operation>.v1`, e.g. `qbo.invoice.updated.v1`. Entity and operation are both in here. | `entities[].name` + `operation` |
| `intuitentityid` | ID of the record that changed | `entities[].id` |
| `intuitaccountid` | QuickBooks company (realm) ID. **Read it per element, not once per request.** | `realmId` |
| `time` | When the change happened | `lastUpdated` |
| `data` | Empty or absent by design. Notices say *what* changed, not the new values. | none |

**Parser changes for CloudEvents** (`parseQboWebhook`, see the status table below):

- Accept a top-level array, plus whatever wrapper Slashbin forwards (see "To confirm before Phase 5", item 1).
- Split `type` into entity and operation: `qbo.invoice.updated.v1` → `Invoice` / `Update`. Match the entity case-insensitively, since it arrives in lowercase.
- Map each operation to the capitalised name the rest of the code expects: `created` → `Create`, `updated` → `Update`, `deleted` → `Delete`, `merged` → `Merge`. `planQboFetches` only skips the fetch for the exact string `Delete`, so an unmapped `deleted` would be fetched instead.
- Map `intuitentityid` → `id`, `intuitaccountid` → `realmId`, `time` → `lastUpdated`, and keep the event `id` for dedupe.
- Handle every element of the batch. Never treat `[0]` as the whole request.

Other code still written for the legacy shape, to update alongside the parser:

- The Settings webhook tester's sample payload (`src/components/settings/integrations.tsx`) uses `eventNotifications`.
- The header comment in `src/lib/integrations/quickbooks-webhooks.ts` still lists the CloudEvents format as unverified.

## QuickBooks invoices and payments

```
QuickBooks Online ──webhook──▶ Slashbin ──forward──▶ POST /api/integrations/quickbooks (Backoffice server, Phase 5)
                   (verifies                             │ 1. verify the request came from Slashbin
                    intuit-signature)                    │ 2. parse CloudEvents notices
                                                         │ 3. plan fetches (dedupe, newest wins)
                                                         ▼
                                       QuickBooks Accounting API (OAuth)
                                                         │ 4. GET Invoice / Payment by ID
                                                         ▼
                                       5. syncQuickBooks(): upsert by QuickBooks ID,
                                          ignore older versions, keep the owner's manual marks
```

**QuickBooks webhooks are change notices only.** Each one says *which* entity changed (type, ID, company, time), not its amounts or balance. So Backoffice needs a **QuickBooks API connection** (OAuth 2.0 against the Intuit app, with the refresh token stored server-side) to fetch the invoice or payment after each notice. For invoices and payments, Backoffice only reads. The customer workflow below would also write.

| Step | Code | Status |
|---|---|---|
| Verify the request | `verifyIntuitSignature` in `src/lib/integrations/quickbooks-webhooks.ts` | Built and tested, but see "To confirm before Phase 5", item 1. Slashbin already checks `intuit-signature`. What Backoffice should verify depends on what Slashbin forwards. |
| Parse change notices | `parseQboWebhook` | **Needs rework.** It only accepts the legacy `{"eventNotifications": [...]}` shape and throws "missing eventNotifications" on a CloudEvents array, so every current delivery would be rejected. See "Parser changes for CloudEvents" above. |
| Dedupe retries; deletes need no fetch; ignore other entities/companies | `planQboFetches` | Built and tested. Logic still applies once fed CloudEvents-derived events. Dedupe should also use the CloudEvents `id`. It currently ignores `Customer`. |
| Fetch entities from the Accounting API | Server endpoint + OAuth | **Phase 5** |
| Map QuickBooks Invoice/Payment → Backoffice | `mapInvoice`, `mapPayment` in `src/lib/integrations/quickbooks.ts` | Built and tested |
| Upsert, out-of-order protection, manual marks | `syncQuickBooks` in `src/lib/domain/quickbooks-sync.ts` | Built and tested |

Gateways retry, so the same notice can arrive more than once or out of order. Fetching by ID and storing QuickBooks' `MetaData.LastUpdatedTime` makes that harmless, because an older version never overwrites a newer one.

**Manual marks** (invoice "marked paid", payment "done") live only in Backoffice. They are never written to QuickBooks. A QuickBooks balance of zero supersedes a manual "paid" mark.

## QuickBooks customers (proposed, decisions open)

Customers start in Backoffice. A customer is usually added to QuickBooks only when they're ready to be invoiced, which can be a month or more later. So customer **creation** flows Backoffice → QuickBooks, and webhooks bring QuickBooks-side changes back. Only one QuickBooks company (WEPM's own) is connected.

Lifecycle:

1. **Create in Backoffice.** No QuickBooks link yet (`quickbooksCustomerId` is unset).
2. **Send to QuickBooks** when ready to invoice. First search QuickBooks by display name or email, because display names must be unique and the customer may already exist there. Link to a match if one is found; otherwise create the customer. Store the returned `Id` and `SyncToken`.
3. **Echo:** QuickBooks then sends `qbo.customer.created.v1` for that same ID. It's already linked, so just refresh the record. This prevents Backoffice's own writes looping back as new customers.
4. **`updated`:** fetch the customer and apply only the fields QuickBooks owns (see decisions).
5. **`created` with an unknown ID:** the customer was made directly in QuickBooks. Decide whether to auto-create in Backoffice or queue for review.
6. **`deleted`:** QuickBooks doesn't hard-delete customers. It makes them inactive. Proposed: keep the Backoffice customer and mark the link inactive.
7. **`merged`:** two QuickBooks customers became one. Proposed: point the link at the surviving ID and flag it for review.

**Data needed.** Postgres on Railway is already live (see `railway.md`). Business data is currently one JSON document per workspace (`Workspace.data` in `prisma/schema.prisma`), and the `Customer` type (`src/lib/domain/types.ts`) already has `name`, `billingCadence`, `notes` and a `quickbooksCustomerId` link. The workflow would add:

| Data | Fields | Notes |
|---|---|---|
| On `Customer` | email, phone, billing address; QuickBooks `SyncToken`, active flag, last synced time, last sync error | `SyncToken` is required by QuickBooks on every update. Which contact fields Backoffice keeps depends on decision 1. |
| Processed QuickBooks events | CloudEvents `id`, `type`, entity ID, company ID, received/processed time, error | One record per notice, for dedupe and troubleshooting. |
| QuickBooks connection | company ID, access token, refresh token, expiry | One record (WEPM's company). Tokens stored encrypted, server-side only. Access tokens last 1 hour, refresh tokens about 100 days. |

Whether these stay in the JSON document or move to their own Prisma models is part of the planned split into per-entity tables before production.

Decisions still open:

1. **Field ownership.** When a customer is edited in QuickBooks, which fields overwrite Backoffice? Suggested split: Backoffice owns contact details; QuickBooks owns money details (balance, terms, tax).
2. **Customers created directly in QuickBooks:** auto-create in Backoffice, or put them in a review queue?
3. **Trigger for "Send to QuickBooks":** a button, automatically on the first invoice, or a status change?
4. **Delete and merge handling:** confirm the proposals above.

## To confirm before Phase 5

1. **What Slashbin forwards to Backoffice.** Slashbin verifies Intuit's `intuit-signature` itself. Still unknown: does the outbound delivery carry Intuit's raw body and header unchanged, Slashbin's own signature, or a reshaped body (its console shows `{"items": [...]}`)? Add a test destination and inspect one delivery. Then decide what `verifyIntuitSignature` should check.
2. **Webhook format (resolved):** CloudEvents is on and required. The parser must be updated (see "Parser changes for CloudEvents").
3. **Entities:** narrow the subscription from "all" to `Invoice`, `Payment` and `Customer`. Voided invoices arrive as updates with a zero balance.
4. **Backfill:** webhooks only cover changes after setup, so existing open invoices (and customers) need a one-time import on first connect. Consider QuickBooks' change data capture (`/cdc`) endpoint for periodic catch-up of missed events.
5. **Endpoint security:** the Backoffice endpoint must reject unsigned or invalid requests, and only accept the expected QuickBooks company (`intuitaccountid`).
6. **Backoffice OAuth:** build Backoffice's own "Connect to QuickBooks" flow. The Playground connection used for testing isn't usable by the app.
7. **Production:** get production keys, create a separate Slashbin stream with the production Verifier Token, and connect the real company.

## wepm.app approved time

The same gateway pattern applies. `ingestApprovedTime` (`src/lib/domain/ingest.ts`) already handles duplicate delivery and unmapped records. The wepm.app webhook body, its signature, and whether it carries full time entries or only IDs (PRD §19.1) still need confirming.
