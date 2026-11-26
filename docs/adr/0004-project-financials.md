# 0004 — How project financials are calculated

**Status:** Accepted (2026-11-25)

## Context

The owner wants to know what each project costs and earns, for client work and for internal work such as wepm.app development, and to roll that up by customer and for the whole company.

## Decision

**Revenue (client projects only)**
- **Earned**: approved billable time entries × billing rate on the work date, plus billable project expenses.
- **Invoiced**: linked QuickBooks invoice totals. **Collected**: customer payments applied to them.

**Cost (all projects)**
- **Labor**: every approved time entry on the project, billable or not, × the contractor's cost rate on the work date.
- **Expenses**: project expenses (billable or not) plus recurring-expense charges tagged to the project.
- Bonuses are not attributed to projects.
- An expense belongs to one project or to the company; no splitting.

**Margin** = earned − (labor + expenses). Missing rates are shown as missing, never as $0.

**Internal projects** show cost only, with an optional cost budget. Client projects can have a budget in billable dollars (plus optional hours). Budgets cover the project's lifetime.

**Roll-up**: project → customer → company. The company view (Overview) shows client projects, **internal investment** (internal project costs), and **overhead** (costs on no project) as separate lines, plus total margin. Every view has a date filter (work date for hours, expense date for expenses); projects default to lifetime, Overview to this year.

## Consequences

- Fixed-fee contractor work with no logged hours is entered as a *Contractor services* project expense; with a contractor payee it also creates what the business owes them.
- Fixed-fee and retainer billing for customers are left for later, as new project billing methods.
