import { describe, expect, it } from "vitest";
import { buildSampleData, SAMPLE_BUSINESS_DATE } from "@/lib/data/sample-fixtures";
import { addBillingRate, addCustomer, addProject, billingBreakdown, billingRateOn, FormError, markInvoiced, projectSummary, removeBillingRate, removeBillingRecord, uninvoicedEntries, updateProject } from "./billing";
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
    const base = { name: "X", customerId: null, billable: true, billingMethod: "hourly" as const, status: "active" as const };
    try {
      addProject(buildSampleData(), { ...base, wepmProjectId: "wepm_p_201" }, TODAY, ids);
      throw new Error("expected failure");
    } catch (e) {
      expect(Object.keys((e as FormError).fields).sort()).toEqual(["billable", "wepmProjectId"]);
    }
  });

  it("validates status dates and budgets, and keeps only the budget that fits the project type", () => {
    const client = { name: "Y", customerId: "cust_acme", billable: true, billingMethod: "hourly" as const, status: "active" as const };
    const fields = (input: Parameters<typeof addProject>[1]) => {
      try {
        addProject(buildSampleData(), input, TODAY, ids);
        return [];
      } catch (e) {
        return Object.keys((e as FormError).fields).sort();
      }
    };
    expect(fields({ ...client, startDate: "2026-10-10", endDate: "2026-10-01" })).toEqual(["endDate"]);
    expect(fields({ ...client, startDate: "10/1/2026" })).toEqual(["startDate"]);
    expect(fields({ ...client, budgetCents: 0, budgetMinutes: -60 })).toEqual(["budgetCents", "budgetMinutes"]);
    expect(fields({ ...client, status: "archived" as never })).toEqual(["status"]);

    const { project: c } = addProject(buildSampleData(), { ...client, budgetCents: 500000, budgetMinutes: 600, costBudgetCents: 100 }, TODAY, ids);
    expect(c).toMatchObject({ budgetCents: 500000, budgetMinutes: 600, costBudgetCents: undefined });
    const { project: i } = addProject(buildSampleData(), { ...client, customerId: null, billable: false, budgetCents: 500000, costBudgetCents: 900000 }, TODAY, ids);
    expect(i).toMatchObject({ budgetCents: undefined, budgetMinutes: undefined, costBudgetCents: 900000 });
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

describe("effective-dated billing rates", () => {
  const northwind = (data: ReturnType<typeof buildSampleData>) => data.projects.find((p) => p.id === "p_northwind")!;

  it("values each entry at the rate on its work date and splits the line at the boundary", () => {
    const data = buildSampleData();
    const nw = find(data, "p_northwind")!;
    const before = nw.lines.filter((l) => l.rateCents === 14000);
    const after = nw.lines.filter((l) => l.rateCents === 14500);
    expect(before.length && after.length).toBeTruthy();
    expect(before.every((l) => l.lastWorkDate < "2026-10-19")).toBe(true);
    expect(after.every((l) => l.firstWorkDate >= "2026-10-19")).toBe(true);
    expect(nw.lines.every((l) => l.amountCents === Math.round((l.minutes * l.rateCents!) / 60))).toBe(true);
    expect(nw.knownAmountCents).toBe(nw.lines.reduce((s, l) => s + l.amountCents!, 0));
    expect(billingRateOn(data.billingRates, northwind(data), "anything", "2026-10-18")).toBe(14000);
    expect(billingRateOn(data.billingRates, northwind(data), "anything", "2026-10-19")).toBe(14500);
    expect(billingRateOn(data.billingRates, northwind(data), "anything", "2026-09-13")).toBeNull();
  });

  it("a retroactive rate changes uninvoiced hours from its date only, and never invoiced lines", () => {
    let data = buildSampleData();
    const invoicedBefore = projectSummary(data, "p_northwind").invoicedAmountCents;
    data = addBillingRate(data, { projectId: "p_northwind", task: null, effectiveDate: "2026-10-01", rateCents: 20000 }, ids).data;
    const nw = find(data, "p_northwind")!;
    // Hours from Oct 12 (uninvoiced) now use $200 until the Oct 19 rate takes over.
    expect([...new Set(nw.lines.map((l) => l.rateCents))].sort()).toEqual([14500, 20000]);
    expect(nw.lines.filter((l) => l.rateCents === 20000).every((l) => l.lastWorkDate < "2026-10-19")).toBe(true);
    expect(projectSummary(data, "p_northwind").invoicedAmountCents).toBe(invoicedBefore);
  });

  it("hours before the first rate are missing, never $0, and block marking invoiced", () => {
    let data = buildSampleData();
    data = { ...data, billingRates: data.billingRates.map((r) => (r.id === "brate_nw_1" ? { ...r, effectiveDate: "2026-10-20" } : r)) };
    const nw = find(data, "p_northwind")!;
    expect(nw.complete).toBe(false);
    expect(nw.lines.find((l) => l.rateCents === null)!.amountCents).toBeNull();
    expect(() => markInvoiced(data, { projectId: "p_northwind", invoicedOn: TODAY }, ids)).toThrow(/billing rate/);
  });

  it("validates new rates: one per task per date, greater than $0, billable projects only", () => {
    const data = buildSampleData();
    const fields = (input: Parameters<typeof addBillingRate>[1]) => {
      try {
        addBillingRate(data, input, ids);
        return [];
      } catch (e) {
        return e instanceof FormError ? Object.keys(e.fields).sort() : [(e as Error).message];
      }
    };
    expect(fields({ projectId: "p_northwind", task: null, effectiveDate: "2026-10-19", rateCents: 1 })).toEqual(["effectiveDate"]);
    expect(fields({ projectId: "p_acme", task: " ", effectiveDate: "2026-11-01", rateCents: 0 })).toEqual(["rateCents", "task"]);
    expect(fields({ projectId: "p_internal", task: null, effectiveDate: "2026-11-01", rateCents: 100 })).toEqual(["Only billable customer projects have billing rates."]);
    // Design gets its first rate: the Member portal total becomes complete.
    const next = addBillingRate(data, { projectId: "p_acme", task: "Design", effectiveDate: "2026-08-03", rateCents: 11000 }, ids).data;
    expect(find(next, "p_acme")!.complete).toBe(true);
    const id = next.billingRates.at(-1)!.id;
    expect(find(removeBillingRate(next, id), "p_acme")!.complete).toBe(false);
  });

  it("a new project's starting rates take effect from its start date", () => {
    const { data, project } = addProject(
      buildSampleData(),
      { name: "Z", customerId: "cust_acme", billable: true, billingMethod: "task", status: "active", startDate: "2026-11-02", initialRates: [{ task: "Development", rateCents: 13000 }] },
      TODAY,
      ids,
    );
    expect(data.billingRates.filter((r) => r.projectId === project.id)).toEqual([expect.objectContaining({ task: "Development", effectiveDate: "2026-11-02", rateCents: 13000 })]);
    expect(() => addProject(buildSampleData(), { name: "Q", customerId: null, billable: false, billingMethod: "hourly", status: "active", initialRates: [{ task: null, rateCents: 100 }] }, TODAY, ids)).toThrow(FormError);
  });
});
