# Backoffice — WEPM Labs

Private business-management workspace (see the PRD). **Current milestone: full MVP frontend prototype — Payroll, Contractors, Bills & subscriptions, Customers, Projects & billing, and Cash flow**, running on clearly labeled sample data. Not for real data: there is no authentication, database, or integration yet.

## Run

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # domain/acceptance tests (vitest)
npm run build && npm start
```

### Railway (development and production)

The app runs as a Next.js server with PostgreSQL (Prisma 7). See **[docs/railway.md](docs/railway.md)** for step-by-step setup of the `development` and `production` environments. With `NEXT_PUBLIC_DATA_MODE=live`, every change goes to `POST /api/ops` and runs the same business rules on the server inside a database transaction. `GET /api/health` is the Railway health check.

### GitHub Pages preview (phone testing)

```bash
scripts/deploy-pages.sh            # builds with STATIC_EXPORT=1 BASE_PATH=/wepm-backoffice, publishes to gh-pages
```

In the repository settings, enable Pages with **Deploy from a branch → `gh-pages` / root**. The site is at `https://pm2dev.github.io/wepm-backoffice/`. Sample data lives in each browser's localStorage, so every device starts with its own copy. Use Demo controls → Reset to start over.

Use **Demo controls** in the purple banner to set the business date (the sample data is built around Sat, Oct 31, 2026) or reset the sample data.

## What's implemented

| Route | Purpose |
|---|---|
| `/payroll` | What's due: every unpaid payroll, bonus and reimbursement record, with overdue first and then upcoming. Shows totals, the time-entry exceptions notice, multi-select for one contractor, and payment recording |
| `/payroll/review?key=` | Review approved hours, the rate split by actual work date, and finalization. Missing rates block finalization |
| `/payroll/record?id=` | Finalized record with its preserved calculation, the payments applied, and the outstanding balance |
| `/payroll/history` | Payment history, filterable by contractor |
| `/contractors` | Contractor list (active first, inactive on request). Add a contractor |
| `/contractors/profile?id=` | Tenure, rates, lifetime hours/earnings, reimbursements, total paid, outstanding; rate history; hours; imports; payments; edit |
| `/contractors/import?id=` | Historical hours import (Harvest CSV or template) with row-by-row preview |
| `/bills` | Monthly review by card/account (`?month=YYYY-MM&account=`): charges due, unpaid carryovers, bulk mark paid, enter actuals |
| `/bills/upcoming` | Unpaid charges due in the next 30 days; six-month spending |
| `/bills/recurring` | Bills and subscriptions: add, edit (applies from today), stop/resume; monthly commitments |
| `/bills/accounts` | Cards (nickname + optional last four) and bank accounts |
| `/customers`, `/customers/profile?id=` | Customers (billing cadence, QuickBooks ID), their projects and invoicing history |
| `/projects` | Ready to invoice: uninvoiced billable hours × project/task rates by customer, with missing rates flagged; mark invoiced |
| `/projects/list`, `/projects/profile?id=` | Projects: customer or internal, billable, one hourly rate or rates by task, wepm.app ID |
| `/projects/invoiced` | Hours marked invoiced, with undo |
| `/cash-flow` | Customer payments from QuickBooks, filtered New / Done / All (`?show=`), with **Mark done** and **Reopen**. Includes a labeled "simulate a payment" form for the prototype |
| `/cash-flow/receipt?id=` | One payment: which invoices QuickBooks applied it to, suggestions for using it (contractor pay first, then bills, then the remainder or shortfall), and Mark done / Reopen |
| `/cash-flow/invoices` | QuickBooks invoices (Open / Paid / All) with balance, due date, overdue days, payments applied, a link to the billed hours, and **Mark paid** (manual override) / **Undo mark**. Customer pages list their invoices too |
| `/settings` | Integrations: Slashbin destination URLs to copy, QuickBooks and wepm.app connection status, QuickBooks company ID, and a webhook tester (paste a QuickBooks webhook body to see the lookups, deletions and ignored notices). Connecting needs the production server |
| Overview | "Coming soon" (deferred until its contents are defined) |

Detail pages use query strings instead of path segments so the app can be exported as a static site. URLs live in `src/lib/routes.ts`.

## Layout

```
src/lib/domain/     pure business rules (dates, money, rates, schedule, payroll, ingestion) + tests
src/lib/data/       operations (every change, shared by browser and server), repositories (sample/localStorage, live/API), fixtures, provider/clock
src/server/         Prisma client and the Postgres-backed store (server-only)
src/app/api/        /api/data, /api/ops, /api/health
prisma/             schema and migrations
src/components/ui/  shared primitives (button, badge, dialog, fields, states)
src/components/layout/  app shell, navigation, sample banner, notices
src/components/<module>/  pages and dialogs per module (payroll, contractors, bills, customers, projects, cashflow)
src/app/            routes only
```

Pages talk only to `BackofficeRepository`. `SampleRepository` (GitHub Pages) and `LiveRepository` (Railway) both run the named operations in `src/lib/data/operations.ts`, so the business rules are identical in both modes.

**Storage (stage 1):** Postgres holds the business data as one versioned JSON document (`Workspace`), plus an append-only change log (`WorkspaceEvent`). Each change locks the row, applies the operation, and writes the new version and the log entry in one transaction, so concurrent changes can't overwrite each other. Splitting into per-entity tables can happen before production without changing the API.

## Rules encoded (and temporary assumptions)

- Money is integer cents. Pay = round-half-up(minutes × rate ÷ 60), **once per rate segment** of a payroll record. *(Explicit rule; confirm.)*
- Rates apply by actual work date. Missing rates are never $0 and block finalization.
- Finalization snapshots the lines and entry IDs. It never sends money or marks anything paid. An entry can belong to only one finalized record.
- Only `wepm` + approved entries create money owed. Historical imports (`harvest_import`, `workbook_import`) never do.
- Ingestion is idempotent on source entry ID. Unmapped/unapproved records become visible exceptions. A re-delivery with changed content is counted as a conflict and **not applied** (PRD §19.2 is open).
- **Assumption (PRD §8):** late-approved hours for an already-finalized week form a separate record due on the next payday.
- **Assumption (PRD §19.3):** only the weekly schedule (Mon–Sun, configurable delay; default the following Friday) is implemented.
- Bonuses and reimbursements are due on the next payday on or after the day they're entered.
- Only finalized records can be paid. Partial payments reduce the balance, and overpayment is rejected.
- One hourly cost rate per contractor at a time, effective-dated. A new rate recalculates only unfinalized hours from its date; two rates can't start on the same date.
- Lifetime earnings = hourly earnings (finalized snapshots + other hours at the rate on each work date) + bonuses. Reimbursements are shown separately. Hours with no rate are listed as missing, not valued at $0.
- "Total paid" is only the sum of recorded payments. A gap between earnings and paid + outstanding is explained as unrecorded historical payments, not debt.
- Historical imports keep the source's project, client, notes and exact decimal hours. Projects are stored as text, not matched to Backoffice projects by name. Likely duplicates are matched on source ID, or else on date + hours + project + task + notes, against both existing hours and earlier rows in the same file, and are skipped unless the owner keeps them.
- Contractors are matched to wepm.app by an explicit person ID, which must be unique. Renaming never breaks links.
- **Bills:** a charge is one occurrence of an expense, generated from its schedule (month-end anchors clamp, e.g. Jan 31 → Feb 28) and stored once something is recorded. Edits apply from today and store all earlier charges; stopping keeps earlier charges. Autopay never marks anything paid. Entering an actual amount updates the same charge.
- **Billing:** only approved, billable (customer) project hours that aren't yet invoiced are billed. Amount = round(minutes × rate ÷ 60) once per task line. A missing task rate blocks that project's total and its invoiced marking. Marking invoiced preserves the billed lines and never marks anything paid. **Assumption (PRD §19.5):** billing rates aren't effective-dated; the current rate applies to uninvoiced hours. Cadence is shown but doesn't filter yet.
- Saving a contractor or project with a newly mapped wepm.app ID re-checks held-back time entries.
- **QuickBooks invoices & payments:** QuickBooks is the source of truth. Invoices and payments are synced by QuickBooks ID, so re-delivery updates rather than duplicates, and the owner's manual marks survive syncs. Customers are matched by QuickBooks customer ID only. Records that can't be mapped are rejected and reported. Deleted QuickBooks records are removed unless the owner marked them. All mapping from QuickBooks Online's Invoice and Payment objects lives in `src/lib/integrations/quickbooks.ts`.
  - **Manual "done":** an invoice can be marked paid in Backoffice, for example when it was paid outside QuickBooks or QuickBooks hasn't caught up. This is never written back to QuickBooks. A later sync showing a zero balance replaces it ("Paid in QuickBooks"). A payment can be marked done once you've handled it. Both can be undone. Neither changes contractor pay, bills, or suggestions.
  - **Slashbin is a webhook gateway.** QuickBooks webhooks are change notices only (entity, ID, operation, time), so production needs a server endpoint that verifies the signature, parses the notices, fetches each Invoice/Payment from the QuickBooks API (read-only OAuth), then syncs. The notice handling is built and tested; the endpoint and OAuth are Phase 5. See [docs/integrations.md](docs/integrations.md) for the flow and the open questions about the Slashbin and webhook format.
- **Cash flow:** zero starting balance. Unpaid contractor obligations come first, earliest due first. **Assumption (PRD §19.7):** bonuses and reimbursements rank with payroll by due date. Unfinalized payroll uses its current calculation. Then come unpaid bills due within the next 30 days, then the remainder. A suggestion never exceeds the payment or a balance, and never changes anything. Duplicate QuickBooks payment IDs are ignored. Customers are matched by QuickBooks customer ID only.

## Verification so far

- 48 unit/acceptance tests covering PRD §6–§11 acceptance criteria, including: payroll (rate boundary, re-delivery, finalize ≠ paid, partial payment, payroll + bonus paid together, late approval, missing rate) and contractors (validation, rename keeps links, retroactive rates don't change finalized pay, earnings vs reimbursements vs paid, Harvest parsing, duplicate detection, imports never create money owed).
- Headless Chromium walk-throughs of every module (payroll, contractors, bills, billing, cash flow) against the static export, with screenshots at 1440, 1366, 1024, 390 and 320 px widths (`docs/screenshots`). There is no page-level horizontal overflow.
- **Not yet verified on real Safari / iPad / iPhone hardware.**
