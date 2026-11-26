import { describe, expect, it } from "vitest";
import { buildSampleData, SAMPLE_BUSINESS_DATE } from "@/lib/data/sample-fixtures";
import { FormError } from "./billing";
import { contractorStats } from "./contractors";
import { listObligations, recordPayment, type IdFactory } from "./payroll";
import { addProjectExpense, deleteProjectExpense, expensesFor, expenseTotals, owedFor, updateProjectExpense, type ProjectExpenseInput } from "./project-expenses";

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
    const added = addProjectExpense(buildSampleData(), iphone, TODAY, ids);
    const expense = added.expense;
    let data = added.data;
    ({ data } = updateProjectExpense(data, expense.id, { ...iphone, amountCents: 89900 }, TODAY, ids));
    const edited = data.projectExpenses.find((x) => x.id === expense.id)!;
    expect(edited).toMatchObject({ amountCents: 89900, createdOn: TODAY });
    data = deleteProjectExpense(data, expense.id);
    expect(data.projectExpenses.some((x) => x.id === expense.id)).toBe(false);
    expect(() => deleteProjectExpense(data, expense.id)).toThrow(/not found/);
  });

  it("totals separate billable from all cost", () => {
    const totals = expenseTotals(expensesFor(buildSampleData(), "p_acme"));
    expect(totals).toEqual({ totalCents: 79900 + 9900 + 60000, billableCents: 9900 });
  });
});

describe("expenses paid by a contractor", () => {
  const byJordan: ProjectExpenseInput = { ...iphone, vendor: "Figma", description: "Design seat", amountCents: 1500, category: "software", paidBy: { kind: "contractor", contractorId: "c_jordan" } };

  it("creates a linked reimbursement due on the contractor's next payday", () => {
    const { data, expense } = addProjectExpense(buildSampleData(), byJordan, TODAY, ids);
    const owed = owedFor(data, expense.id)!;
    expect(owed).toMatchObject({ contractorId: "c_jordan", kind: "reimbursement", amountCents: 1500, projectExpenseId: expense.id, description: "Figma: Design seat · Member portal" });
    expect(owed.dueDate >= TODAY).toBe(true);
    expect(listObligations(data, TODAY).some((o) => o.ref?.id === owed.id && o.outstandingCents === 1500)).toBe(true);
  });

  it("Contractor services is a fixed fee that counts as earnings, not a reimbursement", () => {
    const before = contractorStats(buildSampleData(), "c_jordan", TODAY);
    const { data, expense } = addProjectExpense(buildSampleData(), { ...byJordan, vendor: "Jordan", description: "Icon set", amountCents: 200000, category: "contractor_services" }, TODAY, ids);
    expect(owedFor(data, expense.id)!.kind).toBe("fixed_fee");
    const after = contractorStats(data, "c_jordan", TODAY);
    expect(after.totalEarningsCents - before.totalEarningsCents).toBe(200000);
    expect(after.reimbursementCents).toBe(before.reimbursementCents);
  });

  it("while unpaid, edits follow through: amount, payee and switching to a card", () => {
    let { data, expense } = addProjectExpense(buildSampleData(), byJordan, TODAY, ids);
    ({ data } = updateProjectExpense(data, expense.id, { ...byJordan, amountCents: 2500, paidBy: { kind: "contractor", contractorId: "c_maya" } }, TODAY, ids));
    expect(owedFor(data, expense.id)).toMatchObject({ contractorId: "c_maya", amountCents: 2500 });
    ({ data } = updateProjectExpense(data, expense.id, { ...byJordan, paidBy: { kind: "account", accountId: "acct_amex" } }, TODAY, ids));
    expect(owedFor(data, expense.id)).toBeUndefined();
    ({ data, expense } = updateProjectExpense(data, expense.id, byJordan, TODAY, ids));
    expect(owedFor(data, expense.id)).toMatchObject({ contractorId: "c_jordan", amountCents: 1500 });
  });

  it("after a payment, amount and payee are locked and the expense can't be deleted", () => {
    let { data, expense } = addProjectExpense(buildSampleData(), byJordan, TODAY, ids);
    const owed = owedFor(data, expense.id)!;
    data = recordPayment(data, { contractorId: "c_jordan", paidOn: TODAY, method: "zelle", allocations: [{ obligation: { kind: "reimbursement", id: owed.id }, amountCents: 1000 }] }, TODAY, ids).data;
    expect(() => updateProjectExpense(data, expense.id, { ...byJordan, amountCents: 900 }, TODAY, ids)).toThrow(FormError);
    expect(() => updateProjectExpense(data, expense.id, { ...byJordan, paidBy: { kind: "account", accountId: "acct_amex" } }, TODAY, ids)).toThrow(FormError);
    ({ data, expense } = updateProjectExpense(data, expense.id, { ...byJordan, notes: "Annual seat" }, TODAY, ids));
    expect(expense.notes).toBe("Annual seat");
    expect(() => deleteProjectExpense(data, expense.id)).toThrow(/can't be deleted/);
  });

  it("deleting an unpaid contractor expense removes what's owed", () => {
    const { data, expense } = addProjectExpense(buildSampleData(), byJordan, TODAY, ids);
    const after = deleteProjectExpense(data, expense.id);
    expect(after.adjustments.some((a) => a.projectExpenseId === expense.id)).toBe(false);
  });
});
