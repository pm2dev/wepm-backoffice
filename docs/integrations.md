# Integrations: QuickBooks and wepm.app via Slashbin

Slashbin is a **webhook gateway**: it receives webhooks from source systems, retries delivery, and forwards them to Backoffice. It does not transform data. Backoffice therefore has to understand each source's own webhook format.

## QuickBooks invoices and payments

```
QuickBooks Online ──webhook──▶ Slashbin ──forward──▶ POST /api/integrations/quickbooks (Backoffice server, Phase 5)
                                                         │ 1. verify signature
                                                         │ 2. parse change notices
                                                         │ 3. plan fetches (dedupe, newest wins)
                                                         ▼
                                       QuickBooks Accounting API (read-only OAuth)
                                                         │ 4. GET Invoice / Payment by ID
                                                         ▼
                                       5. syncQuickBooks(): upsert by QuickBooks ID,
                                          ignore older versions, keep the owner's manual marks
```

**QuickBooks webhooks are change notices only.** Each one says *which* entity changed (`Invoice` / `Payment`, ID, operation, time), not its amounts or balance. So Backoffice needs a **read-only QuickBooks API connection** (an Intuit developer app with OAuth 2.0; refresh token stored server-side) to fetch the invoice or payment after each notice. Slashbin can't remove this step unless it can enrich payloads.

| Step | Code | Status |
|---|---|---|
| Verify `intuit-signature` (HMAC-SHA256 of the raw body with the webhook verifier token) | `verifyIntuitSignature` in `src/lib/integrations/quickbooks-webhooks.ts` | Built and tested |
| Parse change notices | `parseQboWebhook` | Built and tested (Intuit's `eventNotifications` format) |
| Dedupe retries; deletes need no fetch; ignore other entities/companies | `planQboFetches` | Built and tested |
| Fetch entities from the Accounting API | Server endpoint + OAuth | **Phase 5** |
| Map QuickBooks Invoice/Payment → Backoffice | `mapInvoice`, `mapPayment` in `src/lib/integrations/quickbooks.ts` | Built and tested |
| Upsert, out-of-order protection, manual marks | `syncQuickBooks` in `src/lib/domain/quickbooks-sync.ts` | Built and tested |

Gateways retry, so the same notice can arrive more than once or out of order. Fetching by ID and storing QuickBooks' `MetaData.LastUpdatedTime` makes that harmless: an older version never overwrites a newer one.

**Manual marks** (invoice "marked paid", payment "done") live only in Backoffice. They are never written to QuickBooks. A QuickBooks balance of zero supersedes a manual "paid" mark.

## To confirm before Phase 5

1. **Signature:** does Slashbin forward Intuit's raw body and `intuit-signature` header unchanged, or sign with its own secret? If Slashbin re-signs, verify Slashbin's signature instead. If it changes the body at all, Intuit's signature can't be checked.
2. **Webhook format:** Intuit has offered a newer CloudEvents webhook format alongside the `eventNotifications` format handled here. Check which one the QuickBooks app is set to send.
3. **Entities:** subscribe to `Invoice` and `Payment` (and optionally `Customer`). Voided invoices arrive as updates with a zero balance.
4. **Backfill:** webhooks only cover changes after setup, so existing open invoices need a one-time import (e.g. a QuickBooks query on first connect).
5. **Endpoint security:** the Backoffice endpoint must reject unsigned or invalid requests, and only accept the expected QuickBooks company (`realmId`).

## wepm.app approved time

The same gateway pattern applies. `ingestApprovedTime` (`src/lib/domain/ingest.ts`) already handles duplicate delivery and unmapped records. The wepm.app webhook body, its signature, and whether it carries full time entries or only IDs (PRD §19.1) still need confirming.
