import { describe, expect, it } from "vitest";
import { buildSampleData, SAMPLE_BUSINESS_DATE } from "@/lib/data/sample-fixtures";
import { mapPayment, qboAmountToCents, type QboInvoice, type QboPayment } from "@/lib/integrations/quickbooks";
import { recommend } from "./cashflow";
import type { IdFactory } from "./payroll";
import { invoiceView, listInvoices, outstandingInvoiceCents, setInvoiceManuallyPaid, setPaymentDone, syncQuickBooks } from "./quickbooks-sync";

const TODAY = SAMPLE_BUSINESS_DATE;
let n = 0;
const ids: IdFactory = (p) => `${p}_q${++n}`;
const invoice = (over: Partial<QboInvoice> = {}): QboInvoice => ({ Id: "2001", DocNumber: "INV-9", TxnDate: "2026-10-20", DueDate: "2026-11-04", TotalAmt: 1234.56, Balance: 1234.56, CustomerRef: { value: "QB-1042" }, ...over });
const payment = (over: Partial<QboPayment> = {}): QboPayment => ({ Id: "9001", TxnDate: "2026-10-31", TotalAmt: 1000, CustomerRef: { value: "QB-1042" }, Line: [{ Amount: 1000, LinkedTxn: [{ TxnId: "2001", TxnType: "Invoice" }] }], ...over });

describe("QuickBooks mapping", () => {
  it("converts amounts to cents exactly and links payments to invoices", () => {
    expect(qboAmountToCents(1234.56)).toBe(123456);
    expect(qboAmountToCents(0.1 + 0.2)).toBe(30);
    expect(qboAmountToCents(-5.5)).toBe(-550);
    const m = mapPayment(payment({ UnappliedAmt: 25, PaymentRefNum: "Check 1" }));
    expect(m).toMatchObject({ externalPaymentId: "9001", amountCents: 100000, unappliedCents: 2500, paymentRef: "Check 1", appliedTo: [{ qbInvoiceId: "2001", amountCents: 100000 }] });
  });
});

describe("sync", () => {
  it("adds, then updates on re-delivery without duplicating; customers matched by QuickBooks ID", () => {
    const first = syncQuickBooks(buildSampleData(), { invoices: [invoice()], payments: [payment()] }, TODAY, ids);
    expect([first.invoicesAdded, first.paymentsAdded]).toEqual([1, 1]);
    const inv = first.data.quickbooksInvoices.find((i) => i.qbInvoiceId === "2001")!;
    expect(inv.customerId).toBe("cust_acme");
    const rcpt = first.data.invoiceReceipts.find((r) => r.externalPaymentId === "9001")!;
    expect(rcpt.invoiceRef).toBe("INV-9");
    // QuickBooks later shows the payment applied → balance drops; owner's marks survive.
    let data = setPaymentDone(first.data, rcpt.id, { on: TODAY });
    const second = syncQuickBooks(data, { invoices: [invoice({ Balance: 234.56 })], payments: [payment()] }, TODAY, ids);
    expect([second.invoicesAdded, second.invoicesUpdated, second.paymentsAdded, second.paymentsUpdated]).toEqual([0, 1, 0, 1]);
    data = second.data;
    expect(data.quickbooksInvoices.filter((i) => i.qbInvoiceId === "2001")).toHaveLength(1);
    expect(data.invoiceReceipts.find((r) => r.externalPaymentId === "9001")!.done?.on).toBe(TODAY);
    expect(invoiceView(data, data.quickbooksInvoices.find((i) => i.qbInvoiceId === "2001")!, TODAY).status).toBe("partially_paid");
  });

  it("rejects unreadable records without storing anything from them", () => {
    const r = syncQuickBooks(buildSampleData(), { invoices: [invoice({ TxnDate: "not a date" })], payments: [payment({ Id: "" })] }, TODAY, ids);
    expect(r.rejected).toHaveLength(2);
    expect(r.invoicesAdded + r.paymentsAdded).toBe(0);
  });

  it("handles deletions in QuickBooks", () => {
    const first = syncQuickBooks(buildSampleData(), { invoices: [invoice()] }, TODAY, ids).data;
    const gone = syncQuickBooks(first, { invoices: [{ ...invoice(), status: "Deleted" }] }, TODAY, ids).data;
    expect(gone.quickbooksInvoices.some((i) => i.qbInvoiceId === "2001")).toBe(false);
  });
});

describe("manual marks", () => {
  it("an invoice can be marked paid manually and unmarked; QuickBooks balances are untouched", () => {
    const data = buildSampleData();
    const overdue = listInvoices(data, TODAY).find((i) => i.docNumber === "INV-2026-030")!;
    expect(overdue.status).toBe("overdue");
    expect(overdue.daysOverdue).toBe(16);
    const before = outstandingInvoiceCents(listInvoices(data, TODAY));
    const marked = setInvoiceManuallyPaid(data, overdue.id, { on: TODAY, note: "Paid by wire; QuickBooks not updated yet" });
    const v = listInvoices(marked, TODAY).find((i) => i.id === overdue.id)!;
    expect(v.status).toBe("marked_paid");
    expect(v.balanceCents).toBe(280000);
    expect(outstandingInvoiceCents(listInvoices(marked, TODAY))).toBe(before - 280000);
    const cleared = setInvoiceManuallyPaid(marked, overdue.id, null);
    expect(listInvoices(cleared, TODAY).find((i) => i.id === overdue.id)!.status).toBe("overdue");
  });

  it("a payment can be marked done and reopened without changing recommendations", () => {
    const data = buildSampleData();
    const rcpt = data.invoiceReceipts.find((r) => r.externalPaymentId === "5538")!;
    const before = recommend(data, rcpt.id, TODAY);
    const done = setPaymentDone(data, rcpt.id, { on: TODAY, note: "Paid Jordan and Maya" });
    expect(done.invoiceReceipts.find((r) => r.id === rcpt.id)!.done).toEqual({ on: TODAY, note: "Paid Jordan and Maya" });
    expect(recommend(done, rcpt.id, TODAY).suggestedTotalCents).toBe(before.suggestedTotalCents);
    expect(setPaymentDone(done, rcpt.id, null).invoiceReceipts.find((r) => r.id === rcpt.id)!.done).toBeUndefined();
  });

  it("sample: September payment is done; October payments are new", () => {
    const data = buildSampleData();
    const status = Object.fromEntries(data.invoiceReceipts.map((r) => [r.externalPaymentId, !!r.done]));
    expect(status).toEqual({ "5530": true, "5521": false, "5538": false });
    expect(listInvoices(data, TODAY).map((i) => [i.docNumber, i.status])).toEqual([
      ["INV-2026-031", "overdue"],
      ["INV-2026-032", "paid"],
      ["INV-2026-030", "overdue"],
      ["INV-2026-028", "paid"],
    ]);
  });
});
