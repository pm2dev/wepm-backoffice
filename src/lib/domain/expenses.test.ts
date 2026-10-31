import { describe, expect, it } from "vitest";
import { buildSampleData, SAMPLE_BUSINESS_DATE } from "@/lib/data/sample-fixtures";
import { addMonthsClamped } from "./dates";
import {
  addExpense,
  addPaymentAccount,
  ExpenseValidationError,
  listCharges,
  monthlySpending,
  monthReview,
  nextChargeDate,
  scheduledDates,
  setChargeAmount,
  setChargesPaid,
  stopExpense,
  updateExpense,
  upcomingCharges,
  type ExpenseInput,
} from "./expenses";
import type { IdFactory } from "./payroll";

const TODAY = SAMPLE_BUSINESS_DATE;
let n = 0;
const ids: IdFactory = (p) => `${p}_e${++n}`;

const sub = (over: Partial<ExpenseInput> = {}): ExpenseInput => ({
  vendor: "Test SaaS",
  type: "subscription",
  projectId: null,
  frequency: "monthly",
  firstDueDate: "2026-09-15",
  amountKind: "fixed",
  amountCents: 1000,
  autopay: true,
  accountId: "acct_chase",
  ...over,
});

describe("schedules", () => {
  it("clamps month-end anchors and supports every frequency", () => {
    expect(addMonthsClamped("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonthsClamped("2026-01-31", 2)).toBe("2026-03-31");
    const base = { id: "x", createdOn: TODAY, ...sub() };
    expect(scheduledDates({ ...base, firstDueDate: "2026-01-31" }, "2026-01-01", "2026-04-30")).toEqual(["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"]);
    expect(scheduledDates({ ...base, frequency: "quarterly", firstDueDate: "2026-01-10" }, "2026-01-01", "2026-12-31")).toEqual(["2026-01-10", "2026-04-10", "2026-07-10", "2026-10-10"]);
    expect(scheduledDates({ ...base, frequency: "annual", firstDueDate: "2025-11-20" }, "2025-01-01", "2027-12-31")).toEqual(["2025-11-20", "2026-11-20", "2027-11-20"]);
    expect(scheduledDates({ ...base, frequency: "one_time", firstDueDate: "2026-11-08" }, "2026-01-01", "2027-12-31")).toEqual(["2026-11-08"]);
    expect(scheduledDates({ ...base, endDate: "2026-10-31" }, "2026-01-01", "2026-12-31")).toEqual(["2026-09-15", "2026-10-15"]);
  });
});

describe("charges", () => {
  it("a recurring subscription creates distinct monthly charges; paying October doesn't pay November", () => {
    let { data } = addExpense(buildSampleData(), sub(), TODAY, ids);
    const id = data.expenses[data.expenses.length - 1].id;
    data = setChargesPaid(data, [`${id}~2026-10-15`], "2026-10-15", ids);
    const charges = listCharges(data, "2026-11-30").filter((c) => c.expenseId === id);
    expect(charges.map((c) => [c.dueDate, c.paid])).toEqual([
      ["2026-09-15", false],
      ["2026-10-15", true],
      ["2026-11-15", false],
    ]);
  });

  it("an autopay charge stays unpaid until confirmed", () => {
    const data = buildSampleData();
    const gws = listCharges(data, "2026-10-31").find((c) => c.key === "exp_gws~2026-10-05")!;
    expect(gws.autopay).toBe(true);
    expect(gws.paid).toBe(false);
  });

  it("filtering by card shows its charges and unpaid carryovers", () => {
    const data = buildSampleData();
    const chase = monthReview(data, "2026-10", "acct_chase");
    expect(chase.current.every((c) => c.accountId === "acct_chase")).toBe(true);
    expect(chase.current.map((c) => c.vendor).sort()).toEqual(["Figma", "Google Workspace"]);
    const checking = monthReview(data, "2026-10", "acct_checking");
    expect(checking.carryover.map((c) => c.key)).toEqual(["exp_internet~2026-09-15"]);
    expect(checking.unpaidCents).toBe(8500 + 9120);
  });

  it("bulk confirmation updates only the selected charges", () => {
    const data = buildSampleData();
    const before = listCharges(data, "2026-11-30");
    const next = setChargesPaid(data, ["exp_gws~2026-10-05", "exp_internet~2026-09-15"], TODAY, ids);
    const after = listCharges(next, "2026-11-30");
    const changed = after.filter((c, i) => c.paid !== before[i].paid).map((c) => c.key).sort();
    expect(changed).toEqual(["exp_gws~2026-10-05", "exp_internet~2026-09-15"]);
  });

  it("replacing an estimate with the actual changes the total once, without a second charge", () => {
    const data = buildSampleData();
    const before = monthReview(data, "2026-11");
    const aws = before.current.find((c) => c.key === "exp_aws~2026-11-03")!;
    expect(aws.isEstimate).toBe(true);
    const next = setChargeAmount(data, aws.key, 14000, ids);
    const after = monthReview(next, "2026-11");
    expect(after.current).toHaveLength(before.current.length);
    expect(after.totalCents - before.totalCents).toBe(14000 - 12000);
    const again = setChargeAmount(next, aws.key, 14000, ids);
    expect(monthReview(again, "2026-11").totalCents).toBe(after.totalCents);
  });

  it("editing future recurrence preserves earlier charges", () => {
    const data = buildSampleData();
    const figma = data.expenses.find((e) => e.id === "exp_figma")!;
    const septBefore = listCharges(data, "2026-09-30").filter((c) => c.expenseId === "exp_figma");
    const { data: next } = updateExpense(data, "exp_figma", { ...figma, amountCents: 9000, firstDueDate: "2026-11-01" }, TODAY, ids);
    const after = listCharges(next, "2026-12-31").filter((c) => c.expenseId === "exp_figma");
    expect(after.filter((c) => c.dueDate <= "2026-09-30").map((c) => [c.dueDate, c.amountCents, c.paid])).toEqual(septBefore.map((c) => [c.dueDate, c.amountCents, c.paid]));
    expect(after.filter((c) => c.dueDate >= TODAY).map((c) => [c.dueDate, c.amountCents])).toEqual([
      ["2026-11-01", 9000],
      ["2026-12-01", 9000],
    ]);
  });

  it("stopping keeps prior charges and ends future ones", () => {
    const data = stopExpense(buildSampleData(), "exp_gws", "2026-11-30");
    expect(nextChargeDate(data.expenses.find((e) => e.id === "exp_gws")!, "2026-12-01")).toBeNull();
    expect(listCharges(data, "2026-10-31").filter((c) => c.expenseId === "exp_gws")).toHaveLength(6);
  });

  it("upcoming and monthly spending", () => {
    const data = buildSampleData();
    const up = upcomingCharges(data, TODAY);
    expect(up.every((c) => !c.paid && c.dueDate >= TODAY)).toBe(true);
    expect(up.map((c) => c.vendor)).toContain("Adobe Creative Cloud");
    const spend = monthlySpending(data, "2026-10");
    expect(spend).toHaveLength(6);
    expect(spend[5].month).toBe("2026-10");
    // October: GWS 36 + Figma 45 + AWS 131.42 + internet 91.20 + insurance 310
    expect(spend[5].totalCents).toBe(3600 + 4500 + 13142 + 9120 + 31000);
  });
});

describe("accounts and validation", () => {
  it("cards keep only a nickname and optional last four", () => {
    expect(() => addPaymentAccount(buildSampleData(), { kind: "card", nickname: "Visa", last4: "4111111111111111" }, ids)).toThrow(/last 4/);
    const { account } = addPaymentAccount(buildSampleData(), { kind: "bank", nickname: "Savings", last4: "9999" }, ids);
    expect(account.last4).toBeUndefined();
  });

  it("requires vendor, date, amount and account", () => {
    try {
      addExpense(buildSampleData(), sub({ vendor: "", accountId: "nope", firstDueDate: "" }), TODAY, ids);
      throw new Error("expected failure");
    } catch (e) {
      expect(e).toBeInstanceOf(ExpenseValidationError);
      expect(Object.keys((e as ExpenseValidationError).fields).sort()).toEqual(["accountId", "firstDueDate", "vendor"]);
    }
  });
});
