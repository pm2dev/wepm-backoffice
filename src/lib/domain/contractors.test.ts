import { describe, expect, it } from "vitest";
import { buildSampleData, SAMPLE_BUSINESS_DATE } from "@/lib/data/sample-fixtures";
import { addContractor, addRate, contractorStats, rateChangeImpact, tenure, updateContractor, ValidationError } from "./contractors";
import { commitImport, parseCsv, parseHours, parseImportDate, previewImport } from "./history-import";
import { computeDraftPayrolls, totalOutstanding, whatsDue, type IdFactory } from "./payroll";

const TODAY = SAMPLE_BUSINESS_DATE;
let n = 0;
const ids: IdFactory = (p) => `${p}_c${++n}`;

const baseInput = { name: "New Person", startDate: "2026-11-02", payDelayDays: 5, preferredMethod: "venmo" as const };

describe("contractor profile", () => {
  it("adds a contractor with an initial rate effective on the start date", () => {
    const r = addContractor(buildSampleData(), { ...baseInput, initialRateCents: 3000 }, ids);
    expect(r.data.rates.find((x) => x.contractorId === r.contractor.id)).toMatchObject({ effectiveDate: "2026-11-02", hourlyRateCents: 3000 });
  });

  it("validates required fields and unique wepm.app IDs", () => {
    try {
      addContractor(buildSampleData(), { ...baseInput, name: " ", wepmUserId: "wepm_u_101" }, ids);
      throw new Error("expected failure");
    } catch (e) {
      expect(e).toBeInstanceOf(ValidationError);
      expect((e as ValidationError).fields).toMatchObject({ name: expect.any(String), wepmUserId: expect.any(String) });
    }
  });

  it("renaming keeps payroll and payments linked", () => {
    const data = buildSampleData();
    const maya = data.contractors.find((c) => c.id === "c_maya")!;
    const before = contractorStats(data, "c_maya", TODAY);
    const { data: next } = updateContractor(data, "c_maya", { ...maya, payDelayDays: 5, name: "Maya Chen-Rivera" });
    expect(next.contractors.find((c) => c.id === "c_maya")!.name).toBe("Maya Chen-Rivera");
    expect(contractorStats(next, "c_maya", TODAY)).toEqual(before);
  });

  it("formats tenure", () => {
    const data = buildSampleData();
    expect(tenure(data.contractors.find((c) => c.id === "c_maya")!, TODAY)).toBe("1 yr 7 mos");
    expect(tenure(data.contractors.find((c) => c.id === "c_priya")!, TODAY)).toBe("13 days");
    expect(tenure(data.contractors.find((c) => c.id === "c_sam")!, TODAY)).toBe("2 yrs 11 mos");
  });
});

describe("rates", () => {
  it("adding Priya's missing rate unblocks her payroll without touching finalized records", () => {
    const data = buildSampleData();
    const finalizedBefore = data.payrolls.map((p) => p.amountCents);
    const impact = rateChangeImpact(data, "c_priya", "2026-10-19", TODAY);
    expect(impact.unfinalizedMinutes).toBe(15 * 60);
    const { data: next } = addRate(data, { contractorId: "c_priya", effectiveDate: "2026-10-19", hourlyRateCents: 3500 }, ids);
    const draft = computeDraftPayrolls(next, TODAY).find((d) => d.contractorId === "c_priya")!;
    expect(draft.missingRateMinutes).toBe(0);
    expect(draft.knownAmountCents).toBe(15 * 3500);
    expect(next.payrolls.map((p) => p.amountCents)).toEqual(finalizedBefore);
  });

  it("a retroactive rate does not change already-finalized pay", () => {
    const data = buildSampleData();
    const { data: next } = addRate(data, { contractorId: "c_maya", effectiveDate: "2026-10-01", hourlyRateCents: 9900 }, ids);
    expect(next.payrolls.filter((p) => p.contractorId === "c_maya").map((p) => p.amountCents)).toEqual(
      data.payrolls.filter((p) => p.contractorId === "c_maya").map((p) => p.amountCents),
    );
  });

  it("rejects duplicate effective dates and non-positive rates", () => {
    expect(() => addRate(buildSampleData(), { contractorId: "c_maya", effectiveDate: "2026-10-21", hourlyRateCents: 2600 }, ids)).toThrow(/already/);
    expect(() => addRate(buildSampleData(), { contractorId: "c_maya", effectiveDate: "2026-12-01", hourlyRateCents: 0 }, ids)).toThrow();
  });
});

describe("lifetime stats", () => {
  it("earnings = hourly + bonuses; reimbursements separate; paid only from recorded payments", () => {
    const data = buildSampleData();
    const s = contractorStats(data, "c_jordan", TODAY);
    expect(s.reimbursementCents).toBe(8420);
    expect(s.totalEarningsCents).toBe(s.hourlyEarningsCents + s.bonusCents);
    // Jordan: Oct 5–11 28h×42.50 + Oct 12–18 30h×42.50 + Oct 19–25 29.25h×42.50
    expect(s.hourlyEarningsCents).toBe(119000 + 127500 + 124313);
    expect(s.totalPaidCents).toBe(119000 + 50000);
  });

  it("historical hours add earnings where a rate is known and flag missing coverage", () => {
    const data = buildSampleData();
    const s = contractorStats(data, "c_sam", TODAY);
    expect(s.historicalMinutes).toBe(16 * 60);
    expect(s.hourlyEarningsCents).toBe(16 * 3000);
    expect(s.totalPaidCents).toBe(0); // earnings with incomplete payment history
    expect(s.outstandingCents).toBe(0);
  });
});

describe("historical import", () => {
  const harvest = [
    '"Date","Client","Project","Project Code","Task","Notes","Hours","Hours Rounded","Billable?","Invoiced?","Approved?","First Name","Last Name"',
    '2024-12-02,Acme Corp,Member portal,,Development,"Build, test",6.5,6.5,Yes,No,Yes,Maya,Chen',
    "12/3/2024,Acme Corp,Member portal,,Meetings,,1.33,1.5,Yes,No,Yes,Maya,Chen",
    '2024-12-02,Acme Corp,Member portal,,Development,"Build, test",6.5,6.5,Yes,No,Yes,Maya,Chen',
    "2024-13-40,Acme Corp,Member portal,,Development,,2,2,Yes,No,Yes,Maya,Chen",
    "2025-03-04,Acme Corp,Member portal,,Development,,6,6,Yes,No,Yes,Maya,Chen",
  ].join("\r\n");

  it("parses CSV, dates and hours exactly", () => {
    expect(parseCsv('a,"b,""c"""\n1,2')).toEqual([["a", 'b,"c"'], ["1", "2"]]);
    expect(parseImportDate("3/4/2025")).toBe("2025-03-04");
    expect(parseImportDate("2025-02-30")).toBeNull();
    expect(parseHours("1.33")).toBeCloseTo(79.8, 10);
    expect(parseHours("1:15")).toBe(75);
    expect(parseHours("abc")).toBeNull();
  });

  it("previews invalid rows, in-file duplicates and matches with existing hours", () => {
    const p = previewImport(buildSampleData(), "c_maya", harvest);
    expect(p.format).toBe("harvest");
    expect(p.counts).toEqual({ total: 5, ok: 2, invalid: 1, duplicate: 2 });
    expect(p.rows[2].duplicateOf).toBe(2); // same as line 2
    expect(p.rows[4].duplicateOf).toBe("existing"); // already in sample harvest data
    // Maya's first rate starts 2025-03-03, so Dec 2024 has no rate
    expect(p.missingRateMinutes).toBeCloseTo(6.5 * 60 + 79.8, 10);
    expect(p.people).toEqual(["Maya Chen"]);
  });

  it("imports hours without creating amounts owed", () => {
    const data = buildSampleData();
    const owedBefore = totalOutstanding(whatsDue(data, TODAY));
    const { data: next, batch } = commitImport(data, { contractorId: "c_maya", fileName: "maya.csv", csvText: harvest }, TODAY, ids);
    expect(batch).toMatchObject({ importedCount: 2, skippedInvalid: 1, skippedDuplicates: 2 });
    expect(totalOutstanding(whatsDue(next, TODAY))).toBe(owedBefore);
    expect(contractorStats(next, "c_maya", TODAY).historicalMinutes).toBeGreaterThan(contractorStats(data, "c_maya", TODAY).historicalMinutes);
    // Re-importing the same file finds everything as duplicates
    const again = previewImport(next, "c_maya", harvest);
    expect(again.counts.ok).toBe(0);
  });

  it("reports missing required columns", () => {
    const p = previewImport(buildSampleData(), "c_maya", "date,hours\n2025-01-01,2");
    expect(p.missingColumns).toEqual(["project", "task"]);
    expect(() => commitImport(buildSampleData(), { contractorId: "c_maya", fileName: "x.csv", csvText: "date,hours\n2025-01-01,2" }, TODAY, ids)).toThrow(/Missing columns/);
  });
});
