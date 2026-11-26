import { describe, expect, it } from "vitest";
import { buildSampleData, SAMPLE_BUSINESS_DATE } from "@/lib/data/sample-fixtures";
import { FormError } from "./billing";
import type { IdFactory } from "./payroll";
import { addProjectExpense, deleteProjectExpense, expensesFor, expenseTotals, updateProjectExpense, type ProjectExpenseInput } from "./project-expenses";

const TODAY = SAMPLE_BUSINESS_DATE;
let n = 0;
const ids: IdFactory = (p) => `${p}_t${++n}`;
const iphone: ProjectExpenseInput = {
  date: "2026-10-30",
  vendor: " Apple ",
  description: " Test iPhone ",
  amountCents: 79900,
  category: "hardware",
  projectId: "p_acme",
  billable: false,
  paidBy: { kind: "account", accountId: "acct_amex" },
};

const fieldsOf = (fn: () => unknown) => {
  try {
    fn();
    return [];
  } catch (e) {
    return Object.keys((e as FormError).fields).sort();
  }
};

describe("project expenses", () => {
  it("records a cost on one project, trimmed, without billing it by default", () => {
    const { data, expense } = addProjectExpense(buildSampleData(), iphone, TODAY, ids);
    expect(expense).toMatchObject({ vendor: "Apple", description: "Test iPhone", billable: false, createdOn: TODAY });
    expect(expensesFor(data, "p_acme")[0].id).toBe(expense.id);
  });

  it("validates date, vendor, amount, account, category and receipt link", () => {
    const data = buildSampleData();
    expect(
      fieldsOf(() =>
        addProjectExpense(data, { ...iphone, date: "", vendor: " ", amountCents: 0, paidBy: { kind: "account", accountId: "nope" }, category: "food" as never, receiptUrl: "javascript:alert(1)" }, TODAY, ids),
      ),
    ).toEqual(["amountCents", "category", "date", "paidBy", "receiptUrl", "vendor"]);
    expect(fieldsOf(() => addProjectExpense(data, { ...iphone, receiptUrl: "https://drive.google.com/x" }, TODAY, ids))).toEqual([]);
  });

  it("bills only on a billable customer project", () => {
    const data = buildSampleData();
    expect(fieldsOf(() => addProjectExpense(data, { ...iphone, projectId: "p_internal", billable: true }, TODAY, ids))).toEqual(["billable"]);
    expect(fieldsOf(() => addProjectExpense(data, { ...iphone, projectId: null, billable: true }, TODAY, ids))).toEqual(["billable"]);
    expect(addProjectExpense(data, { ...iphone, billable: true }, TODAY, ids).expense.billable).toBe(true);
  });

  it("company overhead has no project", () => {
    const { data } = addProjectExpense(buildSampleData(), { ...iphone, projectId: null }, TODAY, ids);
    expect(expensesFor(data, null).some((x) => x.vendor === "Apple" && x.date === "2026-10-30")).toBe(true);
  });

  it("edits keep the id and created date; delete removes it", () => {
    let { data, expense } = addProjectExpense(buildSampleData(), iphone, TODAY, ids);
    ({ data } = updateProjectExpense(data, expense.id, { ...iphone, amountCents: 89900 }));
    const edited = data.projectExpenses.find((x) => x.id === expense.id)!;
    expect(edited).toMatchObject({ amountCents: 89900, createdOn: TODAY });
    data = deleteProjectExpense(data, expense.id);
    expect(data.projectExpenses.some((x) => x.id === expense.id)).toBe(false);
    expect(() => deleteProjectExpense(data, expense.id)).toThrow(/not found/);
  });

  it("totals separate billable from all cost", () => {
    const totals = expenseTotals(expensesFor(buildSampleData(), "p_acme"));
    expect(totals).toEqual({ totalCents: 79900 + 9900, billableCents: 9900 });
  });
});
