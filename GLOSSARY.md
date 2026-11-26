# Glossary

The words this app uses for its domain. Use these terms in code, issues and UI copy; avoid the listed synonyms.

## People

- **User** — someone who signs in to Backoffice. Today there is exactly one: the owner. *Not* a person who logs time. See ADR-0001.
- **Owner** — the business owner and only User.
- **Contractor** — anyone who logs time in wepm.app, including the owner when billing their own hours. Matched to wepm.app by `wepmUserId`, never by name. *Avoid:* user, employee, resource.
- **Cost rate** — what the business pays a Contractor per hour. Effective-dated.

## Customers and projects

- **Customer** — a company the business bills. Holds name, billing cadence, QuickBooks customer ID and notes. Contacts live in QuickBooks, not here. *Avoid:* client (except when quoting source data).
- **Project** — a body of work. Belongs to one Customer (a **client project**) or to none (an **internal project**, e.g. wepm.app development).
  - **Status** — Active, On hold, or Completed. Optional start and end dates.
  - **Billing method** — time and materials only: one hourly rate, or a rate per task.
- **Billing rate** — what a Customer is charged per hour on a Project (or task). Effective-dated (ADR-0003). Set per project/task, never per Contractor. *Avoid:* bill rate, price.
- **Budget** — an optional lifetime limit on a Project. Client projects: billable dollars (plus optional hours). Internal projects: **cost budget** in dollars.

## Time and costs

- **Time entry** — approved hours a Contractor logged against a Project and task. Billable only on a billable client Project; every approved entry is labor cost.
- **Labor cost** — approved hours × the Contractor's cost rate on the work date, billable or not.
- **Project expense** — a one-off cost tied to one Project or to the company (overhead): date, vendor, amount, category, billable flag, paid by, receipt URL, notes. Never split across projects.
  - **Category** — Software, Hardware/devices, Travel, Contractor services, Other (fixed list).
  - **Billable** — passed to the Customer at cost on an invoice draft. Defaults to no.
  - **Paid by** — one of the owner's Payment accounts, or a Contractor. Contractor-paid expenses create a linked **reimbursement**; a Contractor services expense with a Contractor payee creates what the business owes them.
  - *Avoid:* bill (that's a recurring expense), charge.
- **Recurring expense** (bill or subscription) — a company bill on a schedule. May be tagged to one Project, which makes its **charges** that Project's cost. Never billable to a Customer.
- **Overhead** — costs not tied to any Project.
- **Internal investment** — the total cost of internal projects. Reported apart from overhead.

## Invoicing and money in

- **Invoice draft** — what Backoffice prepares for one Project: uninvoiced billable time entries and billable project expenses up to a **through date**. Statuses: Draft → Invoiced (created in QuickBooks) → Linked (matched to a QuickBooks invoice). Items on a draft are reserved. Replaces *billing record*. See ADR-0002.
- **QuickBooks invoice** — the real invoice, synced from QuickBooks. The source of truth for what was billed and what is owed.
- **Customer payment** (`InvoiceReceipt`) — money received in QuickBooks.

## Financials

- **Earned revenue** — billable time entries × billing rate on the work date, plus billable project expenses.
- **Invoiced revenue** — totals of linked QuickBooks invoices.
- **Collected revenue** — customer payments applied to those invoices.
- **Project cost** — labor cost + project expenses + tagged recurring charges.
- **Margin** — earned revenue − project cost. Internal projects have no margin. Missing rates are shown as missing, never $0.
- Views roll up **project → customer → company (Overview)**. See ADR-0004.
