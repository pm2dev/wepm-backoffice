# 0002 — QuickBooks is the system of record for invoices; Backoffice prepares drafts

**Status:** Accepted (2026-11-25)

## Context

Customers are billed for labor (time) and for billable project expenses. QuickBooks already sends invoices, holds customer contacts and records payments, and Backoffice syncs invoices and payments from it with read-only access.

## Decision

- Backoffice never creates or edits invoices in QuickBooks.
- Backoffice builds an **invoice draft** per **project**: every uninvoiced billable time entry and billable project expense up to a **through date** (defaulting to the end of the last full period of the billing cadence).
- Items on a saved draft are reserved, so nothing lands on two drafts. Removing an item returns it to uninvoiced.
- Lifecycle: **Draft → Invoiced** (owner created it in QuickBooks) **→ Linked** (owner picked the matching synced QuickBooks invoice). A total mismatch is a warning, not a block. Each step can be undone.
- Paid status comes from QuickBooks.
- The invoice draft replaces the existing `BillingRecord`.
- Billable expenses are billed at cost (no markup for now).

## Consequences

- No QuickBooks write access needed.
- One invoice per project keeps project financials simple; a customer with several projects gets several invoices.
- Customer contacts and billing emails stay in QuickBooks.
