import { describe, expect, it } from "vitest";
import { buildSampleData, SAMPLE_BUSINESS_DATE } from "@/lib/data/sample-fixtures";
import { recommend, recordInvoiceReceipt } from "./cashflow";
import { listCharges } from "./expenses";
import { totalOutstanding, whatsDue, type IdFactory } from "./payroll";

const TODAY = SAMPLE_BUSINESS_DATE;
let n = 0;
const ids: IdFactory = (p) => `${p}_r${++n}`;
const receive = (amountCents: number, externalPaymentId = `qbo-${amountCents}`) =>
  recordInvoiceReceipt(buildSampleData(), { externalPaymentId, customerId: null, quickbooksCustomerId: "QB-1042", amountCents, receivedOn: TODAY }, ids);

describe("receipts", () => {
  it("maps the customer by QuickBooks ID and ignores duplicate deliveries", () => {
    const first = receive(100000, "qbo-x");
    expect(first.receipt.customerId).toBe("cust_acme");
    const { id: _id, ...redelivered } = first.receipt;
    void _id;
    const again = recordInvoiceReceipt(first.data, redelivered, ids);
    expect(again.duplicate).toBe(true);
    expect(again.data.invoiceReceipts).toHaveLength(first.data.invoiceReceipts.length);
  });
});

describe("recommendations", () => {
  it("covers contractor pay first by due date, never exceeding the payment or a balance", () => {
    const { data, receipt } = receive(100000);
    const r = recommend(data, receipt.id, TODAY);
    expect(r.suggestedTotalCents + r.remainderCents).toBe(100000);
    expect(r.suggestedTotalCents).toBeLessThanOrEqual(100000);
    expect(r.bills).toHaveLength(0); // $1,000 doesn't get past contractor pay
    for (const s of r.contractor) expect(s.suggestedCents).toBeLessThanOrEqual(s.outstandingCents);
    const dates = r.contractor.map((s) => s.dueDate);
    expect([...dates].sort()).toEqual(dates);
    expect(r.shortfallCents).toBeGreaterThan(0);
  });

  it("moves on to bills, then shows the remainder", () => {
    const { data, receipt } = receive(10_000_00);
    const r = recommend(data, receipt.id, TODAY);
    const contractorTotal = totalOutstanding(whatsDue(data, TODAY));
    expect(r.contractor.reduce((s, x) => s + x.suggestedCents, 0)).toBe(contractorTotal);
    expect(r.bills.length).toBeGreaterThan(0);
    expect(r.bills.every((b) => b.suggestedCents === b.outstandingCents)).toBe(true);
    expect(r.remainderCents).toBe(10_000_00 - r.suggestedTotalCents);
    expect(r.shortfallCents).toBe(0);
    expect(r.unpricedPayrollMinutes).toBe(15 * 60);
  });

  it("never changes balances or paid status, and repeats for a second payment", () => {
    const first = receive(200000, "a");
    const second = recordInvoiceReceipt(first.data, { externalPaymentId: "b", customerId: null, amountCents: 200000, receivedOn: TODAY }, ids);
    const before = JSON.stringify(second.data);
    const r1 = recommend(second.data, first.receipt.id, TODAY);
    const r2 = recommend(second.data, second.receipt.id, TODAY);
    expect(JSON.stringify(second.data)).toBe(before);
    // Independent snapshots: the same obligations are suggested again.
    expect(r2.contractor.map((s) => s.key)).toEqual(r1.contractor.map((s) => s.key));
    expect(listCharges(second.data, "2026-11-30").filter((c) => c.paid).length).toBe(listCharges(buildSampleData(), "2026-11-30").filter((c) => c.paid).length);
  });
});
