import { describe, expect, it } from "vitest";
import { buildSampleData, SAMPLE_BUSINESS_DATE } from "@/lib/data/sample-fixtures";
import { listCharges } from "./expenses";
import { budgetUse, companyFinancials, customerFinancials, presetRange, projectFinancials } from "./financials";
import { payForMinutes } from "./money";
import { rateOn } from "./rates";

const TODAY = SAMPLE_BUSINESS_DATE;
const FIRST_WEEK = { from: "2026-10-05", to: "2026-10-11" };

describe("project financials", () => {
  it("earned revenue for the invoiced week equals the invoice draft", () => {
    const data = buildSampleData();
    const f = projectFinancials(data, "p_northwind", TODAY, FIRST_WEEK);
    const draft = data.invoiceDrafts.find((d) => d.projectId === "p_northwind")!;
    expect(f.revenue!.earnedCents).toBe(draft.amountCents);
    expect(f.revenue!.earnedCents).toBe(28 * 14000);
  });

  it("labor cost is every approved hour at the contractor's rate on the work date", () => {
    const data = buildSampleData();
    const f = projectFinancials(data, "p_northwind", TODAY, FIRST_WEEK);
    const byKey = new Map<string, number>();
    for (const e of data.timeEntries.filter((e) => e.projectId === "p_northwind" && e.approvedAt && e.workDate >= FIRST_WEEK.from && e.workDate <= FIRST_WEEK.to)) {
      const k = `${e.contractorId}|${rateOn(data.rates, e.contractorId, e.workDate)}`;
      byKey.set(k, (byKey.get(k) ?? 0) + e.minutes);
    }
    const expected = [...byKey].reduce((s, [k, m]) => s + payForMinutes(m, Number(k.split("|")[1])), 0);
    expect(f.cost.laborCents).toBe(expected);
    expect(f.cost.laborMinutes).toBe(28 * 60);
  });

  it("costs include project expenses (billable or not) and tagged recurring charges; billable expenses are also revenue", () => {
    const data = buildSampleData();
    const f = projectFinancials(data, "p_acme", TODAY);
    // Test iPhone + App Store fee + Priya's fixed fee.
    expect(f.cost.projectExpenseCents).toBe(79900 + 9900 + 60000);
    const figma = listCharges(data, TODAY).filter((c) => c.expenseId === "exp_figma");
    expect(f.cost.recurringCents).toBe(figma.reduce((s, c) => s + c.amountCents, 0));
    expect(f.revenue!.earnedExpenseCents).toBe(9900);
    expect(f.marginCents).toBe(f.revenue!.earnedCents - f.cost.totalCents);
  });

  it("hours without a billing or cost rate are listed, never valued at $0", () => {
    const f = projectFinancials(buildSampleData(), "p_acme", TODAY);
    expect(f.missingBillingRates.map((m) => m.task)).toEqual(["Design"]);
    expect(f.missingBillingRates[0].minutes).toBeGreaterThan(0);
    expect(f.missingCostRates.some((m) => m.contractorId === "c_priya")).toBe(true);
  });

  it("internal projects have cost only", () => {
    const f = projectFinancials(buildSampleData(), "p_internal", TODAY);
    expect(f.revenue).toBeNull();
    expect(f.marginCents).toBeNull();
    expect(f.cost.laborCents).toBeGreaterThan(0);
  });

  it("invoiced and collected come from drafts and linked QuickBooks invoices", () => {
    const data = buildSampleData();
    const nw = projectFinancials(data, "p_northwind", TODAY).revenue!;
    expect(nw.invoicedCents).toBe(392000);
    expect(nw.collectedCents).toBe(392000); // INV-2026-032 is paid
    const acme = projectFinancials(data, "p_acme", TODAY).revenue!;
    expect(acme.invoicedCents).toBe(data.invoiceDrafts.find((d) => d.projectId === "p_acme")!.amountCents);
    expect(acme.collectedCents).toBe(0); // not linked yet
  });

  it("a date range filters hours by work date and expenses by date; future charges aren't costs", () => {
    const data = buildSampleData();
    const oct = projectFinancials(data, "p_acme", TODAY, { from: "2026-10-01", to: "2026-10-31" });
    const nov = projectFinancials(data, "p_acme", TODAY, { from: "2026-11-01", to: "2026-11-30" });
    expect(oct.cost.projectExpenseCents).toBe(79900 + 9900 + 60000);
    expect(nov.cost.laborMinutes).toBe(0);
    expect(nov.cost.projectExpenseCents).toBe(0);
    const decCharges = projectFinancials(data, "p_acme", TODAY, { from: "2026-12-01", to: "2026-12-31" });
    expect(decCharges.cost.recurringCents).toBe(0);
  });

  it("budget use: billable value and hours for client projects, cost for internal ones", () => {
    const data = buildSampleData();
    const nw = budgetUse(data, "p_northwind", TODAY)!;
    expect(nw).toMatchObject({ kind: "billable", budgetCents: 4200000, budgetMinutes: 18000 });
    expect(nw.usedCents).toBe(projectFinancials(data, "p_northwind", TODAY).revenue!.earnedCents);
    expect(budgetUse(data, "p_internal", TODAY)).toMatchObject({ kind: "cost", budgetCents: 1500000 });
    expect(budgetUse(data, "p_northwind_disc", TODAY)).toBeNull();
  });

  it("range presets", () => {
    expect(presetRange("this_month", "2026-11-26")).toEqual({ from: "2026-11-01", to: "2026-11-30" });
    expect(presetRange("last_month", "2026-01-15")).toEqual({ from: "2025-12-01", to: "2025-12-31" });
    expect(presetRange("this_year", "2026-11-26")).toEqual({ from: "2026-01-01", to: "2026-12-31" });
    expect(presetRange("lifetime", "2026-11-26")).toBeUndefined();
  });
});

describe("roll-ups", () => {
  it("a customer adds up its projects", () => {
    const data = buildSampleData();
    const c = customerFinancials(data, "cust_northwind", TODAY);
    const parts = ["p_northwind", "p_northwind_disc"].map((id) => projectFinancials(data, id, TODAY));
    expect(c.projects.map((f) => f.project.id).sort()).toEqual(["p_northwind", "p_northwind_disc"]);
    expect(c.totals.earnedCents).toBe(parts.reduce((s, f) => s + f.revenue!.earnedCents, 0));
    expect(c.totals.costCents).toBe(parts.reduce((s, f) => s + f.cost.totalCents, 0));
    expect(c.totals.marginCents).toBe(c.totals.earnedCents - c.totals.costCents);
  });

  it("the company separates client margin, internal investment and overhead", () => {
    const data = buildSampleData();
    const co = companyFinancials(data, TODAY);
    expect(co.client.every((f) => f.isClient)).toBe(true);
    expect(co.internal.map((f) => f.project.id)).toEqual(["p_internal"]);
    expect(co.internalInvestmentCents).toBe(projectFinancials(data, "p_internal", TODAY).cost.totalCents);
    // The office monitor (company expense) and company-level recurring charges.
    expect(co.overhead.some((o) => o.kind === "expense" && o.id === "pex_monitor")).toBe(true);
    const companyCharges = listCharges(data, TODAY).filter((ch) => ch.projectId === null);
    expect(co.overheadCents).toBe(32999 + companyCharges.reduce((s, ch) => s + ch.amountCents, 0));
    expect(co.totalMarginCents).toBe(co.clientTotals.marginCents - co.internalInvestmentCents - co.overheadCents);
  });

  it("everything adds up to every cost in the period", () => {
    const data = buildSampleData();
    const range = { from: "2026-10-01", to: "2026-10-31" };
    const co = companyFinancials(data, TODAY, range);
    const allCost = data.projects.reduce((s, p) => s + projectFinancials(data, p.id, TODAY, range).cost.totalCents, 0) + co.overheadCents;
    expect(co.clientTotals.costCents + co.internalInvestmentCents + co.overheadCents).toBe(allCost);
  });
});
