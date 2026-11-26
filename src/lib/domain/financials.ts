/**
 * Project financials (ADR-0004): what a project earns and costs, rolled up by
 * customer and for the whole company. Pure functions over BackofficeData.
 */
import { billingRateOn } from "./billing";
import { addMonthsToKey, monthEnd, monthKey, monthStart, type ISODate } from "./dates";
import { listCharges } from "./expenses";
import { payForMinutes, type Cents } from "./money";
import { rateOn } from "./rates";
import type { BackofficeData, Project } from "./types";

/** Inclusive date range; either end may be open. Omit for lifetime. */
export type DateRange = { from?: ISODate; to?: ISODate };

const inRange = (date: ISODate, r?: DateRange) => (!r?.from || date >= r.from) && (!r?.to || date <= r.to);

export type MissingRate = { contractorId?: string; task?: string; minutes: number; from: ISODate; to: ISODate };

export type ProjectFinancials = {
  project: Project;
  /** Client projects have revenue and margin; internal projects only cost. */
  isClient: boolean;
  revenue: {
    /** Approved billable hours × billing rate on the work date, plus billable expenses. */
    earnedCents: Cents;
    earnedLaborCents: Cents;
    earnedExpenseCents: Cents;
    billableMinutes: number;
    /** Invoice drafts marked invoiced (the QuickBooks total once linked). */
    invoicedCents: Cents;
    /** Paid on linked QuickBooks invoices. */
    collectedCents: Cents;
  } | null;
  cost: {
    /** Every approved hour on the project × the contractor's cost rate on the work date. */
    laborCents: Cents;
    laborMinutes: number;
    /** One-off project expenses (billable or not). */
    projectExpenseCents: Cents;
    /** Recurring bill and subscription charges tagged to the project. */
    recurringCents: Cents;
    totalCents: Cents;
  };
  /** Earned − cost. Null for internal projects. */
  marginCents: Cents | null;
  /** Margin as a share of earned revenue (0–1), when there is revenue. */
  marginRatio: number | null;
  /** Hours that couldn't be valued: no billing rate (revenue) or no cost rate (labor). Never counted as $0. */
  missingBillingRates: MissingRate[];
  missingCostRates: MissingRate[];
};

function mergeMissing(list: MissingRate[], key: string, item: Omit<MissingRate, "from" | "to"> & { date: ISODate }, index: Map<string, MissingRate>) {
  const cur = index.get(key);
  if (cur) {
    cur.minutes += item.minutes;
    if (item.date < cur.from) cur.from = item.date;
    if (item.date > cur.to) cur.to = item.date;
    return;
  }
  const m: MissingRate = { contractorId: item.contractorId, task: item.task, minutes: item.minutes, from: item.date, to: item.date };
  index.set(key, m);
  list.push(m);
}

/** One project's financials over a date range (lifetime when omitted). Charges after `today` aren't costs yet. */
export function projectFinancials(data: BackofficeData, projectId: string, today: ISODate, range?: DateRange): ProjectFinancials {
  const project = data.projects.find((p) => p.id === projectId);
  if (!project) throw new Error("Project not found.");
  const isClient = !!project.customerId;
  const billable = isClient && project.billable;

  const entries = data.timeEntries.filter((e) => e.projectId === projectId && e.source === "wepm" && e.approvedAt && inRange(e.workDate, range));

  // Labor cost: every approved hour, billable or not, at the contractor's cost rate on the work date.
  const missingCostRates: MissingRate[] = [];
  const missingCostIndex = new Map<string, MissingRate>();
  const costMinutesByRate = new Map<string, number>();
  let laborMinutes = 0;
  for (const e of entries) {
    laborMinutes += e.minutes;
    const rate = rateOn(data.rates, e.contractorId, e.workDate);
    if (rate === null) mergeMissing(missingCostRates, e.contractorId, { contractorId: e.contractorId, minutes: e.minutes, date: e.workDate }, missingCostIndex);
    else costMinutesByRate.set(`${e.contractorId}|${rate}`, (costMinutesByRate.get(`${e.contractorId}|${rate}`) ?? 0) + e.minutes);
  }
  // Round once per contractor and rate, the same rule as payroll.
  let laborCents = 0;
  for (const [key, minutes] of costMinutesByRate) laborCents += payForMinutes(minutes, Number(key.split("|")[1]));

  const expenses = data.projectExpenses.filter((x) => x.projectId === projectId && inRange(x.date, range));
  const projectExpenseCents = expenses.reduce((s, x) => s + x.amountCents, 0);
  const chargesUntil = range?.to && range.to < today ? range.to : today;
  const recurringCents = listCharges(data, chargesUntil)
    .filter((c) => c.projectId === projectId && inRange(c.dueDate, range))
    .reduce((s, c) => s + c.amountCents, 0);
  const costTotal = laborCents + projectExpenseCents + recurringCents;

  // Revenue: billable hours at the billing rate on the work date, plus billable expenses.
  const missingBillingRates: MissingRate[] = [];
  let revenue: ProjectFinancials["revenue"] = null;
  if (isClient) {
    const missingIndex = new Map<string, MissingRate>();
    const billMinutesByRate = new Map<string, number>();
    let billableMinutes = 0;
    if (billable) {
      for (const e of entries) {
        billableMinutes += e.minutes;
        const rate = billingRateOn(data.billingRates, project, e.task, e.workDate);
        if (rate === null) mergeMissing(missingBillingRates, e.task, { task: e.task, minutes: e.minutes, date: e.workDate }, missingIndex);
        else billMinutesByRate.set(`${e.task}|${rate}`, (billMinutesByRate.get(`${e.task}|${rate}`) ?? 0) + e.minutes);
      }
    }
    let earnedLaborCents = 0;
    for (const [key, minutes] of billMinutesByRate) earnedLaborCents += payForMinutes(minutes, Number(key.split("|")[1]));
    const earnedExpenseCents = billable ? expenses.filter((x) => x.billable).reduce((s, x) => s + x.amountCents, 0) : 0;

    const invoiced = data.invoiceDrafts.filter((d) => d.projectId === projectId && d.status !== "draft" && inRange(d.invoicedOn ?? d.createdOn, range));
    let invoicedCents = 0;
    let collectedCents = 0;
    for (const d of invoiced) {
      const qb = d.qbInvoiceId ? data.quickbooksInvoices.find((i) => i.qbInvoiceId === d.qbInvoiceId) : undefined;
      invoicedCents += qb ? qb.totalCents : d.amountCents;
      if (qb) collectedCents += qb.manuallyPaid ? qb.totalCents : qb.totalCents - qb.balanceCents;
    }
    revenue = { earnedCents: earnedLaborCents + earnedExpenseCents, earnedLaborCents, earnedExpenseCents, billableMinutes, invoicedCents, collectedCents };
  }

  const marginCents = revenue ? revenue.earnedCents - costTotal : null;
  return {
    project,
    isClient,
    revenue,
    cost: { laborCents, laborMinutes, projectExpenseCents, recurringCents, totalCents: costTotal },
    marginCents,
    marginRatio: revenue && revenue.earnedCents > 0 && marginCents !== null ? marginCents / revenue.earnedCents : null,
    missingBillingRates,
    missingCostRates,
  };
}

export type BudgetUse = { budgetCents?: Cents; usedCents: Cents; budgetMinutes?: number; usedMinutes?: number; kind: "billable" | "cost" } | null;

/** Lifetime budget use: billable value (and hours) for client projects, cost for internal ones. */
export function budgetUse(data: BackofficeData, projectId: string, today: ISODate): BudgetUse {
  const f = projectFinancials(data, projectId, today);
  const p = f.project;
  if (f.isClient) {
    if (!p.budgetCents && !p.budgetMinutes) return null;
    return { kind: "billable", budgetCents: p.budgetCents, usedCents: f.revenue!.earnedCents, budgetMinutes: p.budgetMinutes, usedMinutes: f.revenue!.billableMinutes };
  }
  if (!p.costBudgetCents) return null;
  return { kind: "cost", budgetCents: p.costBudgetCents, usedCents: f.cost.totalCents };
}

// ---------------------------------------------------------------------------
// Date range presets
// ---------------------------------------------------------------------------

export type RangePreset = "lifetime" | "this_month" | "last_month" | "this_year" | "custom";

export const RANGE_PRESET_LABELS: Record<RangePreset, string> = {
  lifetime: "Lifetime",
  this_month: "This month",
  last_month: "Last month",
  this_year: "This year",
  custom: "Custom dates",
};

export function presetRange(preset: Exclude<RangePreset, "custom">, today: ISODate): DateRange | undefined {
  const m = monthKey(today);
  if (preset === "this_month") return { from: monthStart(m), to: monthEnd(m) };
  if (preset === "last_month") {
    const prev = addMonthsToKey(m, -1);
    return { from: monthStart(prev), to: monthEnd(prev) };
  }
  if (preset === "this_year") return { from: `${today.slice(0, 4)}-01-01`, to: `${today.slice(0, 4)}-12-31` };
  return undefined;
}

// ---------------------------------------------------------------------------
// Roll-ups: customer and company
// ---------------------------------------------------------------------------

export type RevenueTotals = { earnedCents: Cents; invoicedCents: Cents; collectedCents: Cents; costCents: Cents; marginCents: Cents };

function sumClient(list: ProjectFinancials[]): RevenueTotals {
  const t: RevenueTotals = { earnedCents: 0, invoicedCents: 0, collectedCents: 0, costCents: 0, marginCents: 0 };
  for (const f of list) {
    t.earnedCents += f.revenue?.earnedCents ?? 0;
    t.invoicedCents += f.revenue?.invoicedCents ?? 0;
    t.collectedCents += f.revenue?.collectedCents ?? 0;
    t.costCents += f.cost.totalCents;
  }
  t.marginCents = t.earnedCents - t.costCents;
  return t;
}

/** A customer's projects added up, with each project's figures. */
export function customerFinancials(data: BackofficeData, customerId: string, today: ISODate, range?: DateRange) {
  const projects = data.projects
    .filter((p) => p.customerId === customerId)
    .map((p) => projectFinancials(data, p.id, today, range))
    .sort((a, b) => a.project.name.localeCompare(b.project.name));
  const totals = sumClient(projects);
  return { projects, totals, hasMissingRates: projects.some((f) => f.missingBillingRates.length || f.missingCostRates.length) };
}

export type OverheadLine = { kind: "expense" | "recurring"; id: string; date: ISODate; vendor: string; description?: string; amountCents: Cents };

/**
 * The whole company: client projects (revenue, cost, margin), internal
 * investment (internal project costs), and overhead (costs on no project).
 * Total margin = client margin − internal investment − overhead.
 */
export function companyFinancials(data: BackofficeData, today: ISODate, range?: DateRange) {
  const all = data.projects.map((p) => projectFinancials(data, p.id, today, range));
  const client = all.filter((f) => f.isClient).sort((a, b) => b.cost.totalCents + (b.revenue?.earnedCents ?? 0) - (a.cost.totalCents + (a.revenue?.earnedCents ?? 0)));
  const internal = all.filter((f) => !f.isClient).sort((a, b) => b.cost.totalCents - a.cost.totalCents);
  const clientTotals = sumClient(client);
  const internalInvestmentCents = internal.reduce((s, f) => s + f.cost.totalCents, 0);

  const chargesUntil = range?.to && range.to < today ? range.to : today;
  const overhead: OverheadLine[] = [
    ...data.projectExpenses
      .filter((x) => x.projectId === null && inRange(x.date, range))
      .map((x): OverheadLine => ({ kind: "expense", id: x.id, date: x.date, vendor: x.vendor, description: x.description || undefined, amountCents: x.amountCents })),
    ...listCharges(data, chargesUntil)
      .filter((c) => c.projectId === null && inRange(c.dueDate, range))
      .map((c): OverheadLine => ({ kind: "recurring", id: c.key, date: c.dueDate, vendor: c.vendor, amountCents: c.amountCents })),
  ].sort((a, b) => (a.date < b.date ? 1 : -1));
  const overheadCents = overhead.reduce((s, o) => s + o.amountCents, 0);

  return {
    client,
    clientTotals,
    internal,
    internalInvestmentCents,
    overhead,
    overheadCents,
    totalMarginCents: clientTotals.marginCents - internalInvestmentCents - overheadCents,
    hasMissingRates: all.some((f) => f.missingBillingRates.length || f.missingCostRates.length),
  };
}
