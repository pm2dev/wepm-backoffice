import { compareDates, isISODate, type ISODate } from "./dates";
import { ingestApprovedTime } from "./ingest";
import { payForMinutes, type Cents } from "./money";
import { DomainError, randomId, type IdFactory } from "./payroll";
import type { BackofficeData, BillingCadence, BillingLine, BillingRate, BillingRecord, Customer, Project, ProjectStatus, TimeEntry } from "./types";

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

/** Only the editable customer fields — never copy unknown keys (or id) from input. */
const customerFields = (x: CustomerInput) => ({
  name: x.name.trim(),
  billingCadence: x.billingCadence,
  quickbooksCustomerId: x.quickbooksCustomerId?.trim() || undefined,
  notes: x.notes?.trim() || undefined,
});

export function addCustomer(data: BackofficeData, input: CustomerInput, newId: IdFactory = randomId) {
  validateCustomer(data, input);
  const customer: Customer = { id: newId("cust"), ...customerFields(input) };
  return { data: { ...data, customers: [...data.customers, customer] }, customer };
}

export function updateCustomer(data: BackofficeData, id: string, input: CustomerInput) {
  if (!data.customers.some((c) => c.id === id)) throw new DomainError("Customer not found.");
  validateCustomer(data, input, id);
  const customer: Customer = { id, ...customerFields(input) };
  return { data: { ...data, customers: data.customers.map((c) => (c.id === id ? customer : c)) }, customer };
}

export type ProjectInput = Omit<Project, "id">;

function validateProject(data: BackofficeData, input: ProjectInput, selfId?: string) {
  const e: Record<string, string> = {};
  if (!input.name.trim()) e.name = "Enter the project name.";
  if (input.customerId && !data.customers.some((c) => c.id === input.customerId)) e.customerId = "Choose a customer or Internal.";
  if (input.billable && !input.customerId) e.billable = "Internal projects can't be billable — choose a customer first.";
  const wepm = input.wepmProjectId?.trim();
  if (wepm && data.projects.some((p) => p.id !== selfId && p.wepmProjectId === wepm)) e.wepmProjectId = "Another project already uses this wepm.app ID.";
  if (!PROJECT_STATUSES.includes(input.status)) e.status = "Choose a status.";
  if (input.startDate && !isISODate(input.startDate)) e.startDate = "Enter a valid start date.";
  if (input.endDate && !isISODate(input.endDate)) e.endDate = "Enter a valid end date.";
  else if (input.startDate && input.endDate && isISODate(input.startDate) && compareDates(input.endDate, input.startDate) < 0) e.endDate = "The end date can't be before the start date.";
  const positive = (n: number | undefined) => n === undefined || (Number.isSafeInteger(n) && n > 0);
  if (input.customerId) {
    if (!positive(input.budgetCents)) e.budgetCents = "Enter a budget greater than $0, or leave it blank.";
    if (!positive(input.budgetMinutes)) e.budgetMinutes = "Enter budget hours greater than 0, or leave it blank.";
  } else if (!positive(input.costBudgetCents)) e.costBudgetCents = "Enter a cost budget greater than $0, or leave it blank.";
  if (Object.keys(e).length) throw new FormError(e);
}

const PROJECT_STATUSES: ProjectStatus[] = ["active", "on_hold", "completed"];

function normalizeProject(input: ProjectInput): ProjectInput {
  // Explicit fields only — never copy unknown keys from input.
  return {
    name: input.name.trim(),
    customerId: input.customerId || null,
    billable: !!input.billable,
    billingMethod: input.billingMethod,
    billingCadence: input.billingCadence,
    wepmProjectId: input.wepmProjectId?.trim() || undefined,
    status: input.status,
    startDate: input.startDate || undefined,
    endDate: input.endDate || undefined,
    // Client projects have a billable budget; internal projects a cost budget.
    budgetCents: input.customerId ? input.budgetCents : undefined,
    budgetMinutes: input.customerId ? input.budgetMinutes : undefined,
    costBudgetCents: input.customerId ? undefined : input.costBudgetCents,
  };
}

/** A new project can start with billing rates, all effective from `ratesFrom` (default: its start date, else today). */
export type NewProjectInput = ProjectInput & { initialRates?: { task: string | null; rateCents: Cents }[]; ratesFrom?: ISODate };

/** Adding a wepm.app project ID can resolve held-back time entries, so exceptions are re-checked. */
export function addProject(data: BackofficeData, input: NewProjectInput, today: ISODate, newId: IdFactory = randomId) {
  validateProject(data, input);
  const effectiveDate = input.ratesFrom || input.startDate || today;
  const initial = (input.initialRates ?? []).map((r) => ({ task: r.task === null ? null : r.task.trim(), rateCents: r.rateCents }));
  const e: Record<string, string> = {};
  if (initial.length && (!input.billable || !input.customerId)) e.billable = "Only billable customer projects have billing rates.";
  if (initial.length && !isISODate(effectiveDate)) e.ratesFrom = "Enter the date these rates start.";
  for (const r of initial) {
    if (r.task === "") e.rates = "Every rate needs a task name.";
    else if (!Number.isSafeInteger(r.rateCents) || r.rateCents <= 0) e.rates = `Enter a rate greater than $0${r.task ? ` for “${r.task}”` : ""}.`;
  }
  if (new Set(initial.map((r) => r.task)).size !== initial.length) e.rates = "Each task can have only one starting rate.";
  if (Object.keys(e).length) throw new FormError(e);
  const project: Project = { ...normalizeProject(input), id: newId("p") };
  const rates: BillingRate[] = initial.map((r) => ({ id: newId("brate"), projectId: project.id, task: r.task, effectiveDate, rateCents: r.rateCents }));
  return { data: reprocessExceptions({ ...data, projects: [...data.projects, project], billingRates: [...data.billingRates, ...rates] }, today, newId).data, project };
}

// ---------------------------------------------------------------------------
// Billing rates (effective-dated, ADR-0003)
// ---------------------------------------------------------------------------

/** The billing rate on a work date, or null when none covers it — never $0, never "today's rate". */
export function billingRateOn(rates: BillingRate[], project: Project, task: string, workDate: ISODate): Cents | null {
  const key = project.billingMethod === "hourly" ? null : task;
  let best: BillingRate | null = null;
  for (const r of rates) {
    if (r.projectId !== project.id || r.task !== key || r.effectiveDate > workDate) continue;
    if (!best || r.effectiveDate > best.effectiveDate) best = r;
  }
  return best ? best.rateCents : null;
}

/** A project's rates for its current billing method, newest first within each task. */
export function billingRateHistory(data: BackofficeData, projectId: string): BillingRate[] {
  const project = data.projects.find((p) => p.id === projectId);
  if (!project) return [];
  return data.billingRates
    .filter((r) => r.projectId === projectId && (project.billingMethod === "hourly" ? r.task === null : r.task !== null))
    .sort((a, b) => (a.task ?? "").localeCompare(b.task ?? "") || (a.effectiveDate < b.effectiveDate ? 1 : -1));
}

/** The rate in effect today for each task (or the one hourly rate). */
export function currentBillingRate(data: BackofficeData, project: Project, task: string | null, today: ISODate): Cents | null {
  return billingRateOn(data.billingRates, project, task ?? "", today);
}

export type BillingRateInput = { projectId: string; task: string | null; effectiveDate: ISODate; rateCents: Cents };

export function addBillingRate(data: BackofficeData, input: BillingRateInput, newId: IdFactory = randomId): { data: BackofficeData; rate: BillingRate } {
  const project = data.projects.find((p) => p.id === input.projectId);
  if (!project) throw new DomainError("Project not found.");
  if (!project.billable || !project.customerId) throw new DomainError("Only billable customer projects have billing rates.");
  const task = project.billingMethod === "hourly" ? null : (input.task ?? "").trim();
  const e: Record<string, string> = {};
  if (task === "") e.task = "Enter the task this rate is for.";
  if (!isISODate(input.effectiveDate)) e.effectiveDate = "Enter the date this rate starts.";
  else if (data.billingRates.some((r) => r.projectId === project.id && r.task === task && r.effectiveDate === input.effectiveDate)) {
    e.effectiveDate = task ? `A rate for ${task} already starts on this date.` : "A rate already starts on this date.";
  }
  if (!Number.isSafeInteger(input.rateCents) || input.rateCents <= 0) e.rateCents = "Enter a rate greater than $0.";
  if (Object.keys(e).length) throw new FormError(e);
  const rate: BillingRate = { id: newId("brate"), projectId: project.id, task, effectiveDate: input.effectiveDate, rateCents: input.rateCents };
  return { data: { ...data, billingRates: [...data.billingRates, rate] }, rate };
}

/** Remove a mistaken rate. Invoiced lines keep the rate they were billed at. */
export function removeBillingRate(data: BackofficeData, id: string): BackofficeData {
  if (!data.billingRates.some((r) => r.id === id)) throw new DomainError("Billing rate not found.");
  return { ...data, billingRates: data.billingRates.filter((r) => r.id !== id) };
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

export type BreakdownLine = { task: string; minutes: number; rateCents: Cents | null; amountCents: Cents | null; entryCount: number; firstWorkDate: ISODate; lastWorkDate: ISODate };

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
    // One line per task and rate: a rate change inside the period splits the task's hours.
    const byLine = new Map<string, { task: string; rate: Cents | null; entries: TimeEntry[] }>();
    for (const e of list) {
      const rate = billingRateOn(data.billingRates, project, e.task, e.workDate);
      const key = `${e.task}\u0000${rate ?? "none"}`;
      const line = byLine.get(key) ?? { task: e.task, rate, entries: [] };
      line.entries.push(e);
      byLine.set(key, line);
    }
    const lines: BreakdownLine[] = [...byLine.values()]
      .map(({ task, rate, entries: es }) => {
        const minutes = es.reduce((s, e) => s + e.minutes, 0);
        const dates = es.map((e) => e.workDate).sort(compareDates);
        return { task, minutes, rateCents: rate, amountCents: rate === null ? null : payForMinutes(minutes, rate), entryCount: es.length, firstWorkDate: dates[0], lastWorkDate: dates[dates.length - 1] };
      })
      .sort((a, b) => a.task.localeCompare(b.task) || compareDates(a.firstWorkDate, b.firstWorkDate));
    const dates = list.map((e) => e.workDate).sort(compareDates);
    const missing = [...new Set(lines.filter((l) => l.rateCents === null).map((l) => l.task))];
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
  const tasks = new Set<string>(data.billingRates.filter((r) => r.projectId === p?.id && r.task !== null).map((r) => r.task!));
  for (const e of data.timeEntries) if (e.projectId === projectId) tasks.add(e.task);
  return [...tasks].sort();
}
