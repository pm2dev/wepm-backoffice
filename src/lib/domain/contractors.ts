import { compareDates, daysBetween, isISODate, type ISODate } from "./dates";
import { payForMinutes, type Cents } from "./money";
import { computeDraftPayrolls, DomainError, finalizedEntryIds, randomId, whatsDue, type IdFactory } from "./payroll";
import { rateOn } from "./rates";
import type { BackofficeData, Contractor, ContractorRate, PaymentMethod } from "./types";

export function isActive(c: Contractor, today: ISODate): boolean {
  return !c.endDate || c.endDate >= today;
}

/** "2 yrs 4 mos" from start date to end date (or today). */
export function tenure(c: Contractor, today: ISODate): string {
  const end = c.endDate && c.endDate < today ? c.endDate : today;
  if (end < c.startDate) return "Starts " + c.startDate;
  const [sy, sm, sd] = c.startDate.split("-").map(Number);
  const [ey, em, ed] = end.split("-").map(Number);
  let months = (ey - sy) * 12 + (em - sm) - (ed < sd ? 1 : 0);
  if (months < 1) {
    const days = daysBetween(c.startDate, end) + 1;
    return `${days} day${days === 1 ? "" : "s"}`;
  }
  const years = Math.floor(months / 12);
  months %= 12;
  const parts = [];
  if (years) parts.push(`${years} yr${years === 1 ? "" : "s"}`);
  if (months) parts.push(`${months} mo${months === 1 ? "" : "s"}`);
  return parts.join(" ");
}

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

export type ContractorInput = {
  name: string;
  startDate: ISODate;
  endDate?: ISODate;
  email?: string;
  role?: string;
  payDelayDays: number;
  preferredMethod: PaymentMethod;
  paymentReference?: string;
  notes?: string;
  wepmUserId?: string;
};

export type FieldErrors = Partial<Record<keyof ContractorInput | "rate" | "effectiveDate", string>>;

export class ValidationError extends DomainError {
  constructor(public fields: FieldErrors) {
    super(Object.values(fields)[0] ?? "Please check the form.");
  }
}

const trimOrUndef = (v?: string) => (v && v.trim() ? v.trim() : undefined);

function validateContractor(data: BackofficeData, input: ContractorInput, selfId?: string): FieldErrors {
  const e: FieldErrors = {};
  if (!input.name.trim()) e.name = "Enter a name.";
  if (!isISODate(input.startDate)) e.startDate = "Enter a start date.";
  if (input.endDate && !isISODate(input.endDate)) e.endDate = "Enter a valid end date.";
  else if (input.endDate && isISODate(input.startDate) && input.endDate < input.startDate) e.endDate = "End date can't be before the start date.";
  if (!Number.isInteger(input.payDelayDays) || input.payDelayDays < 0 || input.payDelayDays > 30) e.payDelayDays = "Choose when pay is due.";
  if (input.email && input.email.trim() && !/^\S+@\S+\.\S+$/.test(input.email.trim())) e.email = "Enter a valid email or leave it blank.";
  const wepm = trimOrUndef(input.wepmUserId);
  if (wepm && data.contractors.some((c) => c.id !== selfId && c.wepmUserId === wepm)) {
    e.wepmUserId = "Another contractor already uses this wepm.app ID.";
  }
  return e;
}

function toContractorFields(input: ContractorInput) {
  return {
    name: input.name.trim(),
    startDate: input.startDate,
    endDate: trimOrUndef(input.endDate),
    email: trimOrUndef(input.email),
    role: trimOrUndef(input.role),
    schedule: { kind: "weekly" as const, payDelayDays: input.payDelayDays },
    preferredMethod: input.preferredMethod,
    paymentReference: trimOrUndef(input.paymentReference),
    notes: trimOrUndef(input.notes),
    wepmUserId: trimOrUndef(input.wepmUserId),
  };
}

export function addContractor(
  data: BackofficeData,
  input: ContractorInput & { initialRateCents?: Cents },
  newId: IdFactory = randomId,
): { data: BackofficeData; contractor: Contractor } {
  const errors = validateContractor(data, input);
  if (input.initialRateCents !== undefined && (!Number.isSafeInteger(input.initialRateCents) || input.initialRateCents <= 0)) {
    errors.rate = "Enter an hourly rate greater than $0, or leave it blank.";
  }
  if (Object.keys(errors).length) throw new ValidationError(errors);
  const contractor: Contractor = { id: newId("c"), ...toContractorFields(input) };
  const rates: ContractorRate[] =
    input.initialRateCents !== undefined
      ? [{ id: newId("rate"), contractorId: contractor.id, effectiveDate: contractor.startDate, hourlyRateCents: input.initialRateCents }]
      : [];
  return { data: { ...data, contractors: [...data.contractors, contractor], rates: [...data.rates, ...rates] }, contractor };
}

/** Edits keep the contractor's stable ID, so payroll and history stay linked. */
export function updateContractor(data: BackofficeData, id: string, input: ContractorInput): { data: BackofficeData; contractor: Contractor } {
  const existing = data.contractors.find((c) => c.id === id);
  if (!existing) throw new DomainError("Contractor not found.");
  const errors = validateContractor(data, input, id);
  if (Object.keys(errors).length) throw new ValidationError(errors);
  const contractor: Contractor = { ...existing, ...toContractorFields(input) };
  return { data: { ...data, contractors: data.contractors.map((c) => (c.id === id ? contractor : c)) }, contractor };
}

// ---------------------------------------------------------------------------
// Rates
// ---------------------------------------------------------------------------

/**
 * Add an hourly cost rate effective from a date. It applies to hours worked
 * on or after that date that are not yet finalized; finalized payroll keeps
 * its preserved amounts.
 */
export function addRate(
  data: BackofficeData,
  input: { contractorId: string; effectiveDate: ISODate; hourlyRateCents: Cents },
  newId: IdFactory = randomId,
): { data: BackofficeData; rate: ContractorRate } {
  const errors: FieldErrors = {};
  if (!data.contractors.some((c) => c.id === input.contractorId)) throw new DomainError("Contractor not found.");
  if (!isISODate(input.effectiveDate)) errors.effectiveDate = "Enter the date this rate starts.";
  else if (data.rates.some((r) => r.contractorId === input.contractorId && r.effectiveDate === input.effectiveDate)) {
    errors.effectiveDate = "A rate already starts on this date.";
  }
  if (!Number.isSafeInteger(input.hourlyRateCents) || input.hourlyRateCents <= 0) errors.rate = "Enter an hourly rate greater than $0.";
  if (Object.keys(errors).length) throw new ValidationError(errors);
  const rate: ContractorRate = { id: newId("rate"), contractorId: input.contractorId, effectiveDate: input.effectiveDate, hourlyRateCents: input.hourlyRateCents };
  return { data: { ...data, rates: [...data.rates, rate] }, rate };
}

/** Which unfinalized operational hours a proposed rate would change. Informational, for the confirmation step. */
export function rateChangeImpact(data: BackofficeData, contractorId: string, effectiveDate: ISODate, today: ISODate) {
  const affected = computeDraftPayrolls(data, today)
    .filter((d) => d.contractorId === contractorId)
    .flatMap((d) => d.entries)
    .filter((e) => e.workDate >= effectiveDate);
  const nextRateDate = data.rates
    .filter((r) => r.contractorId === contractorId && r.effectiveDate > effectiveDate)
    .map((r) => r.effectiveDate)
    .sort()[0];
  const scoped = nextRateDate ? affected.filter((e) => e.workDate < nextRateDate) : affected;
  return { unfinalizedMinutes: scoped.reduce((s, e) => s + e.minutes, 0), entryCount: scoped.length, nextRateDate };
}

// ---------------------------------------------------------------------------
// Lifetime stats
// ---------------------------------------------------------------------------

export type ContractorStats = {
  operationalMinutes: number;
  historicalMinutes: number;
  /** Hourly earnings: finalized snapshots + unfinalized/historical hours at the rate on each work date. */
  hourlyEarningsCents: Cents;
  bonusCents: Cents;
  /** Hourly + bonuses. Reimbursements are never included. */
  totalEarningsCents: Cents;
  reimbursementCents: Cents;
  /** Hours with no applicable rate — excluded from earnings, never valued at $0 silently. */
  missingRateMinutes: number;
  missingRateRange?: { from: ISODate; to: ISODate };
  /** Sum of recorded payments only. Never inferred from earnings. */
  totalPaidCents: Cents;
  outstandingCents: Cents;
  firstPaymentDate?: ISODate;
  currentRateCents: Cents | null;
  upcomingRate?: ContractorRate;
};

export function contractorStats(data: BackofficeData, contractorId: string, today: ISODate): ContractorStats {
  const entries = data.timeEntries.filter((e) => e.contractorId === contractorId);
  const finalized = finalizedEntryIds(data);
  let operationalMinutes = 0;
  let historicalMinutes = 0;
  let missingRateMinutes = 0;
  let missingFrom: ISODate | undefined;
  let missingTo: ISODate | undefined;
  // Unfinalized/historical hours grouped by rate, then rounded once per rate (same rule as payroll).
  const minutesByRate = new Map<Cents, number>();

  for (const e of entries) {
    if (e.source === "wepm") {
      if (!e.approvedAt) continue;
      operationalMinutes += e.minutes;
    } else {
      historicalMinutes += e.minutes;
    }
    if (finalized.has(e.id)) continue; // counted from the preserved snapshot below
    const rate = rateOn(data.rates, contractorId, e.workDate);
    if (rate === null) {
      missingRateMinutes += e.minutes;
      if (!missingFrom || e.workDate < missingFrom) missingFrom = e.workDate;
      if (!missingTo || e.workDate > missingTo) missingTo = e.workDate;
    } else {
      minutesByRate.set(rate, (minutesByRate.get(rate) ?? 0) + e.minutes);
    }
  }

  let hourly = data.payrolls.filter((p) => p.contractorId === contractorId).reduce((s, p) => s + p.amountCents, 0);
  for (const [rate, minutes] of minutesByRate) hourly += payForMinutes(minutes, rate);

  const adjustments = data.adjustments.filter((a) => a.contractorId === contractorId);
  const bonusCents = adjustments.filter((a) => a.kind === "bonus").reduce((s, a) => s + a.amountCents, 0);
  const reimbursementCents = adjustments.filter((a) => a.kind === "reimbursement").reduce((s, a) => s + a.amountCents, 0);

  const payments = data.payments.filter((p) => p.contractorId === contractorId);
  const totalPaidCents = payments.reduce((s, p) => s + p.allocations.reduce((t, a) => t + a.amountCents, 0), 0);
  const firstPaymentDate = payments.map((p) => p.paidOn).sort(compareDates)[0];

  const outstandingCents = whatsDue(data, today)
    .filter((o) => o.contractorId === contractorId)
    .reduce((s, o) => s + Math.max(0, o.outstandingCents), 0);

  const upcomingRate = data.rates
    .filter((r) => r.contractorId === contractorId && r.effectiveDate > today)
    .sort((a, b) => compareDates(a.effectiveDate, b.effectiveDate))[0];

  return {
    operationalMinutes,
    historicalMinutes,
    hourlyEarningsCents: hourly,
    bonusCents,
    totalEarningsCents: hourly + bonusCents,
    reimbursementCents,
    missingRateMinutes,
    missingRateRange: missingFrom && missingTo ? { from: missingFrom, to: missingTo } : undefined,
    totalPaidCents,
    outstandingCents,
    firstPaymentDate,
    currentRateCents: rateOn(data.rates, contractorId, today),
    upcomingRate,
  };
}
