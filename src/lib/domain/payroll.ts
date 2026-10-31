import { compareDates, maxDate, type ISODate } from "./dates";
import { payForMinutes, type Cents } from "./money";
import { rateOn } from "./rates";
import { nextPayday, payPeriodFor } from "./schedule";
import type {
  Adjustment,
  AdjustmentKind,
  BackofficeData,
  Contractor,
  FinalizedPayroll,
  ObligationKind,
  ObligationRef,
  PaymentMethod,
  PaymentRecord,
  PayrollLine,
  TimeEntry,
} from "./types";

export type IdFactory = (prefix: string) => string;
export const randomId: IdFactory = (prefix) => `${prefix}_${crypto.randomUUID().slice(0, 12)}`;

export class DomainError extends Error {}

// ---------------------------------------------------------------------------
// Draft (not yet finalized) payroll — computed live from approved hours
// ---------------------------------------------------------------------------

export type DraftPayroll = {
  key: string;
  contractorId: string;
  periodStart: ISODate;
  periodEnd: ISODate;
  dueDate: ISODate;
  entries: TimeEntry[];
  lines: PayrollLine[];
  /** Sum of lines with a known rate. */
  knownAmountCents: Cents;
  /** Minutes worked on dates with no applicable rate. Blocks finalization. */
  missingRateMinutes: number;
  missingRateDates: ISODate[];
  totalMinutes: number;
  /** A finalized record already exists for this period; these hours were approved later. */
  lateApproved: boolean;
};

export function draftKey(contractorId: string, periodStart: ISODate): string {
  return `${contractorId}~${periodStart}`;
}

/** Only newly approved operational hours create money owed — never historical imports. */
export function isPayableEntry(e: TimeEntry): boolean {
  return e.source === "wepm" && !!e.approvedAt;
}

export function finalizedEntryIds(data: BackofficeData): Set<string> {
  const ids = new Set<string>();
  for (const p of data.payrolls) for (const id of p.entryIds) ids.add(id);
  return ids;
}

/** Group entries into rate segments using the rate in effect on each work date. */
export function computeLines(data: BackofficeData, contractorId: string, entries: TimeEntry[]) {
  const byRate = new Map<number, PayrollLine>();
  let missingRateMinutes = 0;
  const missingRateDates = new Set<ISODate>();
  for (const e of [...entries].sort((a, b) => compareDates(a.workDate, b.workDate))) {
    const rate = rateOn(data.rates, contractorId, e.workDate);
    if (rate === null) {
      missingRateMinutes += e.minutes;
      missingRateDates.add(e.workDate);
      continue;
    }
    const line = byRate.get(rate);
    if (line) {
      line.minutes += e.minutes;
      line.lastWorkDate = maxDate(line.lastWorkDate, e.workDate);
    } else {
      byRate.set(rate, {
        hourlyRateCents: rate,
        minutes: e.minutes,
        amountCents: 0,
        firstWorkDate: e.workDate,
        lastWorkDate: e.workDate,
      });
    }
  }
  const lines = [...byRate.values()]
    .map((l) => ({ ...l, amountCents: payForMinutes(l.minutes, l.hourlyRateCents) }))
    .sort((a, b) => compareDates(a.firstWorkDate, b.firstWorkDate));
  return { lines, missingRateMinutes, missingRateDates: [...missingRateDates] };
}

export function computeDraftPayrolls(data: BackofficeData, today: ISODate): DraftPayroll[] {
  const taken = finalizedEntryIds(data);
  const contractors = new Map(data.contractors.map((c) => [c.id, c]));
  const groups = new Map<string, { contractor: Contractor; start: ISODate; end: ISODate; due: ISODate; entries: TimeEntry[] }>();

  for (const e of data.timeEntries) {
    if (!isPayableEntry(e) || taken.has(e.id)) continue;
    const contractor = contractors.get(e.contractorId);
    if (!contractor) continue;
    const period = payPeriodFor(contractor, e.workDate);
    const key = draftKey(contractor.id, period.start);
    const g = groups.get(key) ?? { contractor, start: period.start, end: period.end, due: period.dueDate, entries: [] };
    g.entries.push(e);
    groups.set(key, g);
  }

  return [...groups.entries()].map(([key, g]) => {
    const { lines, missingRateMinutes, missingRateDates } = computeLines(data, g.contractor.id, g.entries);
    const lateApproved = data.payrolls.some((p) => p.contractorId === g.contractor.id && p.periodStart === g.start);
    // Assumption (PRD §8, pending confirmation): late-approved hours are paid on the
    // next payday rather than retroactively joining the already-finalized record.
    const dueDate = lateApproved ? maxDate(g.due, nextPayday(g.contractor, today)) : g.due;
    return {
      key,
      contractorId: g.contractor.id,
      periodStart: g.start,
      periodEnd: g.end,
      dueDate,
      entries: g.entries.sort((a, b) => compareDates(a.workDate, b.workDate)),
      lines,
      knownAmountCents: lines.reduce((s, l) => s + l.amountCents, 0),
      missingRateMinutes,
      missingRateDates,
      totalMinutes: g.entries.reduce((s, e) => s + e.minutes, 0),
      lateApproved,
    };
  });
}

/**
 * Finalize confirms the payable calculation and preserves it. It does not send
 * money and does not mark anything paid.
 */
export function finalizePayroll(
  data: BackofficeData,
  key: string,
  today: ISODate,
  newId: IdFactory = randomId,
): { data: BackofficeData; payroll: FinalizedPayroll } {
  const draft = computeDraftPayrolls(data, today).find((d) => d.key === key);
  if (!draft) throw new DomainError("This payroll record no longer has unfinalized hours.");
  if (draft.missingRateMinutes > 0) {
    throw new DomainError("Add the missing hourly rate before finalizing.");
  }
  const taken = finalizedEntryIds(data);
  if (draft.entries.some((e) => taken.has(e.id))) {
    throw new DomainError("Some of these hours are already part of a finalized payroll.");
  }
  const payroll: FinalizedPayroll = {
    id: newId("pay"),
    contractorId: draft.contractorId,
    periodStart: draft.periodStart,
    periodEnd: draft.periodEnd,
    dueDate: draft.dueDate,
    entryIds: draft.entries.map((e) => e.id),
    lines: draft.lines,
    amountCents: draft.knownAmountCents,
    finalizedOn: today,
    lateApproved: draft.lateApproved,
  };
  return { data: { ...data, payrolls: [...data.payrolls, payroll] }, payroll };
}

// ---------------------------------------------------------------------------
// Bonuses and reimbursements
// ---------------------------------------------------------------------------

export function addAdjustment(
  data: BackofficeData,
  input: { contractorId: string; kind: AdjustmentKind; description: string; amountCents: Cents },
  today: ISODate,
  newId: IdFactory = randomId,
): { data: BackofficeData; adjustment: Adjustment } {
  const contractor = data.contractors.find((c) => c.id === input.contractorId);
  if (!contractor) throw new DomainError("Choose a contractor.");
  if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0) throw new DomainError("Enter an amount greater than $0.");
  if (!input.description.trim()) throw new DomainError("Add a short description.");
  const adjustment: Adjustment = {
    id: newId(input.kind === "bonus" ? "bon" : "rei"),
    contractorId: contractor.id,
    kind: input.kind,
    description: input.description.trim(),
    amountCents: input.amountCents,
    createdOn: today,
    dueDate: nextPayday(contractor, today),
  };
  return { data: { ...data, adjustments: [...data.adjustments, adjustment] }, adjustment };
}

// ---------------------------------------------------------------------------
// Obligations ("What's due") and payments
// ---------------------------------------------------------------------------

export type ObligationStatus = "needs_finalization" | "missing_rate" | "ready" | "partially_paid" | "paid";

export type Obligation = {
  /** Unique key for lists; for drafts this is `draft:<key>`. */
  uid: string;
  ref: ObligationRef | null; // null for drafts — they cannot be paid yet
  draftKey?: string;
  kind: ObligationKind;
  contractorId: string;
  title: string;
  periodStart?: ISODate;
  periodEnd?: ISODate;
  dueDate: ISODate;
  amountCents: Cents;
  paidCents: Cents;
  outstandingCents: Cents;
  status: ObligationStatus;
  overdue: boolean;
  lateApproved?: boolean;
  missingRateMinutes?: number;
  totalMinutes?: number;
};

export function paidAgainst(data: BackofficeData, ref: ObligationRef): Cents {
  let sum = 0;
  for (const p of data.payments)
    for (const a of p.allocations) if (a.obligation.kind === ref.kind && a.obligation.id === ref.id) sum += a.amountCents;
  return sum;
}

function amountOf(data: BackofficeData, ref: ObligationRef): { amount: Cents; contractorId: string } | null {
  if (ref.kind === "payroll") {
    const p = data.payrolls.find((x) => x.id === ref.id);
    return p ? { amount: p.amountCents, contractorId: p.contractorId } : null;
  }
  const a = data.adjustments.find((x) => x.id === ref.id && x.kind === ref.kind);
  return a ? { amount: a.amountCents, contractorId: a.contractorId } : null;
}

export function outstandingFor(data: BackofficeData, ref: ObligationRef): Cents {
  const info = amountOf(data, ref);
  if (!info) return 0;
  return info.amount - paidAgainst(data, ref);
}

export function listObligations(data: BackofficeData, today: ISODate): Obligation[] {
  const out: Obligation[] = [];

  for (const d of computeDraftPayrolls(data, today)) {
    out.push({
      uid: `draft:${d.key}`,
      ref: null,
      draftKey: d.key,
      kind: "payroll",
      contractorId: d.contractorId,
      title: d.lateApproved ? "Late-approved hours" : "Weekly hours",
      periodStart: d.periodStart,
      periodEnd: d.periodEnd,
      dueDate: d.dueDate,
      amountCents: d.knownAmountCents,
      paidCents: 0,
      outstandingCents: d.knownAmountCents,
      status: d.missingRateMinutes > 0 ? "missing_rate" : "needs_finalization",
      overdue: d.dueDate < today,
      lateApproved: d.lateApproved,
      missingRateMinutes: d.missingRateMinutes,
      totalMinutes: d.totalMinutes,
    });
  }

  for (const p of data.payrolls) {
    const ref: ObligationRef = { kind: "payroll", id: p.id };
    const paid = paidAgainst(data, ref);
    const outstanding = p.amountCents - paid;
    out.push({
      uid: `payroll:${p.id}`,
      ref,
      kind: "payroll",
      contractorId: p.contractorId,
      title: p.lateApproved ? "Late-approved hours" : "Weekly hours",
      periodStart: p.periodStart,
      periodEnd: p.periodEnd,
      dueDate: p.dueDate,
      amountCents: p.amountCents,
      paidCents: paid,
      outstandingCents: outstanding,
      status: outstanding <= 0 ? "paid" : paid > 0 ? "partially_paid" : "ready",
      overdue: outstanding > 0 && p.dueDate < today,
      lateApproved: p.lateApproved,
      totalMinutes: p.lines.reduce((s, l) => s + l.minutes, 0),
    });
  }

  for (const a of data.adjustments) {
    const ref: ObligationRef = { kind: a.kind, id: a.id };
    const paid = paidAgainst(data, ref);
    const outstanding = a.amountCents - paid;
    out.push({
      uid: `${a.kind}:${a.id}`,
      ref,
      kind: a.kind,
      contractorId: a.contractorId,
      title: a.description,
      dueDate: a.dueDate,
      amountCents: a.amountCents,
      paidCents: paid,
      outstandingCents: outstanding,
      status: outstanding <= 0 ? "paid" : paid > 0 ? "partially_paid" : "ready",
      overdue: outstanding > 0 && a.dueDate < today,
    });
  }

  return out;
}

/** Unpaid obligations: overdue first, then upcoming, each by due date. */
export function whatsDue(data: BackofficeData, today: ISODate): Obligation[] {
  return listObligations(data, today)
    .filter((o) => o.status !== "paid")
    .sort((a, b) => {
      if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
      return compareDates(a.dueDate, b.dueDate) || a.contractorId.localeCompare(b.contractorId);
    });
}

export function isPayable(o: Obligation): boolean {
  return o.ref !== null && o.outstandingCents > 0;
}

export type RecordPaymentInput = {
  contractorId: string;
  paidOn: ISODate;
  method: PaymentMethod;
  note?: string;
  allocations: { obligation: ObligationRef; amountCents: Cents }[];
};

/**
 * Record a payment made outside Backoffice. One payment can cover several of a
 * contractor's records (payroll, bonus, reimbursement) which stay distinct.
 * Partial amounts reduce the outstanding balance and leave the remainder unpaid.
 */
export function recordPayment(
  data: BackofficeData,
  input: RecordPaymentInput,
  today: ISODate,
  newId: IdFactory = randomId,
): { data: BackofficeData; payment: PaymentRecord } {
  if (input.allocations.length === 0) throw new DomainError("Select at least one record to pay.");
  const seen = new Set<string>();
  for (const a of input.allocations) {
    const k = `${a.obligation.kind}:${a.obligation.id}`;
    if (seen.has(k)) throw new DomainError("A record can only appear once in a payment.");
    seen.add(k);
    const info = amountOf(data, a.obligation);
    if (!info) throw new DomainError("A selected record must be finalized before it can be paid.");
    if (info.contractorId !== input.contractorId) throw new DomainError("A payment can only cover one contractor's records.");
    if (!Number.isSafeInteger(a.amountCents) || a.amountCents <= 0) throw new DomainError("Each amount must be greater than $0.");
    const outstanding = info.amount - paidAgainst(data, a.obligation);
    if (a.amountCents > outstanding) throw new DomainError("An amount is more than that record's outstanding balance.");
  }
  const payment: PaymentRecord = {
    id: newId("pmt"),
    contractorId: input.contractorId,
    paidOn: input.paidOn,
    method: input.method,
    note: input.note?.trim() || undefined,
    allocations: input.allocations.map((a) => ({ obligation: a.obligation, amountCents: a.amountCents })),
    recordedOn: today,
  };
  return { data: { ...data, payments: [...data.payments, payment] }, payment };
}

export function totalOutstanding(obligations: Obligation[]): Cents {
  return obligations.reduce((s, o) => s + Math.max(0, o.outstandingCents), 0);
}
