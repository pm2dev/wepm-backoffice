# Backoffice — WEPM Labs

Private business-management workspace (see the PRD). **Current milestone: Phase 1 frontend prototype — Payroll**, running on clearly labeled sample data. Not for real data: there is no authentication, database, or integration yet.

## Run

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # domain/acceptance tests (vitest)
npm run build && npm start
```

Use **Demo controls** in the purple banner to set the business date (the sample data is built around Sat, Oct 31, 2026) or reset the sample data.

## What's implemented

| Route | Purpose |
|---|---|
| `/payroll` | What's due: every unpaid payroll, bonus and reimbursement record, with overdue first and then upcoming. Shows totals, the time-entry exceptions notice, multi-select for one contractor, and payment recording |
| `/payroll/draft/[key]` | Review approved hours, the rate split by actual work date, and finalization. Missing rates block finalization |
| `/payroll/records/[id]` | Finalized record with its preserved calculation, the payments applied, and the outstanding balance |
| `/payroll/history` | Payment history, filterable by contractor |
| Everything else | "Coming soon" |

## Layout

```
src/lib/domain/     pure business rules (dates, money, rates, schedule, payroll, ingestion) + tests
src/lib/data/       repository interface, sample-data adapter (localStorage), fixtures, React provider/clock
src/components/ui/  shared primitives (button, badge, dialog, fields, states)
src/components/layout/  app shell, navigation, sample banner, notices
src/components/payroll/ payroll pages and dialogs
src/app/            routes only
```

Pages talk only to `BackofficeRepository`. A live implementation backed by authenticated APIs and Postgres replaces `SampleRepository` in Phase 5.

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

## Verification so far

- 13 unit/acceptance tests (rate boundary, re-delivery, finalize ≠ paid, partial payment, payroll + bonus paid together, late approval, missing rate, historical imports don't create debt).
- Headless Chromium walk-through of finalize → bulk pay → partial pay, with screenshots at 1440, 1366, 1024, 390 and 320 px widths (`docs/screenshots`). There is no page-level horizontal overflow.
- **Not yet verified on real Safari / iPad / iPhone hardware.**
