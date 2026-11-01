import { mapInvoice, mapPayment, QuickBooksMappingError, type QboInvoice, type QboPayment } from "@/lib/integrations/quickbooks";
import { daysBetween, isISODate, type ISODate } from "./dates";
import type { Cents } from "./money";
import { DomainError, randomId, type IdFactory } from "./payroll";
import type { BackofficeData, InvoiceReceipt, QuickBooksInvoice } from "./types";

export type SyncResult = {
  data: BackofficeData;
  /** Deliveries older than what's stored (gateway retries can arrive out of order). */
  stale: number;
  invoicesAdded: number;
  invoicesUpdated: number;
  paymentsAdded: number;
  paymentsUpdated: number;
  /** Records that couldn't be mapped; nothing from them is stored. */
  rejected: { id: string; reason: string }[];
};

/**
 * Apply a batch of QuickBooks invoices and payments (as delivered by Slashbin).
 * QuickBooks is the source of truth for amounts, balances and dates; owner
 * marks (manually paid, done) are kept. Re-delivery never duplicates records.
 * Customers are matched only by QuickBooks customer ID.
 */
export function syncQuickBooks(
  data: BackofficeData,
  batch: { invoices?: QboInvoice[]; payments?: QboPayment[] },
  today: ISODate,
  newId: IdFactory = randomId,
  opts: { sample?: boolean; simulated?: boolean } = {},
): SyncResult {
  const customerByQb = new Map(data.customers.filter((c) => c.quickbooksCustomerId).map((c) => [c.quickbooksCustomerId!, c.id]));
  const rejected: SyncResult["rejected"] = [];
  let invoices = [...data.quickbooksInvoices];
  let receipts = [...data.invoiceReceipts];
  let invoicesAdded = 0, invoicesUpdated = 0, paymentsAdded = 0, paymentsUpdated = 0, stale = 0;
  const isOlder = (incoming?: string, stored?: string) => !!incoming && !!stored && Date.parse(incoming) < Date.parse(stored);

  for (const raw of batch.invoices ?? []) {
    if (raw.status === "Deleted") {
      // Deleted in QuickBooks: drop it unless the owner recorded something on it.
      invoices = invoices.filter((i) => i.qbInvoiceId !== raw.Id || i.manuallyPaid);
      continue;
    }
    try {
      const m = mapInvoice(raw);
      const existing = invoices.find((i) => i.qbInvoiceId === m.qbInvoiceId);
      const fields = { ...m, customerId: customerByQb.get(m.qbCustomerId) ?? null, lastSyncedOn: today };
      if (existing && isOlder(m.qbLastUpdated, existing.qbLastUpdated)) {
        stale++;
        continue;
      }
      if (existing) {
        invoices = invoices.map((i) => (i.id === existing.id ? { ...existing, ...fields } : i));
        invoicesUpdated++;
      } else {
        invoices.push({ id: newId("qinv"), ...fields, sample: opts.sample || undefined });
        invoicesAdded++;
      }
    } catch (e) {
      rejected.push({ id: `invoice ${raw.Id ?? "?"}`, reason: e instanceof QuickBooksMappingError ? e.message : "Unreadable invoice" });
    }
  }

  const docNumber = (qbInvoiceId: string) => invoices.find((i) => i.qbInvoiceId === qbInvoiceId)?.docNumber ?? `#${qbInvoiceId}`;
  for (const raw of batch.payments ?? []) {
    if (raw.status === "Deleted") {
      receipts = receipts.filter((r) => r.externalPaymentId !== raw.Id || r.done);
      continue;
    }
    try {
      const m = mapPayment(raw);
      const fields = {
        externalPaymentId: m.externalPaymentId,
        quickbooksCustomerId: m.quickbooksCustomerId,
        customerId: customerByQb.get(m.quickbooksCustomerId) ?? null,
        receivedOn: m.receivedOn,
        amountCents: m.amountCents,
        unappliedCents: m.unappliedCents || undefined,
        paymentRef: m.paymentRef,
        appliedTo: m.appliedTo,
        invoiceRef: m.appliedTo.map((a) => docNumber(a.qbInvoiceId)).join(", ") || undefined,
        qbLastUpdated: m.qbLastUpdated,
      };
      const existing = receipts.find((r) => r.externalPaymentId === m.externalPaymentId);
      if (existing && isOlder(m.qbLastUpdated, existing.qbLastUpdated)) {
        stale++;
        continue;
      }
      if (existing) {
        receipts = receipts.map((r) => (r.id === existing.id ? { ...existing, ...fields } : r));
        paymentsUpdated++;
      } else {
        receipts.push({ id: newId("rcpt"), ...fields, sample: opts.sample || undefined, simulated: opts.simulated || undefined });
        paymentsAdded++;
      }
    } catch (e) {
      rejected.push({ id: `payment ${raw.Id ?? "?"}`, reason: e instanceof QuickBooksMappingError ? e.message : "Unreadable payment" });
    }
  }

  return { data: { ...data, quickbooksInvoices: invoices, invoiceReceipts: receipts }, stale, invoicesAdded, invoicesUpdated, paymentsAdded, paymentsUpdated, rejected };
}

// ---------------------------------------------------------------------------
// Views and manual marks
// ---------------------------------------------------------------------------

export type InvoiceStatus = "open" | "partially_paid" | "overdue" | "paid" | "marked_paid";

export type InvoiceView = QuickBooksInvoice & {
  status: InvoiceStatus;
  paidCents: Cents;
  daysOverdue: number;
  payments: { receipt: InvoiceReceipt; amountCents: Cents }[];
};

export function invoiceView(data: BackofficeData, inv: QuickBooksInvoice, today: ISODate): InvoiceView {
  const payments = data.invoiceReceipts.flatMap((r) => (r.appliedTo ?? []).filter((a) => a.qbInvoiceId === inv.qbInvoiceId).map((a) => ({ receipt: r, amountCents: a.amountCents })));
  const overdue = inv.balanceCents > 0 && !!inv.dueDate && inv.dueDate < today;
  const status: InvoiceStatus =
    inv.balanceCents <= 0 ? "paid" : inv.manuallyPaid ? "marked_paid" : overdue ? "overdue" : inv.balanceCents < inv.totalCents ? "partially_paid" : "open";
  return {
    ...inv,
    status,
    paidCents: inv.totalCents - inv.balanceCents,
    daysOverdue: overdue && inv.dueDate ? daysBetween(inv.dueDate, today) : 0,
    payments,
  };
}

export function listInvoices(data: BackofficeData, today: ISODate): InvoiceView[] {
  return data.quickbooksInvoices.map((i) => invoiceView(data, i, today)).sort((a, b) => (a.txnDate === b.txnDate ? (a.docNumber ?? "").localeCompare(b.docNumber ?? "") : a.txnDate < b.txnDate ? 1 : -1));
}

/** Invoices still open per QuickBooks and not manually settled. */
export function outstandingInvoiceCents(views: InvoiceView[]): Cents {
  return views.filter((v) => v.status !== "paid" && v.status !== "marked_paid").reduce((s, v) => s + v.balanceCents, 0);
}

function mark(on: ISODate, note?: string) {
  if (!isISODate(on)) throw new DomainError("Enter a date.");
  return { on, note: note?.trim() || undefined };
}

/**
 * Manually mark an invoice paid (or clear the mark with null) — e.g. paid
 * outside QuickBooks or QuickBooks not yet updated. Backoffice never writes
 * this back to QuickBooks; a later sync showing a zero balance supersedes it.
 */
export function setInvoiceManuallyPaid(data: BackofficeData, invoiceId: string, value: { on: ISODate; note?: string } | null): BackofficeData {
  if (!data.quickbooksInvoices.some((i) => i.id === invoiceId)) throw new DomainError("Invoice not found.");
  return {
    ...data,
    quickbooksInvoices: data.quickbooksInvoices.map((i) => (i.id === invoiceId ? { ...i, manuallyPaid: value ? mark(value.on, value.note) : undefined } : i)),
  };
}

/** Mark a received payment done (handled/allocated), or reopen it with null. */
export function setPaymentDone(data: BackofficeData, receiptId: string, value: { on: ISODate; note?: string } | null): BackofficeData {
  if (!data.invoiceReceipts.some((r) => r.id === receiptId)) throw new DomainError("Payment not found.");
  return {
    ...data,
    invoiceReceipts: data.invoiceReceipts.map((r) => (r.id === receiptId ? { ...r, done: value ? mark(value.on, value.note) : undefined } : r)),
  };
}

/**
 * Prototype only: emulate QuickBooks recording a customer payment (optionally
 * applied to one open invoice, lowering its balance) and Slashbin delivering it.
 */
export function simulateQuickBooksPayment(
  data: BackofficeData,
  input: { customerId: string; amountCents: Cents; receivedOn: ISODate; invoiceId?: string; paymentRef?: string },
  today: ISODate,
  newId: IdFactory = randomId,
): { data: BackofficeData; receipt: InvoiceReceipt } {
  const customer = data.customers.find((c) => c.id === input.customerId);
  if (!customer?.quickbooksCustomerId) throw new DomainError("Choose a customer linked to a QuickBooks customer ID.");
  if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0) throw new DomainError("Enter an amount greater than $0.");
  if (!isISODate(input.receivedOn)) throw new DomainError("Enter the date received.");
  const inv = input.invoiceId ? data.quickbooksInvoices.find((i) => i.id === input.invoiceId) : undefined;
  if (input.invoiceId && !inv) throw new DomainError("Invoice not found.");
  if (inv && input.amountCents > inv.balanceCents) throw new DomainError("That's more than the invoice's open balance.");
  const paymentId = `sim-${newId("p")}`;
  const dollars = (c: Cents) => c / 100;
  const result = syncQuickBooks(
    data,
    {
      invoices: inv
        ? [{ Id: inv.qbInvoiceId, DocNumber: inv.docNumber, TxnDate: inv.txnDate, DueDate: inv.dueDate, TotalAmt: dollars(inv.totalCents), Balance: dollars(inv.balanceCents - input.amountCents), CustomerRef: { value: customer.quickbooksCustomerId } }]
        : [],
      payments: [
        {
          Id: paymentId,
          TxnDate: input.receivedOn,
          TotalAmt: dollars(input.amountCents),
          UnappliedAmt: inv ? 0 : dollars(input.amountCents),
          PaymentRefNum: input.paymentRef,
          CustomerRef: { value: customer.quickbooksCustomerId },
          Line: inv ? [{ Amount: dollars(input.amountCents), LinkedTxn: [{ TxnId: inv.qbInvoiceId, TxnType: "Invoice" }] }] : [],
        },
      ],
    },
    today,
    newId,
    { simulated: true },
  );
  return { data: result.data, receipt: result.data.invoiceReceipts.find((r) => r.externalPaymentId === paymentId)! };
}

/** Save the QuickBooks company ID (realmId) used to accept webhooks. */
export function setQuickBooksRealmId(data: BackofficeData, realmId: string): BackofficeData {
  const v = realmId.trim();
  if (v && !/^\d{4,20}$/.test(v)) throw new DomainError("A QuickBooks company ID is a number, e.g. 9130350000000000.");
  return { ...data, integrations: { ...data.integrations, quickbooksRealmId: v || undefined } };
}
