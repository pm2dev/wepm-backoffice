/**
 * Strict input schemas for every operation the app may send to the server.
 * Unknown fields are rejected (no mass assignment), types and enums are
 * enforced, and every string/array has a size limit. Business rules (dates,
 * amounts, references) are still checked by the domain functions, which
 * produce the friendly form messages.
 */
import { z } from "zod";
import type { OperationArgs, OperationName } from "./operations";

const id = z.string().max(120);
const date = z.string().max(10); // "" allowed so the rules can say "Enter a date."
const today = z.string().max(10);
const text = (max: number) => z.string().max(max);
const cents = z.number().int().min(-1_000_000_000_00).max(1_000_000_000_00);
const method = z.enum(["venmo", "zelle", "bank_transfer", "check", "other"]);
const cadence = z.enum(["weekly", "biweekly", "semimonthly", "monthly"]);
const mark = z.strictObject({ on: date, note: text(1000).optional() }).nullable();

const contractorInput = z.strictObject({
  name: text(200),
  startDate: date,
  endDate: date.optional(),
  email: text(254).optional(),
  role: text(200).optional(),
  payDelayDays: z.number().int(),
  preferredMethod: method,
  paymentReference: text(200).optional(),
  notes: text(2000).optional(),
  wepmUserId: text(120).optional(),
});

const expenseInput = z.strictObject({
  vendor: text(200),
  type: z.enum(["bill", "subscription"]),
  projectId: id.nullable(),
  frequency: z.enum(["monthly", "quarterly", "annual", "one_time"]),
  firstDueDate: date,
  endDate: date.optional(),
  amountKind: z.enum(["fixed", "variable"]),
  amountCents: cents,
  autopay: z.boolean(),
  accountId: id,
  notes: text(2000).optional(),
});

const customerInput = z.strictObject({
  name: text(200),
  billingCadence: cadence,
  quickbooksCustomerId: text(120).optional(),
  notes: text(2000).optional(),
});

const projectInput = z.strictObject({
  name: text(200),
  customerId: id.nullable(),
  billable: z.boolean(),
  billingMethod: z.enum(["hourly", "task"]),
  hourlyRateCents: cents.optional(),
  taskRates: z.record(text(120), cents).refine((r) => Object.keys(r).length <= 200, "Too many task rates."),
  billingCadence: cadence.optional(),
  wepmProjectId: text(120).optional(),
  active: z.boolean(),
});

const noArgs = z.strictObject({});

type Schemas = { [K in OperationName]: z.ZodType<OperationArgs<K>> };

export const OPERATION_SCHEMAS = {
  finalizePayroll: z.strictObject({ key: text(200), today }),
  recordPayment: z.strictObject({
    input: z.strictObject({
      contractorId: id,
      paidOn: date,
      method,
      note: text(1000).optional(),
      allocations: z
        .array(z.strictObject({ obligation: z.strictObject({ kind: z.enum(["payroll", "bonus", "reimbursement"]), id }), amountCents: cents }))
        .max(200),
    }),
    today,
  }),
  addAdjustment: z.strictObject({
    input: z.strictObject({ contractorId: id, kind: z.enum(["bonus", "reimbursement"]), description: text(500), amountCents: cents }),
    today,
  }),
  addContractor: z.strictObject({ input: contractorInput.extend({ initialRateCents: cents.optional() }).strict(), today }),
  updateContractor: z.strictObject({ id, input: contractorInput, today }),
  addRate: z.strictObject({ input: z.strictObject({ contractorId: id, effectiveDate: date, hourlyRateCents: cents }) }),
  importHistoricalHours: z.strictObject({
    input: z.strictObject({
      contractorId: id,
      fileName: text(255),
      csvText: text(5_000_000),
      includeDuplicateLines: z.array(z.number().int().min(0).max(1_000_000)).max(100_000).optional(),
    }),
    today,
  }),
  addPaymentAccount: z.strictObject({ input: z.strictObject({ kind: z.enum(["card", "bank"]), nickname: text(100), last4: text(32).optional() }) }),
  addExpense: z.strictObject({ input: expenseInput, today }),
  updateExpense: z.strictObject({ id, input: expenseInput, today }),
  stopExpense: z.strictObject({ id, endDate: date.nullable() }),
  setChargesPaid: z.strictObject({ keys: z.array(text(200)).max(1000), paidOn: date.nullable() }),
  setChargeAmount: z.strictObject({ key: text(200), amountCents: cents }),
  addCustomer: z.strictObject({ input: customerInput }),
  updateCustomer: z.strictObject({ id, input: customerInput }),
  addProject: z.strictObject({ input: projectInput, today }),
  updateProject: z.strictObject({ id, input: projectInput, today }),
  markInvoiced: z.strictObject({
    input: z.strictObject({ projectId: id, through: date.optional(), invoicedOn: date, quickbooksInvoiceRef: text(100).optional() }),
  }),
  removeBillingRecord: z.strictObject({ id }),
  // Server-only (webhooks): never accepted from the browser.
  syncQuickBooks: z.never(),
  setInvoiceManuallyPaid: z.strictObject({ invoiceId: id, value: mark }),
  setPaymentDone: z.strictObject({ receiptId: id, value: mark }),
  setQuickBooksRealmId: z.strictObject({ realmId: text(32) }),
  simulateQuickBooksPayment: z.strictObject({
    input: z.strictObject({ customerId: id, amountCents: cents, receivedOn: date, invoiceId: id.optional(), paymentRef: text(100).optional() }),
    today,
  }),
  resetToSample: noArgs,
  resetToEmpty: noArgs,
} satisfies Schemas;

/** Validate an operation's args. Returns parsed (clean) args or a short reason. */
export function parseOperationArgs<K extends OperationName>(op: K, args: unknown): { ok: true; args: OperationArgs<K> } | { ok: false; reason: string } {
  const result = (OPERATION_SCHEMAS[op] as z.ZodType<OperationArgs<K>>).safeParse(args);
  if (result.success) return { ok: true, args: result.data };
  const issue = result.error.issues[0];
  return { ok: false, reason: issue ? `${issue.path.join(".") || "request"}: ${issue.message}` : "invalid request" };
}
