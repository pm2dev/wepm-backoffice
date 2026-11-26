import { describe, expect, it } from "vitest";
import { buildSampleData, SAMPLE_BUSINESS_DATE } from "@/lib/data/sample-fixtures";
import { billingBreakdown, uninvoicedEntries, uninvoicedExpenses } from "./billing";
import {
  createInvoiceDraft,
  defaultThroughDate,
  draftForExpense,
  linkableInvoices,
  linkDraft,
  markDraftInvoiced,
  removeDraftLine,
  undoDraftStep,
} from "./invoice-drafts";
import type { IdFactory } from "./payroll";
import { deleteProjectExpense, updateProjectExpense } from "./project-expenses";

const TODAY = SAMPLE_BUSINESS_DATE;
let n = 0;
const ids: IdFactory = (p) => `${p}_d${++n}`;
const nw = (d: ReturnType<typeof buildSampleData>) => billingBreakdown(d).flatMap((c) => c.projects).find((p) => p.project.id === "p_northwind");

describe("invoice drafts", () => {
  it("reserve hours and billable expenses through the date, so nothing is billed twice", () => {
    const before = nw(buildSampleData())!;
    const { data, draft } = createInvoiceDraft(buildSampleData(), { projectId: "p_northwind", throughDate: "2026-10-18" }, TODAY, ids);
    expect(draft.laborLines.every((l) => l.lastWorkDate <= "2026-10-18")).toBe(true);
    expect(draft.expenseLines).toEqual([]); // the flight is Oct 20, after the through date
    // What's left: Oct 19+ hours and the flight.
    const left = nw(data)!;
    expect(left.entries.every((e) => e.workDate > "2026-10-18")).toBe(true);
    expect(left.expenses.map((x) => x.id)).toEqual(["pex_flight"]);
    expect(draft.amountCents + left.knownAmountCents).toBe(before.knownAmountCents);
    expect(() => createInvoiceDraft(data, { projectId: "p_northwind", throughDate: "2026-10-18" }, TODAY, ids)).toThrow(/Nothing to invoice/);
  });

  it("include billable expenses at cost", () => {
    const { data, draft } = createInvoiceDraft(buildSampleData(), { projectId: "p_northwind", throughDate: TODAY }, TODAY, ids);
    expect(draft.expenseLines).toEqual([expect.objectContaining({ expenseId: "pex_flight", amountCents: 41250 })]);
    expect(uninvoicedExpenses(data).some((x) => x.id === "pex_flight")).toBe(false);
    expect(draftForExpense(data, "pex_flight")?.id).toBe(draft.id);
  });

  it("dropping a line returns it to uninvoiced; dropping the last line deletes the draft", () => {
    let { data, draft } = createInvoiceDraft(buildSampleData(), { projectId: "p_northwind", throughDate: TODAY }, TODAY, ids);
    const flight = draft.expenseLines[0];
    data = removeDraftLine(data, draft.id, flight.id);
    draft = data.invoiceDrafts.find((d) => d.id === draft.id)!;
    expect(draft.amountCents).toBe(draft.laborLines.reduce((s, l) => s + l.amountCents, 0));
    expect(uninvoicedExpenses(data).map((x) => x.id)).toContain("pex_flight");
    for (const l of draft.laborLines) data = removeDraftLine(data, draft.id, l.id);
    expect(data.invoiceDrafts.some((d) => d.id === draft.id)).toBe(false);
    expect(uninvoicedEntries(data).filter((e) => e.projectId === "p_northwind").length).toBe(nw(buildSampleData())!.entries.length);
  });

  it("missing rates block a draft", () => {
    expect(() => createInvoiceDraft(buildSampleData(), { projectId: "p_acme", throughDate: TODAY }, TODAY, ids)).toThrow(/Design/);
  });

  it("goes Draft → Invoiced → Linked, and undo steps back to deleted", () => {
    let { data, draft } = createInvoiceDraft(buildSampleData(), { projectId: "p_northwind", throughDate: TODAY }, TODAY, ids);
    expect(() => linkDraft(data, { draftId: draft.id, qbInvoiceId: "1030" })).toThrow(/Mark the draft invoiced/);
    data = markDraftInvoiced(data, { draftId: draft.id, invoicedOn: TODAY, quickbooksInvoiceRef: " INV-2026-040 " });
    expect(() => removeDraftLine(data, draft.id, draft.laborLines[0].id)).toThrow(/Only drafts/);
    // INV-2026-030 is Northwind's and unlinked; Acme's invoices can't be used.
    expect(linkableInvoices(data, "cust_northwind").map((i) => i.qbInvoiceId)).toEqual(["1030"]);
    expect(() => linkDraft(data, { draftId: draft.id, qbInvoiceId: "1028" })).toThrow(/another customer/);
    expect(() => linkDraft(data, { draftId: draft.id, qbInvoiceId: "1032" })).toThrow(/already linked/);
    data = linkDraft(data, { draftId: draft.id, qbInvoiceId: "1030" });
    draft = data.invoiceDrafts.find((d) => d.id === draft.id)!;
    expect(draft).toMatchObject({ status: "linked", qbInvoiceId: "1030", quickbooksInvoiceRef: "INV-2026-040" });
    data = undoDraftStep(data, draft.id);
    expect(data.invoiceDrafts.find((d) => d.id === draft.id)).toMatchObject({ status: "invoiced", qbInvoiceId: undefined });
    data = undoDraftStep(undoDraftStep(data, draft.id), draft.id);
    expect(data.invoiceDrafts.some((d) => d.id === draft.id)).toBe(false);
  });

  it("an expense on a draft can't be deleted or have its amount changed, but its notes can", () => {
    const { data } = createInvoiceDraft(buildSampleData(), { projectId: "p_northwind", throughDate: TODAY }, TODAY, ids);
    const flight = data.projectExpenses.find((x) => x.id === "pex_flight")!;
    const { id: _id, createdOn: _c, ...input } = flight;
    void _id;
    void _c;
    expect(() => deleteProjectExpense(data, flight.id)).toThrow(/invoice draft/);
    expect(() => updateProjectExpense(data, flight.id, { ...input, amountCents: 1 }, TODAY, ids)).toThrow(/invoice draft/);
    expect(updateProjectExpense(data, flight.id, { ...input, notes: "Economy" }, TODAY, ids).expense.notes).toBe("Economy");
  });

  it("sample history: one invoiced week linked to QuickBooks, one waiting to be linked", () => {
    const data = buildSampleData();
    expect(data.invoiceDrafts.map((d) => [d.projectId, d.status, d.quickbooksInvoiceRef])).toEqual([
      ["p_acme", "invoiced", "INV-2026-031"],
      ["p_northwind", "linked", "INV-2026-032"],
    ]);
  });

  it("defaults the through date to the end of the last full period", () => {
    // Thu Nov 26, 2026
    expect(defaultThroughDate("weekly", "2026-11-26")).toBe("2026-11-22");
    expect(defaultThroughDate("weekly", "2026-11-22")).toBe("2026-11-15"); // a Sunday isn't over yet
    expect(defaultThroughDate("monthly", "2026-11-26")).toBe("2026-10-31");
    expect(defaultThroughDate("semimonthly", "2026-11-26")).toBe("2026-11-15");
    expect(defaultThroughDate("semimonthly", "2026-11-10")).toBe("2026-10-31");
  });
});
