/**
 * Invoice drafts (ADR-0002). Backoffice prepares one draft per project from
 * uninvoiced billable hours and billable expenses up to a through date. The
 * owner creates the invoice in QuickBooks, marks the draft invoiced, then links
 * it to the synced QuickBooks invoice. QuickBooks stays the system of record.
 */
import { billingBreakdown, cadenceFor } from "./billing";
export { reservedEntryIds, reservedExpenseIds } from "./billing";
import { addDays, isISODate, monthKey, monthStart, weekStart, type ISODate } from "./dates";
import { DomainError, randomId, type IdFactory } from "./payroll";
import type { BackofficeData, BillingCadence, InvoiceDraft, InvoiceExpenseLine, InvoiceLaborLine, QuickBooksInvoice } from "./types";

export const DRAFT_STATUS_LABELS: Record<InvoiceDraft["status"], string> = { draft: "Draft", invoiced: "Invoiced", linked: "Linked to QuickBooks" };

/** The draft an expense is on, if any. */
export function draftForExpense(data: BackofficeData, expenseId: string): InvoiceDraft | undefined {
  return data.invoiceDrafts.find((d) => d.expenseLines.some((l) => l.expenseId === expenseId));
}

/** End of the last full billing period before today. */
export function defaultThroughDate(cadence: BillingCadence, today: ISODate): ISODate {
  if (cadence === "weekly" || cadence === "biweekly") return addDays(weekStart(today), -1); // the last Sunday before today
  const lastOfPrevMonth = addDays(monthStart(monthKey(today)), -1);
  if (cadence === "semimonthly" && Number(today.slice(8, 10)) > 15) return `${today.slice(0, 8)}15`;
  return lastOfPrevMonth;
}

export function draftTotal(d: Pick<InvoiceDraft, "laborLines" | "expenseLines">): number {
  return d.laborLines.reduce((s, l) => s + l.amountCents, 0) + d.expenseLines.reduce((s, l) => s + l.amountCents, 0);
}

function find(data: BackofficeData, id: string): InvoiceDraft {
  const d = data.invoiceDrafts.find((x) => x.id === id);
  if (!d) throw new DomainError("Invoice draft not found.");
  return d;
}

function put(data: BackofficeData, draft: InvoiceDraft): BackofficeData {
  return { ...data, invoiceDrafts: data.invoiceDrafts.map((d) => (d.id === draft.id ? draft : d)) };
}

/** Reserve everything billable on a project, up to the through date, in a new draft. */
export function createInvoiceDraft(data: BackofficeData, input: { projectId: string; throughDate: ISODate }, today: ISODate, newId: IdFactory = randomId) {
  const project = data.projects.find((p) => p.id === input.projectId);
  if (!project) throw new DomainError("Project not found.");
  if (!project.billable || !project.customerId) throw new DomainError("Only billable customer projects are invoiced.");
  if (!isISODate(input.throughDate)) throw new DomainError("Enter the date to invoice through.");
  const b = billingBreakdown(data, input.throughDate)
    .flatMap((c) => c.projects)
    .find((x) => x.project.id === project.id);
  if (!b) throw new DomainError(`Nothing to invoice on ${project.name} through that date.`);
  if (!b.complete) throw new DomainError(`Add a billing rate for ${b.missingRateTasks.join(", ")} before creating this draft.`);

  const id = newId("draft");
  let n = 0;
  const laborLines: InvoiceLaborLine[] = b.lines.map((l) => ({
    id: `${id}_l${++n}`,
    task: l.task,
    minutes: l.minutes,
    rateCents: l.rateCents!,
    amountCents: l.amountCents!,
    firstWorkDate: l.firstWorkDate,
    lastWorkDate: l.lastWorkDate,
    entryIds: l.entryIds,
  }));
  const expenseLines: InvoiceExpenseLine[] = b.expenses.map((x) => ({
    id: `${id}_x${++n}`,
    expenseId: x.id,
    date: x.date,
    vendor: x.vendor,
    description: x.description,
    amountCents: x.amountCents,
  }));
  const draft: InvoiceDraft = {
    id,
    projectId: project.id,
    customerId: project.customerId,
    throughDate: input.throughDate,
    status: "draft",
    createdOn: today,
    laborLines,
    expenseLines,
    amountCents: 0,
  };
  draft.amountCents = draftTotal(draft);
  return { data: { ...data, invoiceDrafts: [...data.invoiceDrafts, draft] }, draft };
}

/** Drop one line from a draft; its hours or expense return to uninvoiced. An emptied draft is deleted. */
export function removeDraftLine(data: BackofficeData, draftId: string, lineId: string): BackofficeData {
  const d = find(data, draftId);
  if (d.status !== "draft") throw new DomainError("Only drafts can change. Undo “invoiced” first.");
  const laborLines = d.laborLines.filter((l) => l.id !== lineId);
  const expenseLines = d.expenseLines.filter((l) => l.id !== lineId);
  if (laborLines.length === d.laborLines.length && expenseLines.length === d.expenseLines.length) throw new DomainError("Line not found.");
  if (!laborLines.length && !expenseLines.length) return { ...data, invoiceDrafts: data.invoiceDrafts.filter((x) => x.id !== d.id) };
  const next = { ...d, laborLines, expenseLines };
  return put(data, { ...next, amountCents: draftTotal(next) });
}

/** After creating the invoice in QuickBooks. Never marks anything paid. */
export function markDraftInvoiced(data: BackofficeData, input: { draftId: string; invoicedOn: ISODate; quickbooksInvoiceRef?: string }): BackofficeData {
  const d = find(data, input.draftId);
  if (d.status !== "draft") throw new DomainError("This draft is already marked invoiced.");
  if (!isISODate(input.invoicedOn)) throw new DomainError("Enter the invoice date.");
  return put(data, { ...d, status: "invoiced", invoicedOn: input.invoicedOn, quickbooksInvoiceRef: input.quickbooksInvoiceRef?.trim() || undefined });
}

/** The customer's synced QuickBooks invoices not yet linked to a draft, newest first. */
export function linkableInvoices(data: BackofficeData, customerId: string): QuickBooksInvoice[] {
  const linked = new Set(data.invoiceDrafts.map((d) => d.qbInvoiceId).filter(Boolean));
  return data.quickbooksInvoices.filter((i) => i.customerId === customerId && !linked.has(i.qbInvoiceId)).sort((a, b) => (a.txnDate < b.txnDate ? 1 : -1));
}

/** Link to the synced QuickBooks invoice. A total that differs is allowed (lines may be adjusted in QuickBooks); the screen warns. */
export function linkDraft(data: BackofficeData, input: { draftId: string; qbInvoiceId: string }): BackofficeData {
  const d = find(data, input.draftId);
  if (d.status !== "invoiced") throw new DomainError(d.status === "draft" ? "Mark the draft invoiced first." : "This draft is already linked.");
  const invoice = data.quickbooksInvoices.find((i) => i.qbInvoiceId === input.qbInvoiceId);
  if (!invoice) throw new DomainError("QuickBooks invoice not found.");
  if (invoice.customerId !== d.customerId) throw new DomainError("That QuickBooks invoice belongs to another customer.");
  if (data.invoiceDrafts.some((x) => x.id !== d.id && x.qbInvoiceId === invoice.qbInvoiceId)) throw new DomainError("That QuickBooks invoice is already linked to another draft.");
  return put(data, { ...d, status: "linked", qbInvoiceId: invoice.qbInvoiceId, quickbooksInvoiceRef: d.quickbooksInvoiceRef ?? invoice.docNumber });
}

/** Step back: Linked → Invoiced → Draft → deleted (its items return to uninvoiced). */
export function undoDraftStep(data: BackofficeData, draftId: string): BackofficeData {
  const d = find(data, draftId);
  if (d.status === "linked") return put(data, { ...d, status: "invoiced", qbInvoiceId: undefined });
  if (d.status === "invoiced") return put(data, { ...d, status: "draft", invoicedOn: undefined });
  return { ...data, invoiceDrafts: data.invoiceDrafts.filter((x) => x.id !== d.id) };
}

/** The linked QuickBooks invoice, if any. */
export function linkedInvoice(data: BackofficeData, d: InvoiceDraft): QuickBooksInvoice | undefined {
  return d.qbInvoiceId ? data.quickbooksInvoices.find((i) => i.qbInvoiceId === d.qbInvoiceId) : undefined;
}

/** Drafts for the throughDate default of a project. */
export function defaultThroughFor(data: BackofficeData, projectId: string, today: ISODate): ISODate {
  return defaultThroughDate(cadenceFor(data, projectId), today);
}
