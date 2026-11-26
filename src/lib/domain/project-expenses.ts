import { compareDates, isISODate, type ISODate } from "./dates";
import type { Cents } from "./money";
import { FormError } from "./billing";
import { DomainError, randomId, type IdFactory } from "./payroll";
import type { BackofficeData, ExpenseCategory, ProjectExpense } from "./types";

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
  if (input.paidBy.kind !== "account" || !data.paymentAccounts.some((a) => a.id === input.paidBy.accountId)) e.paidBy = "Choose the card or account it was paid from.";
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
    paidBy: { kind: "account", accountId: input.paidBy.accountId },
    receiptUrl: input.receiptUrl?.trim() || undefined,
    notes: input.notes?.trim() || undefined,
  };
}

export function addProjectExpense(data: BackofficeData, input: ProjectExpenseInput, today: ISODate, newId: IdFactory = randomId) {
  validate(data, input);
  const expense: ProjectExpense = { id: newId("pex"), ...fields(input), createdOn: today };
  return { data: { ...data, projectExpenses: [...data.projectExpenses, expense] }, expense };
}

export function updateProjectExpense(data: BackofficeData, id: string, input: ProjectExpenseInput) {
  const existing = data.projectExpenses.find((x) => x.id === id);
  if (!existing) throw new DomainError("Expense not found.");
  validate(data, input);
  const expense: ProjectExpense = { ...existing, ...fields(input) };
  return { data: { ...data, projectExpenses: data.projectExpenses.map((x) => (x.id === id ? expense : x)) }, expense };
}

export function deleteProjectExpense(data: BackofficeData, id: string): BackofficeData {
  if (!data.projectExpenses.some((x) => x.id === id)) throw new DomainError("Expense not found.");
  return { ...data, projectExpenses: data.projectExpenses.filter((x) => x.id !== id) };
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
