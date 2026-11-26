import { compareDates, isISODate, type ISODate } from "./dates";
import type { Cents } from "./money";
import { FormError, reservedExpenseIds } from "./billing";
import { addAdjustment, DomainError, paidAgainst, randomId, type IdFactory } from "./payroll";
import { nextPayday } from "./schedule";
import type { Adjustment, AdjustmentKind, BackofficeData, ExpenseCategory, ExpensePayer, ProjectExpense } from "./types";

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  software: "Software",
  hardware: "Hardware & devices",
  travel: "Travel",
  contractor_services: "Contractor services",
  other: "Other",
};

export const EXPENSE_CATEGORIES = Object.keys(EXPENSE_CATEGORY_LABELS) as ExpenseCategory[];

export type ProjectExpenseInput = Omit<ProjectExpense, "id" | "createdOn">;

/** Whether an expense can be billed: only on a billable customer project. */
export function canBillExpensesTo(data: BackofficeData, projectId: string | null): boolean {
  const p = projectId ? data.projects.find((x) => x.id === projectId) : undefined;
  return !!p && p.billable && !!p.customerId;
}

function isWebUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

function validate(data: BackofficeData, input: ProjectExpenseInput) {
  const e: Record<string, string> = {};
  if (!isISODate(input.date)) e.date = "Enter the date of the expense.";
  if (!input.vendor.trim()) e.vendor = "Enter who it was bought from.";
  if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0) e.amountCents = "Enter an amount greater than $0.";
  if (!(input.category in EXPENSE_CATEGORY_LABELS)) e.category = "Choose a category.";
  if (input.projectId && !data.projects.some((p) => p.id === input.projectId)) e.projectId = "Choose a project or Company.";
  if (input.billable && !canBillExpensesTo(data, input.projectId)) e.billable = "Only expenses on a billable customer project can be billed.";
  const payer = input.paidBy;
  if (payer.kind === "account" ? !data.paymentAccounts.some((a) => a.id === payer.accountId) : !data.contractors.some((c) => c.id === payer.contractorId)) {
    e.paidBy = "Choose the card, account or contractor that paid.";
  }
  const url = input.receiptUrl?.trim();
  if (url && !isWebUrl(url)) e.receiptUrl = "Enter a web link starting with https://, or leave it blank.";
  if (Object.keys(e).length) throw new FormError(e);
}

/** Only the editable fields — never copy unknown keys from input. */
function fields(input: ProjectExpenseInput): ProjectExpenseInput {
  return {
    date: input.date,
    vendor: input.vendor.trim(),
    description: input.description.trim(),
    amountCents: input.amountCents,
    category: input.category,
    projectId: input.projectId || null,
    billable: !!input.billable && !!input.projectId,
    paidBy: payerOf(input.paidBy),
    receiptUrl: input.receiptUrl?.trim() || undefined,
    notes: input.notes?.trim() || undefined,
  };
}

function payerOf(p: ExpensePayer): ExpensePayer {
  return p.kind === "account" ? { kind: "account", accountId: p.accountId } : { kind: "contractor", contractorId: p.contractorId };
}

// ---------------------------------------------------------------------------
// Contractor-paid expenses: what the contractor is owed
// ---------------------------------------------------------------------------

/** Contractor services are fixed-fee work (earnings); anything else a contractor paid is a reimbursement. */
export function owedKindFor(category: ExpenseCategory): AdjustmentKind {
  return category === "contractor_services" ? "fixed_fee" : "reimbursement";
}

/** The amount owed to a contractor for this expense, if a contractor paid it. */
export function owedFor(data: BackofficeData, expenseId: string): Adjustment | undefined {
  return data.adjustments.find((a) => a.projectExpenseId === expenseId);
}

/** How much of the amount owed has been paid. */
export function owedPaidCents(data: BackofficeData, owed: Adjustment): Cents {
  return paidAgainst(data, { kind: owed.kind, id: owed.id });
}

/** e.g. "Apple: Test iPhone · Member portal", so What's due shows where it came from. */
function owedDescription(data: BackofficeData, x: Pick<ProjectExpense, "vendor" | "description" | "projectId">): string {
  const project = x.projectId ? data.projects.find((p) => p.id === x.projectId)?.name : undefined;
  return [x.description ? `${x.vendor}: ${x.description}` : x.vendor, project ?? "Company"].join(" · ");
}

function createOwed(data: BackofficeData, expense: ProjectExpense, today: ISODate, newId: IdFactory): BackofficeData {
  if (expense.paidBy.kind !== "contractor") return data;
  const r = addAdjustment(
    data,
    { contractorId: expense.paidBy.contractorId, kind: owedKindFor(expense.category), description: owedDescription(data, expense), amountCents: expense.amountCents },
    today,
    newId,
  );
  return { ...r.data, adjustments: r.data.adjustments.map((a) => (a.id === r.adjustment.id ? { ...a, projectExpenseId: expense.id } : a)) };
}

export function addProjectExpense(data: BackofficeData, input: ProjectExpenseInput, today: ISODate, newId: IdFactory = randomId) {
  validate(data, input);
  const expense: ProjectExpense = { id: newId("pex"), ...fields(input), createdOn: today };
  const next = createOwed({ ...data, projectExpenses: [...data.projectExpenses, expense] }, expense, today, newId);
  return { data: next, expense };
}

/**
 * Edit an expense. While nothing has been paid against what a contractor is
 * owed, that amount follows the edit (including switching who paid). Once any
 * payment is applied, the amount, payee and kind are locked.
 */
export function updateProjectExpense(data: BackofficeData, id: string, input: ProjectExpenseInput, today: ISODate, newId: IdFactory = randomId) {
  const existing = data.projectExpenses.find((x) => x.id === id);
  if (!existing) throw new DomainError("Expense not found.");
  validate(data, input);
  const expense: ProjectExpense = { ...existing, ...fields(input) };
  if (reservedExpenseIds(data).has(id) && (expense.amountCents !== existing.amountCents || expense.projectId !== existing.projectId || expense.billable !== existing.billable || expense.date !== existing.date)) {
    throw new FormError({ form: "This expense is on an invoice draft, so its amount, date, project and billable setting can't change. Remove it from the draft first." });
  }
  let next: BackofficeData = { ...data, projectExpenses: data.projectExpenses.map((x) => (x.id === id ? expense : x)) };

  const owed = owedFor(data, id);
  if (owed && owedPaidCents(data, owed) > 0) {
    const samePayee = expense.paidBy.kind === "contractor" && expense.paidBy.contractorId === owed.contractorId;
    if (!samePayee || expense.amountCents !== owed.amountCents || owedKindFor(expense.category) !== owed.kind) {
      throw new FormError({ form: "Payments have already been applied to what's owed for this expense, so its amount, category type and who paid can't change." });
    }
    next = { ...next, adjustments: next.adjustments.map((a) => (a.id === owed.id ? { ...a, description: owedDescription(data, expense) } : a)) };
    return { data: next, expense };
  }

  if (owed && expense.paidBy.kind === "contractor") {
    const contractor = data.contractors.find((c) => c.id === (expense.paidBy as { contractorId: string }).contractorId)!;
    const updated: Adjustment = {
      ...owed,
      contractorId: contractor.id,
      kind: owedKindFor(expense.category),
      description: owedDescription(data, expense),
      amountCents: expense.amountCents,
      dueDate: contractor.id === owed.contractorId ? owed.dueDate : nextPayday(contractor, today),
    };
    return { data: { ...next, adjustments: next.adjustments.map((a) => (a.id === owed.id ? updated : a)) }, expense };
  }
  if (owed) next = { ...next, adjustments: next.adjustments.filter((a) => a.id !== owed.id) };
  return { data: createOwed(next, expense, today, newId), expense };
}

/** Delete an expense (and what a contractor is owed for it, if nothing has been paid against that). */
export function deleteProjectExpense(data: BackofficeData, id: string): BackofficeData {
  if (!data.projectExpenses.some((x) => x.id === id)) throw new DomainError("Expense not found.");
  if (reservedExpenseIds(data).has(id)) throw new DomainError("This expense is on an invoice draft. Remove it from the draft first.");
  const owed = owedFor(data, id);
  if (owed && owedPaidCents(data, owed) > 0) throw new DomainError("Payments have already been applied to what's owed for this expense, so it can't be deleted.");
  return {
    ...data,
    projectExpenses: data.projectExpenses.filter((x) => x.id !== id),
    adjustments: owed ? data.adjustments.filter((a) => a.id !== owed.id) : data.adjustments,
  };
}

/** Expenses for one project (or the company with null), newest first. */
export function expensesFor(data: BackofficeData, projectId: string | null): ProjectExpense[] {
  return data.projectExpenses.filter((x) => x.projectId === projectId).sort((a, b) => compareDates(b.date, a.date) || a.vendor.localeCompare(b.vendor));
}

export function expenseTotals(expenses: ProjectExpense[]): { totalCents: Cents; billableCents: Cents } {
  return {
    totalCents: expenses.reduce((s, x) => s + x.amountCents, 0),
    billableCents: expenses.filter((x) => x.billable).reduce((s, x) => s + x.amountCents, 0),
  };
}
