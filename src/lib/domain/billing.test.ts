import { describe, expect, it } from "vitest";
import { buildSampleData, SAMPLE_BUSINESS_DATE } from "@/lib/data/sample-fixtures";
import { addCustomer, addProject, billingBreakdown, FormError, markInvoiced, projectSummary, removeBillingRecord, uninvoicedEntries, updateProject } from "./billing";
import { computeDraftPayrolls, type IdFactory } from "./payroll";

const TODAY = SAMPLE_BUSINESS_DATE;
let n = 0;
const ids: IdFactory = (p) => `${p}_b${++n}`;
const find = (data: ReturnType<typeof buildSampleData>, projectId: string) => billingBreakdown(data).flatMap((c) => c.projects).find((p) => p.project.id === projectId);

describe("billing breakdown", () => {
  it("internal work is paid to contractors but never billed", () => {
    const data = buildSampleData();
    expect(uninvoicedEntries(data).some((e) => e.projectId === "p_internal")).toBe(false);
    const mayaDraft = computeDraftPayrolls(data, TODAY).find((d) => d.contractorId === "c_maya" && d.periodStart === "2026-10-19")!;
    expect(mayaDraft.entries.some((e) => e.projectId === "p_internal")).toBe(true);
  });

  it("task rates produce the breakdown without changing contractor pay", () => {
    const data = buildSampleData();
    const before = computeDraftPayrolls(data, TODAY).map((d) => d.knownAmountCents);
    const acme = find(data, "p_acme")!;
    const dev = acme.lines.find((l) => l.task === "Development")!;
    const meetings = acme.lines.find((l) => l.task === "Meetings")!;
    // Uninvoiced Development: Maya 6+8+8+8+2 (Oct 12,13,15,19..21 etc.) — check via rate math rather than hand totals
    expect(dev.amountCents).toBe(Math.round((dev.minutes * 12500) / 60));
    expect(meetings.rateCents).toBe(7500);
    expect(computeDraftPayrolls(data, TODAY).map((d) => d.knownAmountCents)).toEqual(before);
  });

  it("missing task rates are visible and block a complete total — never $0", () => {
    const data = buildSampleData();
    const acme = find(data, "p_acme")!;
    expect(acme.complete).toBe(false);
    expect(acme.missingRateTasks).toEqual(["Design"]);
    expect(acme.lines.find((l) => l.task === "Design")!.amountCents).toBeNull();
    expect(() => markInvoiced(data, { projectId: "p_acme", invoicedOn: TODAY }, ids)).toThrow(/Design/);
  });

  it("marking invoiced excludes those hours next time, without marking anything paid", () => {
    let data = buildSampleData();
    const before = find(data, "p_northwind")!;
    const paymentsBefore = data.payments.length;
    const { data: next, record } = markInvoiced(data, { projectId: "p_northwind", invoicedOn: TODAY, quickbooksInvoiceRef: "INV-9" }, ids);
    data = next;
    expect(record.amountCents).toBe(before.knownAmountCents);
    expect(find(data, "p_northwind")).toBeUndefined();
    expect(data.payments.length).toBe(paymentsBefore);
    expect(computeDraftPayrolls(data, TODAY).length).toBe(computeDraftPayrolls(buildSampleData(), TODAY).length);
    // Undo returns the hours to the recommendation.
    data = removeBillingRecord(data, record.id);
    expect(find(data, "p_northwind")!.knownAmountCents).toBe(before.knownAmountCents);
  });

  it("sample history: the first October week is already invoiced", () => {
    const data = buildSampleData();
    expect(uninvoicedEntries(data).every((e) => e.workDate >= "2026-10-12")).toBe(true);
    expect(projectSummary(data, "p_northwind").invoicedAmountCents).toBe(Math.round((28 * 60 * 14000) / 60));
  });
});

describe("customers and projects", () => {
  it("validates names, internal-not-billable, and unique source IDs", () => {
    expect(() => addCustomer(buildSampleData(), { name: "acme corp (sample)", billingCadence: "monthly" }, ids)).toThrow(FormError);
    const base = { name: "X", customerId: null, billable: true, billingMethod: "hourly" as const, taskRates: {}, active: true };
    try {
      addProject(buildSampleData(), { ...base, wepmProjectId: "wepm_p_201" }, TODAY, ids);
      throw new Error("expected failure");
    } catch (e) {
      expect(Object.keys((e as FormError).fields).sort()).toEqual(["billable", "wepmProjectId"]);
    }
  });

  it("mapping the missing wepm.app project ID resolves the held-back entry into payroll and billing", () => {
    const data = buildSampleData();
    expect(data.timeExceptions).toHaveLength(1);
    const disc = data.projects.find((p) => p.id === "p_northwind_disc")!;
    const jordanBefore = computeDraftPayrolls(data, TODAY).find((d) => d.contractorId === "c_jordan" && d.periodStart === "2026-10-19")!;
    const { data: next } = updateProject(data, disc.id, { ...disc, wepmProjectId: "wepm_p_999" }, TODAY, ids);
    expect(next.timeExceptions).toHaveLength(0);
    const jordanAfter = computeDraftPayrolls(next, TODAY).find((d) => d.contractorId === "c_jordan" && d.periodStart === "2026-10-19")!;
    expect(jordanAfter.totalMinutes - jordanBefore.totalMinutes).toBe(180);
    expect(find(next, "p_northwind_disc")!.knownAmountCents).toBe(3 * 15000);
  });
});
