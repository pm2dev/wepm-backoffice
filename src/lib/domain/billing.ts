import { compareDates, isISODate, type ISODate } from "./dates";
import { ingestApprovedTime } from "./ingest";
import { payForMinutes, type Cents } from "./money";
import { DomainError, randomId, type IdFactory } from "./payroll";
import type { BackofficeData, BillingCadence, BillingLine, BillingRecord, Customer, Project, TimeEntry } from "./types";

export const CADENCE_LABEL: Record<BillingCadence, string> = {
  weekly: "Weekly",
  biweekly: "Every two weeks",
  semimonthly: "Twice a month",
  monthly: "Monthly",
};

export class FormError extends DomainError {
  constructor(public fields: Record<string, string>) {
    super(Object.values(fields)[0] ?? "Please check the form.");
  }
}

// ---------------------------------------------------------------------------
// Customers and projects
// ---------------------------------------------------------------------------

export type CustomerInput = Omit<Customer, "id">;

function validateCustomer(data: BackofficeData, input: CustomerInput, selfId?: string) {
  const e: Record<string, string> = {};
  if (!input.name.trim()) e.name = "Enter the customer's name.";
  else if (data.customers.some((c) => c.id !== selfId && c.name.trim().toLowerCase() === input.name.trim().toLowerCase())) e.name = "A customer with this name already exists.";
  const qb = input.quickbooksCustomerId?.trim();
  if (qb && data.customers.some((c) => c.id !== selfId && c.quickbooksCustomerId === qb)) e.quickbooksCustomerId = "Another customer already uses this QuickBooks ID.";
  if (Object.keys(e).length) throw new FormError(e);
}

const clean = <T extends { notes?: string; quickbooksCustomerId?: string }>(x: T): T => ({
  ...x,
  notes: x.notes?.trim() || undefined,
  quickbooksCustomerId: x.quickbooksCustomerId?.trim() || undefined,
});

export function addCustomer(data: BackofficeData, input: CustomerInput, newId: IdFactory = randomId) {
  validateCustomer(data, input);
  const customer: Customer = clean({ ...input, id: newId("cust"), name: input.name.trim() });
  return { data: { ...data, customers: [...data.customers, customer] }, customer };
}

export function updateCustomer(data: BackofficeData, id: string, input: CustomerInput) {
  if (!data.customers.some((c) => c.id === id)) throw new DomainError("Customer not found.");
  validateCustomer(data, input, id);
  const customer: Customer = clean({ ...input, id, name: input.name.trim() });
  return { data: { ...data, customers: data.customers.map((c) => (c.id === id ? customer : c)) }, customer };
}

export type ProjectInput = Omit<Project, "id">;

function validateProject(data: BackofficeData, input: ProjectInput, selfId?: string) {
  const e: Record<string, string> = {};
  if (!input.name.trim()) e.name = "Enter the project name.";
  if (input.customerId && !data.customers.some((c) => c.id === input.customerId)) e.customerId = "Choose a customer or Internal.";
  if (input.billable && !input.customerId) e.billable = "Internal projects can't be billable — choose a customer first.";
  if (input.billable && input.billingMethod === "hourly" && input.hourlyRateCents !== undefined && (!Number.isSafeInteger(input.hourlyRateCents) || input.hourlyRateCents <= 0)) {
    e.hourlyRateCents = "Enter an hourly billing rate greater than $0.";
  }
  for (const [task, cents] of Object.entries(input.taskRates)) {
    if (!task.trim()) e.taskRates = "Every task rate needs a task name.";
    else if (!Number.isSafeInteger(cents) || cents <= 0) e.taskRates = `Enter a rate greater than $0 for “${task}”.`;
  }
  const wepm = input.wepmProjectId?.trim();
  if (wepm && data.projects.some((p) => p.id !== selfId && p.wepmProjectId === wepm)) e.wepmProjectId = "Another project already uses this wepm.app ID.";
  if (Object.keys(e).length) throw new FormError(e);
}

function normalizeProject(input: ProjectInput): ProjectInput {
  const taskRates: Record<string, Cents> = {};
  for (const [t, c] of Object.entries(input.taskRates)) taskRates[t.trim()] = c;
  return { ...input, name: input.name.trim(), wepmProjectId: input.wepmProjectId?.trim() || undefined, taskRates, customerId: input.customerId || null };
}

/** Adding a wepm.app project ID can resolve held-back time entries, so exceptions are re-checked. */
export function addProject(data: BackofficeData, input: ProjectInput, today: ISODate, newId: IdFactory = randomId) {
  validateProject(data, input);
  const project: Project = { ...normalizeProject(input), id: newId("p") };
  return { data: reprocessExceptions({ ...data, projects: [...data.projects, project] }, today, newId).data, project };
}

export function updateProject(data: BackofficeData, id: string, input: ProjectInput, today: ISODate, newId: IdFactory = randomId) {
  if (!data.projects.some((p) => p.id === id)) throw new DomainError("Project not found.");
  validateProject(data, input, id);
  const project: Project = { ...normalizeProject(input), id };
  return { data: reprocessExceptions({ ...data, projects: data.projects.map((p) => (p.id === id ? project : p)) }, today, newId).data, project };
}

/**
 * Re-run held-back approved time records through ingestion. Records whose
 * contractor and project now map explicitly become normal time entries;
 * the rest stay as visible exceptions.
 */
export function reprocessExceptions(data: BackofficeData, today: ISODate, newId: IdFactory = randomId): { data: BackofficeData; resolved: number } {
  if (data.timeExceptions.length === 0) return { data, resolved: 0 };
  const pending = data.timeExceptions;
  const result = ingestApprovedTime({ ...data, timeExceptions: [] }, pending.map((x) => x.record), today, newId);
  // Keep original exception records (and their received dates) for anything still unresolved.
  const stillFailing = new Set(result.data.timeExceptions.map((x) => x.record.sourceEntryId));
  return {
    data: { ...result.data, timeExceptions: pending.filter((x) => stillFailing.has(x.record.sourceEntryId)) },
    resolved: result.added,
  };
}

// ---------------------------------------------------------------------------
// Billing breakdown
// ---------------------------------------------------------------------------

export function invoicedEntryIds(data: BackofficeData): Set<string> {
  const ids = new Set<string>();
  for (const r of data.billingRecords) for (const id of r.entryIds) ids.add(id);
  return ids;
}

/** Approved, billable, not-yet-invoiced operational hours. Internal and nonbillable time never appears. */
export function uninvoicedEntries(data: BackofficeData, through?: ISODate): TimeEntry[] {
  const billable = new Set(data.projects.filter((p) => p.billable && p.customerId).map((p) => p.id));
  const invoiced = invoicedEntryIds(data);
  return data.timeEntries.filter(
    (e) => e.source === "wepm" && e.approvedAt && e.projectId && billable.has(e.projectId) && !invoiced.has(e.id) && (!through || e.workDate <= through),
  );
}

export function billingRateFor(project: Project, task: string): Cents | null {
  if (project.billingMethod === "hourly") return project.hourlyRateCents ?? null;
  return project.taskRates[task] ?? null;
}

export type BreakdownLine = { task: string; minutes: number; rateCents: Cents | null; amountCents: Cents | null; entryCount: number };

export type ProjectBreakdown = {
  project: Project;
  entries: TimeEntry[];
  lines: BreakdownLine[];
  minutes: number;
  /** Total of lines with a known rate. */
  knownAmountCents: Cents;
  /** Lines without a rate — the project's total is incomplete until they're priced. */
  missingRateTasks: string[];
  complete: boolean;
  firstWorkDate: ISODate;
  lastWorkDate: ISODate;
};

export type CustomerBreakdown = { customer: Customer; projects: ProjectBreakdown[]; knownAmountCents: Cents; complete: boolean };

/**
 * Uninvoiced billable hours × the project or task billing rate, grouped by
 * customer and project. Customer billing rates are independent of contractor pay.
 * Rounding: once per task line (same rule as payroll).
 */
export function billingBreakdown(data: BackofficeData, through?: ISODate): CustomerBreakdown[] {
  const entries = uninvoicedEntries(data, through);
  const byProject = new Map<string, TimeEntry[]>();
  for (const e of entries) byProject.set(e.projectId!, [...(byProject.get(e.projectId!) ?? []), e]);

  const projectBreakdowns: ProjectBreakdown[] = [];
  for (const [projectId, list] of byProject) {
    const project = data.projects.find((p) => p.id === projectId)!;
    const byTask = new Map<string, TimeEntry[]>();
    for (const e of list) byTask.set(e.task, [...(byTask.get(e.task) ?? []), e]);
    const lines: BreakdownLine[] = [...byTask.entries()]
      .map(([task, es]) => {
        const minutes = es.reduce((s, e) => s + e.minutes, 0);
        const rate = billingRateFor(project, task);
        return { task, minutes, rateCents: rate, amountCents: rate === null ? null : payForMinutes(minutes, rate), entryCount: es.length };
      })
      .sort((a, b) => a.task.localeCompare(b.task));
    const dates = list.map((e) => e.workDate).sort(compareDates);
    const missing = lines.filter((l) => l.rateCents === null).map((l) => l.task);
    projectBreakdowns.push({
      project,
      entries: list.sort((a, b) => compareDates(a.workDate, b.workDate)),
      lines,
      minutes: lines.reduce((s, l) => s + l.minutes, 0),
      knownAmountCents: lines.reduce((s, l) => s + (l.amountCents ?? 0), 0),
      missingRateTasks: missing,
      complete: missing.length === 0,
      firstWorkDate: dates[0],
      lastWorkDate: dates[dates.length - 1],
    });
  }

  return data.customers
    .map((customer) => {
      const projects = projectBreakdowns.filter((p) => p.project.customerId === customer.id).sort((a, b) => a.project.name.localeCompare(b.project.name));
      return { customer, projects, knownAmountCents: projects.reduce((s, p) => s + p.knownAmountCents, 0), complete: projects.every((p) => p.complete) };
    })
    .filter((c) => c.projects.length > 0)
    .sort((a, b) => a.customer.name.localeCompare(b.customer.name));
}

/**
 * After creating the invoice in QuickBooks, mark the project's uninvoiced
 * hours (through a date) invoiced. Preserves the billed amount. Does not mark
 * the invoice or any contractor paid.
 */
export function markInvoiced(
  data: BackofficeData,
  input: { projectId: string; through?: ISODate; invoicedOn: ISODate; quickbooksInvoiceRef?: string },
  newId: IdFactory = randomId,
): { data: BackofficeData; record: BillingRecord } {
  if (!isISODate(input.invoicedOn)) throw new DomainError("Enter the invoice date.");
  const breakdown = billingBreakdown(data, input.through)
    .flatMap((c) => c.projects)
    .find((p) => p.project.id === input.projectId);
  if (!breakdown) throw new DomainError("There are no uninvoiced billable hours for this project.");
  if (!breakdown.complete) throw new DomainError(`Add a billing rate for ${breakdown.missingRateTasks.join(", ")} before marking these hours invoiced.`);
  const lines: BillingLine[] = breakdown.lines.map((l) => ({ task: l.task, minutes: l.minutes, rateCents: l.rateCents!, amountCents: l.amountCents! }));
  const record: BillingRecord = {
    id: newId("bill"),
    projectId: breakdown.project.id,
    customerId: breakdown.project.customerId!,
    entryIds: breakdown.entries.map((e) => e.id),
    firstWorkDate: breakdown.firstWorkDate,
    lastWorkDate: breakdown.lastWorkDate,
    lines,
    amountCents: breakdown.knownAmountCents,
    invoicedOn: input.invoicedOn,
    quickbooksInvoiceRef: input.quickbooksInvoiceRef?.trim() || undefined,
  };
  return { data: { ...data, billingRecords: [...data.billingRecords, record] }, record };
}

/** Undo a mistaken "mark invoiced": the hours return to the next billing recommendation. */
export function removeBillingRecord(data: BackofficeData, id: string): BackofficeData {
  if (!data.billingRecords.some((r) => r.id === id)) throw new DomainError("Invoice record not found.");
  return { ...data, billingRecords: data.billingRecords.filter((r) => r.id !== id) };
}

/** Per-project uninvoiced and invoiced totals, for lists. */
export function projectSummary(data: BackofficeData, projectId: string) {
  const all = data.timeEntries.filter((e) => e.projectId === projectId && e.source === "wepm" && e.approvedAt);
  const breakdown = billingBreakdown(data).flatMap((c) => c.projects).find((p) => p.project.id === projectId);
  const records = data.billingRecords.filter((r) => r.projectId === projectId);
  return {
    approvedMinutes: all.reduce((s, e) => s + e.minutes, 0),
    uninvoicedMinutes: breakdown?.minutes ?? 0,
    uninvoicedAmountCents: breakdown?.knownAmountCents ?? 0,
    uninvoicedComplete: breakdown?.complete ?? true,
    invoicedAmountCents: records.reduce((s, r) => s + r.amountCents, 0),
    records: records.sort((a, b) => (a.invoicedOn < b.invoicedOn ? 1 : -1)),
  };
}

/** Distinct task names used on a project (for setting task rates). */
export function projectTasks(data: BackofficeData, projectId: string): string[] {
  const p = data.projects.find((x) => x.id === projectId);
  const tasks = new Set<string>(Object.keys(p?.taskRates ?? {}));
  for (const e of data.timeEntries) if (e.projectId === projectId) tasks.add(e.task);
  return [...tasks].sort();
}
