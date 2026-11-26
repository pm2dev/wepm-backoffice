# 0003 — Billing rates are effective-dated

**Status:** Accepted (2026-11-25). Resolves PRD §19.5.

## Context

Billing rates were a single current value per project (or per task), applied to all uninvoiced hours. With earned revenue and margin now reported per project, changing a rate would silently rewrite the revenue of past work.

## Decision

- Billing rates (project hourly rate, or per-task rate) carry an effective date, like contractor cost rates.
- A time entry is valued at the billing rate in effect on its work date.
- Rates are set per project/task only — not per contractor or role.
- Two rates for the same project/task can't start on the same date. A missing rate blocks the draft for that project and shows as missing in financials, never as $0.
- Invoiced lines keep the rate they were billed at.

## Consequences

- Existing `hourlyRateCents` / `taskRates` need migrating to dated rate rows (an initial rate effective from the project's start, or its earliest time entry).
