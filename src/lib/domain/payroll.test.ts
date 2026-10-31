import { describe, expect, it } from "vitest";
import { buildSampleData, SAMPLE_BUSINESS_DATE } from "@/lib/data/sample-fixtures";
import { ingestApprovedTime } from "./ingest";
import { parseDollars, payForMinutes } from "./money";
import {
  addAdjustment,
  computeDraftPayrolls,
  draftKey,
  finalizePayroll,
  listObligations,
  outstandingFor,
  recordPayment,
  totalOutstanding,
  whatsDue,
  type IdFactory,
} from "./payroll";
import { rateOn } from "./rates";
import { nextPayday, payPeriodFor } from "./schedule";
import type { BackofficeData, IncomingTimeRecord } from "./types";

const TODAY = SAMPLE_BUSINESS_DATE;
let counter = 0;
const shared: IdFactory = (p) => `${p}_t${++counter}`;
const ids = (): IdFactory => shared;

function base(): BackofficeData {
  return {
    schemaVersion: 6,
    contractors: [
      { id: "c1", name: "Test Person", startDate: "2026-01-05", schedule: { kind: "weekly", payDelayDays: 5 }, preferredMethod: "venmo", wepmUserId: "u1" },
    ],
    rates: [
      { id: "r1", contractorId: "c1", effectiveDate: "2026-01-05", hourlyRateCents: 2300 },
      { id: "r2", contractorId: "c1", effectiveDate: "2026-10-21", hourlyRateCents: 2500 },
    ],
    projects: [
      { id: "p1", name: "Client work", customerId: null, billable: true, billingMethod: "hourly", hourlyRateCents: 10000, taskRates: {}, wepmProjectId: "wp1", active: true },
      { id: "p2", name: "Internal", customerId: null, billable: false, billingMethod: "hourly", taskRates: {}, wepmProjectId: "wp2", active: true },
    ],
    timeEntries: [],
    timeExceptions: [],
    payrolls: [],
    adjustments: [],
    payments: [],
    importBatches: [],
    paymentAccounts: [],
    expenses: [],
    expenseCharges: [],
    customers: [],
    billingRecords: [],
    invoiceReceipts: [],
    quickbooksInvoices: [],
  };
}

const rec = (id: string, workDate: string, minutes: number, extra: Partial<IncomingTimeRecord> = {}): IncomingTimeRecord => ({
  sourceEntryId: id,
  sourceTimesheetId: "ts1",
  wepmUserId: "u1",
  wepmProjectId: "wp1",
  task: "Development",
  workDate,
  minutes,
  approvedAt: "2026-10-26",
  ...extra,
});

const week = [rec("e1", "2026-10-19", 480), rec("e2", "2026-10-20", 480), rec("e3", "2026-10-21", 480), rec("e4", "2026-10-22", 480, { wepmProjectId: "wp2" })];

describe("schedule", () => {
  it("Oct 19–25 is one week, due the following Friday Oct 30", () => {
    const c = base().contractors[0];
    expect(payPeriodFor(c, "2026-10-23")).toEqual({ start: "2026-10-19", end: "2026-10-25", dueDate: "2026-10-30" });
    expect(nextPayday(c, "2026-10-31")).toBe("2026-11-06");
    expect(nextPayday(c, "2026-10-30")).toBe("2026-10-30");
  });
});

describe("rates", () => {
  it("uses the rate in effect on the actual work date", () => {
    const d = base();
    expect(rateOn(d.rates, "c1", "2026-10-20")).toBe(2300);
    expect(rateOn(d.rates, "c1", "2026-10-21")).toBe(2500);
    expect(rateOn(d.rates, "c1", "2025-12-31")).toBeNull();
  });

  it("rounds once per rate segment, half up", () => {
    expect(payForMinutes(1755, 4250)).toBe(124313);
    expect(parseDollars("$1,234.5")).toBe(123450);
    expect(parseDollars("0.1")).toBe(10);
    expect(parseDollars("1.234")).toBeNull();
  });
});

describe("approved time ingestion", () => {
  it("re-delivery of the same entries changes nothing", () => {
    const first = ingestApprovedTime(base(), week, TODAY, ids());
    expect(first.added).toBe(4);
    const second = ingestApprovedTime(first.data, week, TODAY, ids());
    expect(second.added).toBe(0);
    expect(second.duplicates).toBe(4);
    expect(totalOutstanding(whatsDue(second.data, TODAY))).toBe(totalOutstanding(whatsDue(first.data, TODAY)));
  });

  it("unmapped records become exceptions and never enter payroll", () => {
    const r = ingestApprovedTime(base(), [rec("x1", "2026-10-19", 60, { wepmProjectId: "nope" }), rec("x2", "2026-10-19", 60, { approvedAt: undefined })], TODAY, ids());
    expect(r.added).toBe(0);
    expect(r.exceptions).toBe(2);
    expect(computeDraftPayrolls(r.data, TODAY)).toHaveLength(0);
  });
});

describe("payroll lifecycle", () => {
  it("calculates pay across a rate change; nonbillable time is still paid", () => {
    const { data } = ingestApprovedTime(base(), week, TODAY, ids());
    const [draft] = computeDraftPayrolls(data, TODAY);
    // 16h × $23 + 16h × $25
    expect(draft.knownAmountCents).toBe(16 * 2300 + 16 * 2500);
    expect(draft.lines.map((l) => l.hourlyRateCents)).toEqual([2300, 2500]);
  });

  it("finalizing changes readiness only; payment reduces the outstanding balance", () => {
    const { data } = ingestApprovedTime(base(), [rec("e1", "2026-10-19", 720)], TODAY, ids()); // 12h × $23 = $276
    const before = whatsDue(data, TODAY);
    expect(before[0].status).toBe("needs_finalization");
    const fin = finalizePayroll(data, draftKey("c1", "2026-10-19"), TODAY, ids());
    const after = whatsDue(fin.data, TODAY);
    expect(after[0].status).toBe("ready");
    expect(totalOutstanding(after)).toBe(totalOutstanding(before));
    const paid = recordPayment(fin.data, { contractorId: "c1", paidOn: TODAY, method: "venmo", allocations: [{ obligation: { kind: "payroll", id: fin.payroll.id }, amountCents: 27600 }] }, TODAY, ids());
    expect(whatsDue(paid.data, TODAY)).toHaveLength(0);
  });

  it("paying an old period after a raise keeps its original pay", () => {
    let { data } = ingestApprovedTime(base(), [rec("e1", "2026-10-13", 600)], TODAY, ids());
    const fin = finalizePayroll(data, draftKey("c1", "2026-10-12"), "2026-10-20", ids());
    data = { ...fin.data, rates: [...fin.data.rates, { id: "r3", contractorId: "c1", effectiveDate: "2026-10-01", hourlyRateCents: 9900 }] };
    expect(outstandingFor(data, { kind: "payroll", id: fin.payroll.id })).toBe(23000);
  });

  it("a finalized entry cannot be included in a second payroll; late hours form a new record", () => {
    let { data } = ingestApprovedTime(base(), week, TODAY, ids());
    data = finalizePayroll(data, draftKey("c1", "2026-10-19"), TODAY, ids()).data;
    expect(computeDraftPayrolls(data, TODAY)).toHaveLength(0);
    expect(() => finalizePayroll(data, draftKey("c1", "2026-10-19"), TODAY, ids())).toThrow();
    data = ingestApprovedTime(data, [rec("late", "2026-10-25", 120, { approvedAt: "2026-10-30" })], TODAY, ids()).data;
    const [late] = computeDraftPayrolls(data, TODAY);
    expect(late.lateApproved).toBe(true);
    expect(late.dueDate).toBe("2026-11-06");
    expect(late.knownAmountCents).toBe(5000);
    expect(data.payrolls[0].amountCents).toBe(16 * 2300 + 16 * 2500);
  });

  it("partial payment leaves the remainder visible, then the remainder closes it", () => {
    let { data } = ingestApprovedTime(base(), [rec("e1", "2026-10-19", 720)], TODAY, ids());
    const fin = finalizePayroll(data, draftKey("c1", "2026-10-19"), TODAY, ids());
    const ref = { kind: "payroll" as const, id: fin.payroll.id };
    data = recordPayment(fin.data, { contractorId: "c1", paidOn: TODAY, method: "venmo", allocations: [{ obligation: ref, amountCents: 20000 }] }, TODAY, ids()).data;
    expect(whatsDue(data, TODAY)[0].outstandingCents).toBe(7600);
    expect(whatsDue(data, TODAY)[0].status).toBe("partially_paid");
    expect(() => recordPayment(data, { contractorId: "c1", paidOn: TODAY, method: "venmo", allocations: [{ obligation: ref, amountCents: 7601 }] }, TODAY, ids())).toThrow();
    data = recordPayment(data, { contractorId: "c1", paidOn: TODAY, method: "venmo", allocations: [{ obligation: ref, amountCents: 7600 }] }, TODAY, ids()).data;
    expect(whatsDue(data, TODAY)).toHaveLength(0);
    expect(data.payrolls[0].amountCents).toBe(27600); // earnings not duplicated
  });

  it("payroll and bonus paid together stay distinct records", () => {
    let { data } = ingestApprovedTime(base(), [rec("e1", "2026-10-19", 720)], TODAY, ids());
    const fin = finalizePayroll(data, draftKey("c1", "2026-10-19"), TODAY, ids());
    const bon = addAdjustment(fin.data, { contractorId: "c1", kind: "bonus", description: "Bonus", amountCents: 5000 }, TODAY, ids());
    expect(bon.adjustment.dueDate).toBe("2026-11-06");
    data = recordPayment(bon.data, {
      contractorId: "c1", paidOn: TODAY, method: "venmo",
      allocations: [
        { obligation: { kind: "payroll", id: fin.payroll.id }, amountCents: 27600 },
        { obligation: { kind: "bonus", id: bon.adjustment.id }, amountCents: 5000 },
      ],
    }, TODAY, ids()).data;
    expect(data.payments).toHaveLength(1);
    const all = listObligations(data, TODAY);
    expect(all.filter((o) => o.status === "paid").map((o) => o.kind).sort()).toEqual(["bonus", "payroll"]);
  });

  it("drafts cannot be paid; missing rates block finalization", () => {
    const d = base();
    d.rates = [];
    const { data } = ingestApprovedTime(d, [rec("e1", "2026-10-19", 60)], TODAY, ids());
    expect(whatsDue(data, TODAY)[0].status).toBe("missing_rate");
    expect(() => finalizePayroll(data, draftKey("c1", "2026-10-19"), TODAY, ids())).toThrow(/rate/);
  });
});

describe("sample data", () => {
  it("historical imports add hours but no amounts owed; upcoming items are visible by default", () => {
    const data = buildSampleData();
    const due = whatsDue(data, TODAY);
    expect(due.some((o) => o.contractorId === "c_sam")).toBe(false);
    expect(due.some((o) => !o.overdue)).toBe(true);
    expect(due.findIndex((o) => !o.overdue)).toBeGreaterThan(due.findLastIndex((o) => o.overdue));
    // Maya's Oct 19–25: 15h × $23 + 19h × $25
    const maya = due.find((o) => o.contractorId === "c_maya" && o.periodStart === "2026-10-19");
    expect(maya?.amountCents).toBe(15 * 2300 + 19 * 2500);
  });
});
