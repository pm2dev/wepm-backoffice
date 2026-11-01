/**
 * Every change the app can make, as pure functions over BackofficeData.
 * The browser sample store and the server (Postgres) both run these, so the
 * business rules live in exactly one place.
 */
import * as billing from "@/lib/domain/billing";
import { ValidationError, type FieldErrors } from "@/lib/domain/contractors";
import * as contractors from "@/lib/domain/contractors";
import * as expenses from "@/lib/domain/expenses";
import { commitImport } from "@/lib/domain/history-import";
import { emptyData } from "@/lib/domain/empty";
import * as payroll from "@/lib/domain/payroll";
import * as qb from "@/lib/domain/quickbooks-sync";
import type { BackofficeData } from "@/lib/domain/types";
import { buildSampleData } from "./sample-fixtures";

type Result<R> = { data: BackofficeData; result: R };
const unit = (data: BackofficeData): Result<null> => ({ data, result: null });

export const OPERATIONS = {
  finalizePayroll: (d: BackofficeData, a: { key: string; today: string }) => {
    const r = payroll.finalizePayroll(d, a.key, a.today);
    return { data: r.data, result: r.payroll };
  },
  recordPayment: (d: BackofficeData, a: { input: payroll.RecordPaymentInput; today: string }) => {
    const r = payroll.recordPayment(d, a.input, a.today);
    return { data: r.data, result: r.payment };
  },
  addAdjustment: (d: BackofficeData, a: { input: Parameters<typeof payroll.addAdjustment>[1]; today: string }) => {
    const r = payroll.addAdjustment(d, a.input, a.today);
    return { data: r.data, result: r.adjustment };
  },
  // A newly mapped wepm.app person ID can resolve held-back time entries.
  addContractor: (d: BackofficeData, a: { input: Parameters<typeof contractors.addContractor>[1]; today: string }) => {
    const r = contractors.addContractor(d, a.input);
    return { data: billing.reprocessExceptions(r.data, a.today).data, result: r.contractor };
  },
  updateContractor: (d: BackofficeData, a: { id: string; input: contractors.ContractorInput; today: string }) => {
    const r = contractors.updateContractor(d, a.id, a.input);
    return { data: billing.reprocessExceptions(r.data, a.today).data, result: r.contractor };
  },
  addRate: (d: BackofficeData, a: { input: Parameters<typeof contractors.addRate>[1] }) => {
    const r = contractors.addRate(d, a.input);
    return { data: r.data, result: r.rate };
  },
  importHistoricalHours: (d: BackofficeData, a: { input: Parameters<typeof commitImport>[1]; today: string }) => {
    const r = commitImport(d, a.input, a.today);
    return { data: r.data, result: r.batch };
  },
  addPaymentAccount: (d: BackofficeData, a: { input: Parameters<typeof expenses.addPaymentAccount>[1] }) => {
    const r = expenses.addPaymentAccount(d, a.input);
    return { data: r.data, result: r.account };
  },
  addExpense: (d: BackofficeData, a: { input: expenses.ExpenseInput; today: string }) => {
    const r = expenses.addExpense(d, a.input, a.today);
    return { data: r.data, result: r.expense };
  },
  updateExpense: (d: BackofficeData, a: { id: string; input: expenses.ExpenseInput; today: string }) => {
    const r = expenses.updateExpense(d, a.id, a.input, a.today);
    return { data: r.data, result: r.expense };
  },
  stopExpense: (d: BackofficeData, a: { id: string; endDate: string | null }) => unit(expenses.stopExpense(d, a.id, a.endDate)),
  setChargesPaid: (d: BackofficeData, a: { keys: string[]; paidOn: string | null }) => unit(expenses.setChargesPaid(d, a.keys, a.paidOn)),
  setChargeAmount: (d: BackofficeData, a: { key: string; amountCents: number }) => unit(expenses.setChargeAmount(d, a.key, a.amountCents)),
  addCustomer: (d: BackofficeData, a: { input: billing.CustomerInput }) => {
    const r = billing.addCustomer(d, a.input);
    return { data: r.data, result: r.customer };
  },
  updateCustomer: (d: BackofficeData, a: { id: string; input: billing.CustomerInput }) => {
    const r = billing.updateCustomer(d, a.id, a.input);
    return { data: r.data, result: r.customer };
  },
  addProject: (d: BackofficeData, a: { input: billing.ProjectInput; today: string }) => {
    const r = billing.addProject(d, a.input, a.today);
    return { data: r.data, result: r.project };
  },
  updateProject: (d: BackofficeData, a: { id: string; input: billing.ProjectInput; today: string }) => {
    const r = billing.updateProject(d, a.id, a.input, a.today);
    return { data: r.data, result: r.project };
  },
  markInvoiced: (d: BackofficeData, a: { input: Parameters<typeof billing.markInvoiced>[1] }) => {
    const r = billing.markInvoiced(d, a.input);
    return { data: r.data, result: r.record };
  },
  removeBillingRecord: (d: BackofficeData, a: { id: string }) => unit(billing.removeBillingRecord(d, a.id)),
  syncQuickBooks: (d: BackofficeData, a: { batch: Parameters<typeof qb.syncQuickBooks>[1]; today: string }) => {
    const r = qb.syncQuickBooks(d, a.batch, a.today);
    return { data: r.data, result: r };
  },
  setInvoiceManuallyPaid: (d: BackofficeData, a: { invoiceId: string; value: { on: string; note?: string } | null }) => unit(qb.setInvoiceManuallyPaid(d, a.invoiceId, a.value)),
  setPaymentDone: (d: BackofficeData, a: { receiptId: string; value: { on: string; note?: string } | null }) => unit(qb.setPaymentDone(d, a.receiptId, a.value)),
  setQuickBooksRealmId: (d: BackofficeData, a: { realmId: string }) => unit(qb.setQuickBooksRealmId(d, a.realmId)),
  simulateQuickBooksPayment: (d: BackofficeData, a: { input: Parameters<typeof qb.simulateQuickBooksPayment>[1]; today: string }) => {
    const r = qb.simulateQuickBooksPayment(d, a.input, a.today);
    return { data: r.data, result: r.receipt };
  },
  /** Development/sample only: replace everything with the sample data set. */
  resetToSample: (d: BackofficeData, a: Record<string, never>) => {
    void d;
    void a;
    return { data: buildSampleData(), result: null };
  },
  /** Development only: start from an empty workspace. */
  resetToEmpty: (d: BackofficeData, a: Record<string, never>) => {
    void d;
    void a;
    return { data: emptyData(), result: null };
  },
} satisfies Record<string, (d: BackofficeData, a: never) => Result<unknown>>;

export type OperationName = keyof typeof OPERATIONS;
export type OperationArgs<K extends OperationName> = Parameters<(typeof OPERATIONS)[K]>[1];
export type OperationResult<K extends OperationName> = ReturnType<(typeof OPERATIONS)[K]>["result"];

/** Operations the browser may never trigger in a live environment (webhooks only). */
export const SERVER_ONLY_OPERATIONS: OperationName[] = ["syncQuickBooks"];
/** Operations allowed only in development (and the sample preview). */
export const DEVELOPMENT_ONLY_OPERATIONS: OperationName[] = ["simulateQuickBooksPayment", "resetToSample", "resetToEmpty"];

export function isOperationName(name: string): name is OperationName {
  return Object.prototype.hasOwnProperty.call(OPERATIONS, name);
}

export function applyOperation<K extends OperationName>(data: BackofficeData, op: K, args: OperationArgs<K>): { data: BackofficeData; result: OperationResult<K> } {
  const fn = OPERATIONS[op] as (d: BackofficeData, a: OperationArgs<K>) => { data: BackofficeData; result: OperationResult<K> };
  return fn(data, args);
}

// ---------------------------------------------------------------------------
// Errors across the wire: rules raise DomainError subclasses; the server
// serializes them and the browser re-creates the same classes, so forms show
// the same field messages in sample and live modes.
// ---------------------------------------------------------------------------

export type SerializedError = { kind: "validation" | "expense" | "form" | "domain"; message: string; fields?: Record<string, string> };

export function serializeError(e: unknown): SerializedError | null {
  if (e instanceof ValidationError) return { kind: "validation", message: e.message, fields: e.fields as Record<string, string> };
  if (e instanceof expenses.ExpenseValidationError) return { kind: "expense", message: e.message, fields: e.fields as Record<string, string> };
  if (e instanceof billing.FormError) return { kind: "form", message: e.message, fields: e.fields };
  if (e instanceof payroll.DomainError) return { kind: "domain", message: e.message };
  return null;
}

export function deserializeError(s: SerializedError): Error {
  switch (s.kind) {
    case "validation":
      return new ValidationError((s.fields ?? {}) as FieldErrors);
    case "expense":
      return new expenses.ExpenseValidationError(s.fields ?? {});
    case "form":
      return new billing.FormError(s.fields ?? {});
    default:
      return new payroll.DomainError(s.message);
  }
}
