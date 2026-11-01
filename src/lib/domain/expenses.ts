import { addMonthsClamped, addMonthsToKey, compareDates, isISODate, maxDate, monthEnd, monthKey, monthStart, type ISODate, type MonthKey } from "./dates";
import type { Cents } from "./money";
import { DomainError, randomId, type IdFactory } from "./payroll";
import { ValidationError, type FieldErrors } from "./contractors";
import type { BackofficeData, ExpenseCharge, ExpenseFrequency, PaymentAccount, RecurringExpense } from "./types";

export const FREQUENCY_LABEL: Record<ExpenseFrequency, string> = {
  monthly: "Monthly",
  quarterly: "Quarterly",
  annual: "Annual",
  one_time: "One-time",
};

const STEP: Record<ExpenseFrequency, number> = { monthly: 1, quarterly: 3, annual: 12, one_time: 0 };

export function accountLabel(a: PaymentAccount): string {
  return a.kind === "card" && a.last4 ? `${a.nickname} • ${a.last4}` : a.nickname;
}

// ---------------------------------------------------------------------------
// Schedule
// ---------------------------------------------------------------------------

/** Scheduled due dates of an expense within [from, to], honoring scheduleFrom and endDate. */
export function scheduledDates(e: RecurringExpense, from: ISODate, to: ISODate): ISODate[] {
  const lower = maxDate(from, e.scheduleFrom ?? e.firstDueDate);
  const upper = e.endDate && e.endDate < to ? e.endDate : to;
  if (upper < lower) return [];
  if (e.frequency === "one_time") return e.firstDueDate >= lower && e.firstDueDate <= upper ? [e.firstDueDate] : [];
  const step = STEP[e.frequency];
  const out: ISODate[] = [];
  // Jump close to `lower` instead of iterating from the anchor.
  const monthsApart = (Number(lower.slice(0, 4)) - Number(e.firstDueDate.slice(0, 4))) * 12 + (Number(lower.slice(5, 7)) - Number(e.firstDueDate.slice(5, 7)));
  let i = Math.max(0, Math.floor(monthsApart / step) - 1);
  for (;;) {
    const d = addMonthsClamped(e.firstDueDate, i * step);
    if (d > upper) break;
    if (d >= lower && d >= e.firstDueDate) out.push(d);
    i++;
  }
  return out;
}

export function nextChargeDate(e: RecurringExpense, today: ISODate): ISODate | null {
  return scheduledDates(e, today, addMonthsClamped(today, 13))[0] ?? null;
}

export function isExpenseActive(e: RecurringExpense, today: ISODate): boolean {
  return nextChargeDate(e, today) !== null;
}

// ---------------------------------------------------------------------------
// Charges
// ---------------------------------------------------------------------------

export type ChargeView = {
  key: string;
  expenseId: string;
  vendor: string;
  type: RecurringExpense["type"];
  projectId: string | null;
  accountId: string;
  autopay: boolean;
  dueDate: ISODate;
  amountCents: Cents;
  isEstimate: boolean;
  paid: boolean;
  paidOn?: ISODate;
  stored: boolean;
};

export const chargeKey = (expenseId: string, dueDate: ISODate) => `${expenseId}~${dueDate}`;

function view(e: RecurringExpense, dueDate: ISODate, stored?: ExpenseCharge): ChargeView {
  const isEstimate = stored ? stored.isEstimate : e.amountKind === "variable";
  return {
    key: chargeKey(e.id, dueDate),
    expenseId: e.id,
    vendor: e.vendor,
    type: e.type,
    projectId: e.projectId,
    accountId: e.accountId,
    autopay: e.autopay,
    dueDate,
    amountCents: stored ? stored.amountCents : e.amountCents,
    isEstimate,
    paid: !!stored?.paidOn,
    paidOn: stored?.paidOn,
    stored: !!stored,
  };
}

/** Every charge due on or before `until`: stored charges plus generated occurrences. */
export function listCharges(data: BackofficeData, until: ISODate): ChargeView[] {
  const storedByKey = new Map(data.expenseCharges.map((c) => [chargeKey(c.expenseId, c.dueDate), c]));
  const out: ChargeView[] = [];
  for (const e of data.expenses) {
    const seen = new Set<string>();
    for (const c of data.expenseCharges) {
      if (c.expenseId !== e.id || c.dueDate > until) continue;
      out.push(view(e, c.dueDate, c));
      seen.add(c.dueDate);
    }
    for (const d of scheduledDates(e, e.firstDueDate, until)) {
      if (seen.has(d) || storedByKey.has(chargeKey(e.id, d))) continue;
      out.push(view(e, d));
    }
  }
  return out.sort((a, b) => compareDates(a.dueDate, b.dueDate) || a.vendor.localeCompare(b.vendor));
}

export type MonthReview = {
  month: MonthKey;
  /** Charges due in the month. */
  current: ChargeView[];
  /** Unpaid charges from earlier months, carried into this review. */
  carryover: ChargeView[];
  totalCents: Cents;
  paidCents: Cents;
  unpaidCents: Cents;
  estimatedCents: Cents;
};

/** Month-end verification view, optionally for one payment account. */
export function monthReview(data: BackofficeData, month: MonthKey, accountId?: string): MonthReview {
  const all = listCharges(data, monthEnd(month)).filter((c) => !accountId || c.accountId === accountId);
  const start = monthStart(month);
  const current = all.filter((c) => c.dueDate >= start);
  const carryover = all.filter((c) => c.dueDate < start && !c.paid);
  const rows = [...current, ...carryover];
  const sum = (xs: ChargeView[]) => xs.reduce((s, c) => s + c.amountCents, 0);
  return {
    month,
    current,
    carryover,
    totalCents: sum(current),
    paidCents: sum(rows.filter((c) => c.paid)),
    unpaidCents: sum(rows.filter((c) => !c.paid)),
    estimatedCents: sum(rows.filter((c) => c.isEstimate && !c.paid)),
  };
}

export function upcomingCharges(data: BackofficeData, today: ISODate, days = 30): ChargeView[] {
  const end = addDaysISO(today, days);
  return listCharges(data, end).filter((c) => !c.paid && c.dueDate >= today);
}

function addDaysISO(d: ISODate, n: number) {
  const dt = new Date(`${d}T00:00:00Z`);
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

/** Total of charges due in each month (actual where known, otherwise estimate). */
export function monthlySpending(data: BackofficeData, endMonth: MonthKey, months = 6): { month: MonthKey; totalCents: Cents; estimatedCents: Cents }[] {
  const charges = listCharges(data, monthEnd(endMonth));
  return Array.from({ length: months }, (_, i) => {
    const m = addMonthsToKey(endMonth, i - months + 1);
    const inMonth = charges.filter((c) => monthKey(c.dueDate) === m);
    return {
      month: m,
      totalCents: inMonth.reduce((s, c) => s + c.amountCents, 0),
      estimatedCents: inMonth.filter((c) => c.isEstimate).reduce((s, c) => s + c.amountCents, 0),
    };
  });
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

function findCharge(data: BackofficeData, key: string): { expense: RecurringExpense; dueDate: ISODate; stored?: ExpenseCharge } {
  const i = key.lastIndexOf("~");
  const expenseId = key.slice(0, i);
  const dueDate = key.slice(i + 1);
  const expense = data.expenses.find((e) => e.id === expenseId);
  if (!expense || !isISODate(dueDate)) throw new DomainError("Charge not found.");
  const stored = data.expenseCharges.find((c) => c.expenseId === expenseId && c.dueDate === dueDate);
  if (!stored && !scheduledDates(expense, dueDate, dueDate).length) throw new DomainError("Charge not found.");
  return { expense, dueDate, stored };
}

function upsert(data: BackofficeData, charge: ExpenseCharge): BackofficeData {
  const exists = data.expenseCharges.some((c) => c.id === charge.id);
  return { ...data, expenseCharges: exists ? data.expenseCharges.map((c) => (c.id === charge.id ? charge : c)) : [...data.expenseCharges, charge] };
}

function materialize(expense: RecurringExpense, dueDate: ISODate, stored: ExpenseCharge | undefined, newId: IdFactory): ExpenseCharge {
  return stored ?? { id: newId("chg"), expenseId: expense.id, dueDate, amountCents: expense.amountCents, isEstimate: expense.amountKind === "variable" };
}

/**
 * Mark the selected charges paid (or unpaid). Only the selected charges
 * change. Autopay never marks anything paid by itself.
 */
export function setChargesPaid(data: BackofficeData, keys: string[], paidOn: ISODate | null, newId: IdFactory = randomId): BackofficeData {
  if (keys.length === 0) throw new DomainError("Select at least one charge.");
  if (paidOn !== null && !isISODate(paidOn)) throw new DomainError("Enter the date paid.");
  let next = data;
  for (const key of new Set(keys)) {
    const { expense, dueDate, stored } = findCharge(next, key);
    const charge = materialize(expense, dueDate, stored, newId);
    next = upsert(next, { ...charge, paidOn: paidOn ?? undefined });
  }
  return next;
}

/** Replace a charge's estimate with the actual amount — the same charge, never a second one. */
export function setChargeAmount(data: BackofficeData, key: string, amountCents: Cents, newId: IdFactory = randomId): BackofficeData {
  if (!Number.isSafeInteger(amountCents) || amountCents < 0) throw new ValidationError({ amountCents: "Enter an amount of $0 or more." } as FieldErrors);
  const { expense, dueDate, stored } = findCharge(data, key);
  return upsert(data, { ...materialize(expense, dueDate, stored, newId), amountCents, isEstimate: false });
}

export type ExpenseInput = Omit<RecurringExpense, "id" | "createdOn" | "scheduleFrom">;
export type ExpenseErrors = Partial<Record<keyof ExpenseInput, string>>;

export class ExpenseValidationError extends DomainError {
  constructor(public fields: ExpenseErrors) {
    super(Object.values(fields)[0] ?? "Please check the form.");
  }
}

function validateExpense(data: BackofficeData, input: ExpenseInput) {
  const e: ExpenseErrors = {};
  if (!input.vendor.trim()) e.vendor = "Enter the vendor or bill name.";
  if (!isISODate(input.firstDueDate)) e.firstDueDate = "Enter the next due or renewal date.";
  if (input.endDate && !isISODate(input.endDate)) e.endDate = "Enter a valid date.";
  if (!Number.isSafeInteger(input.amountCents) || input.amountCents < 0) e.amountCents = input.amountKind === "variable" ? "Enter an estimate." : "Enter the amount.";
  if (!data.paymentAccounts.some((a) => a.id === input.accountId)) e.accountId = "Choose the card or account it's paid from.";
  if (input.projectId && !data.projects.some((p) => p.id === input.projectId)) e.projectId = "Choose a project or the company.";
  if (Object.keys(e).length) throw new ExpenseValidationError(e);
}

/** Only the editable fields — never copy unknown keys (or id/createdOn) from input. */
function expenseFields(input: ExpenseInput) {
  return {
    vendor: input.vendor.trim(),
    type: input.type,
    projectId: input.projectId || null,
    frequency: input.frequency,
    firstDueDate: input.firstDueDate,
    endDate: input.endDate || undefined,
    amountKind: input.amountKind,
    amountCents: input.amountCents,
    autopay: !!input.autopay,
    accountId: input.accountId,
    notes: input.notes?.trim() || undefined,
  };
}

export function addExpense(data: BackofficeData, input: ExpenseInput, today: ISODate, newId: IdFactory = randomId): { data: BackofficeData; expense: RecurringExpense } {
  validateExpense(data, input);
  const expense: RecurringExpense = { id: newId("exp"), ...expenseFields(input), createdOn: today };
  return { data: { ...data, expenses: [...data.expenses, expense] }, expense };
}

/** Store every generated occurrence due before `before`, so later schedule edits can't rewrite them. */
function freezePast(data: BackofficeData, expense: RecurringExpense, before: ISODate, newId: IdFactory): BackofficeData {
  const storedDates = new Set(data.expenseCharges.filter((c) => c.expenseId === expense.id).map((c) => c.dueDate));
  const add = scheduledDates(expense, expense.firstDueDate, addDaysISO(before, -1))
    .filter((d) => !storedDates.has(d))
    .map((d) => materialize(expense, d, undefined, newId));
  return add.length ? { ...data, expenseCharges: [...data.expenseCharges, ...add] } : data;
}

/**
 * Edit an expense. Charges due before today keep their dates and amounts;
 * the new schedule and amount apply from today on.
 */
export function updateExpense(data: BackofficeData, id: string, input: ExpenseInput, today: ISODate, newId: IdFactory = randomId): { data: BackofficeData; expense: RecurringExpense } {
  const existing = data.expenses.find((e) => e.id === id);
  if (!existing) throw new DomainError("Expense not found.");
  validateExpense(data, input);
  const next = freezePast(data, existing, today, newId);
  const expense: RecurringExpense = {
    ...existing,
    ...expenseFields(input),
    id: existing.id,
    createdOn: existing.createdOn,
    // Everything before today is now stored; the edited schedule governs from today on.
    scheduleFrom: today,
  };
  // Stored future charges always carry something recorded (paid or an actual amount), so they all stay.
  return { data: { ...next, expenses: next.expenses.map((e) => (e.id === id ? expense : e)) }, expense };
}

/** Stop future charges after `endDate`. Earlier charges, paid or not, are kept. */
export function stopExpense(data: BackofficeData, id: string, endDate: ISODate | null): BackofficeData {
  const existing = data.expenses.find((e) => e.id === id);
  if (!existing) throw new DomainError("Expense not found.");
  if (endDate !== null && !isISODate(endDate)) throw new DomainError("Enter the last date it may charge.");
  // Paid charges after the end date stay (they happened); unpaid ones there are dropped.
  const charges = endDate === null ? data.expenseCharges : data.expenseCharges.filter((c) => c.expenseId !== id || c.dueDate <= endDate || c.paidOn);
  return { ...data, expenseCharges: charges, expenses: data.expenses.map((e) => (e.id === id ? { ...e, endDate: endDate ?? undefined } : e)) };
}

export function addPaymentAccount(
  data: BackofficeData,
  input: { kind: PaymentAccount["kind"]; nickname: string; last4?: string },
  newId: IdFactory = randomId,
): { data: BackofficeData; account: PaymentAccount } {
  const errors: Record<string, string> = {};
  if (!input.nickname.trim()) errors.nickname = "Enter a nickname, e.g. “Chase business card”.";
  const last4 = input.last4?.trim() || undefined;
  if (input.kind === "card" && last4 && !/^\d{4}$/.test(last4)) errors.last4 = "Use exactly the last 4 digits — never the full card number.";
  if (Object.keys(errors).length) throw new ExpenseValidationError(errors as ExpenseErrors);
  const account: PaymentAccount = { id: newId("acct"), kind: input.kind, nickname: input.nickname.trim(), last4: input.kind === "card" ? last4 : undefined };
  return { data: { ...data, paymentAccounts: [...data.paymentAccounts, account] }, account };
}
