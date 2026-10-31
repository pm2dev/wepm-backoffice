/**
 * SAMPLE DATA — fictional contractors, projects and hours used only for the
 * frontend prototype. Kept separate from page components and from any
 * production data. Built through the real domain functions so finalized
 * records and payments are internally consistent.
 */
import { listCharges, setChargeAmount, setChargesPaid } from "@/lib/domain/expenses";
import { finalizePayroll, recordPayment, draftKey, addAdjustment, type IdFactory } from "@/lib/domain/payroll";
import type { BackofficeData, TimeEntry, TimeException } from "@/lib/domain/types";

export const SAMPLE_BUSINESS_DATE = "2026-10-31";

function sequentialIds(): IdFactory {
  let n = 0;
  return (prefix) => `${prefix}_s${String(++n).padStart(3, "0")}`;
}

const HISTORICAL_PROJECT_NAMES: Record<string, string> = { p_acme: "Member portal", p_northwind: "Data migration" };
const HISTORICAL_CLIENTS: Record<string, string> = { p_acme: "Acme Corp", p_northwind: "Northwind" };

type EntrySpec = [workDate: string, hours: number, projectId: string, task: string];

function entries(
  contractorId: string,
  timesheetId: string,
  approvedAt: string | undefined,
  specs: EntrySpec[],
  source: TimeEntry["source"] = "wepm",
): TimeEntry[] {
  const historical = source !== "wepm";
  return specs.map(([workDate, hours, projectId, task], i) => ({
    id: `te_${contractorId}_${workDate}_${i}`,
    contractorId,
    // Historical imports keep the source's project text rather than a Backoffice project.
    projectId: historical ? null : projectId,
    task,
    workDate,
    minutes: Math.round(hours * 60),
    source,
    sourceEntryId: `${source}-${contractorId}-${workDate}-${i}`,
    sourceTimesheetId: historical ? undefined : timesheetId,
    approvedAt,
    approvedBy: approvedAt ? "R. Manager" : undefined,
    ...(historical
      ? { importBatchId: timesheetId, sourceProject: HISTORICAL_PROJECT_NAMES[projectId] ?? projectId, sourceClient: HISTORICAL_CLIENTS[projectId], sourceHours: String(hours) }
      : {}),
  }));
}

export function buildSampleData(): BackofficeData {
  const id = sequentialIds();
  let data: BackofficeData = {
    schemaVersion: 3,
    contractors: [
      {
        id: "c_maya",
        name: "Maya Chen",
        startDate: "2025-03-03",
        role: "Front-end developer",
        email: "maya@example.com",
        schedule: { kind: "weekly", payDelayDays: 5 },
        preferredMethod: "venmo",
        paymentReference: "@maya-chen-dev",
        wepmUserId: "wepm_u_101",
      },
      {
        id: "c_jordan",
        name: "Jordan Ellis",
        startDate: "2024-06-03",
        role: "Data engineer",
        email: "jordan@example.com",
        schedule: { kind: "weekly", payDelayDays: 12 },
        preferredMethod: "zelle",
        paymentReference: "jordan@example.com",
        notes: "Paid the second Friday after the week ends.",
        wepmUserId: "wepm_u_102",
      },
      {
        id: "c_priya",
        name: "Priya Nair",
        startDate: "2026-10-19",
        role: "UX designer",
        schedule: { kind: "weekly", payDelayDays: 5 },
        preferredMethod: "venmo",
        wepmUserId: "wepm_u_103",
      },
      {
        id: "c_sam",
        name: "Sam Okafor",
        startDate: "2023-09-11",
        endDate: "2026-08-28",
        schedule: { kind: "weekly", payDelayDays: 5 },
        preferredMethod: "zelle",
        wepmUserId: "wepm_u_090",
      },
    ],
    rates: [
      { id: "rate_maya_1", contractorId: "c_maya", effectiveDate: "2025-03-03", hourlyRateCents: 2300 },
      { id: "rate_maya_2", contractorId: "c_maya", effectiveDate: "2026-10-21", hourlyRateCents: 2500 },
      { id: "rate_jordan_1", contractorId: "c_jordan", effectiveDate: "2024-06-03", hourlyRateCents: 4000 },
      { id: "rate_jordan_2", contractorId: "c_jordan", effectiveDate: "2026-01-05", hourlyRateCents: 4250 },
      { id: "rate_sam_1", contractorId: "c_sam", effectiveDate: "2024-01-01", hourlyRateCents: 3000 },
      // Priya intentionally has no rate yet — demonstrates the missing-rate state.
    ],
    projects: [
      { id: "p_acme", name: "Member portal", customerName: "Acme Corp (sample)", billable: true, wepmProjectId: "wepm_p_201" },
      { id: "p_northwind", name: "Data migration", customerName: "Northwind (sample)", billable: true, wepmProjectId: "wepm_p_202" },
      { id: "p_internal", name: "Internal operations", billable: false, wepmProjectId: "wepm_p_200" },
    ],
    timeEntries: [
      // Maya — Oct 5–11 and Oct 12–18 (finalized below), Oct 19–25 crosses her Oct 21 raise
      ...entries("c_maya", "wepm_ts_m1005", "2026-10-12", [
        ["2026-10-05", 8, "p_acme", "Development"],
        ["2026-10-06", 8, "p_acme", "Development"],
        ["2026-10-07", 6, "p_acme", "Meetings"],
        ["2026-10-08", 8, "p_acme", "Development"],
        ["2026-10-09", 5, "p_internal", "Admin"],
      ]),
      ...entries("c_maya", "wepm_ts_m1012", "2026-10-19", [
        ["2026-10-12", 6, "p_acme", "Development"],
        ["2026-10-13", 8, "p_acme", "Development"],
        ["2026-10-14", 7.5, "p_acme", "Design"],
        ["2026-10-15", 8, "p_acme", "Development"],
        ["2026-10-16", 6.5, "p_acme", "Meetings"],
      ]),
      ...entries("c_maya", "wepm_ts_m1019", "2026-10-26", [
        ["2026-10-19", 8, "p_acme", "Development"],
        ["2026-10-20", 7, "p_acme", "Development"],
        ["2026-10-21", 8, "p_acme", "Development"],
        ["2026-10-22", 6, "p_acme", "Meetings"],
        ["2026-10-23", 5, "p_internal", "Admin"],
      ]),
      // Jordan
      ...entries("c_jordan", "wepm_ts_j1005", "2026-10-12", [
        ["2026-10-05", 7, "p_northwind", "Development"],
        ["2026-10-06", 7, "p_northwind", "Development"],
        ["2026-10-07", 7, "p_northwind", "Development"],
        ["2026-10-08", 7, "p_northwind", "Meetings"],
      ]),
      ...entries("c_jordan", "wepm_ts_j1012", "2026-10-19", [
        ["2026-10-12", 6, "p_northwind", "Development"],
        ["2026-10-13", 6, "p_northwind", "Development"],
        ["2026-10-14", 6, "p_northwind", "Development"],
        ["2026-10-15", 6, "p_northwind", "Meetings"],
        ["2026-10-16", 6, "p_northwind", "Development"],
      ]),
      ...entries("c_jordan", "wepm_ts_j1019", "2026-10-27", [
        ["2026-10-19", 8, "p_northwind", "Development"],
        ["2026-10-20", 8, "p_northwind", "Development"],
        ["2026-10-21", 6, "p_internal", "Admin"],
        ["2026-10-22", 7.25, "p_northwind", "Development"],
      ]),
      // Priya — new, no rate on file yet
      ...entries("c_priya", "wepm_ts_p1019", "2026-10-26", [
        ["2026-10-20", 4, "p_acme", "Design"],
        ["2026-10-21", 6, "p_acme", "Design"],
        ["2026-10-22", 5, "p_acme", "Meetings"],
      ]),
      // Historical Harvest imports — recorded hours only; never create amounts owed.
      ...entries("c_maya", "harvest_2025_03", undefined, [
        ["2025-03-04", 6, "p_acme", "Development"],
        ["2025-03-05", 7, "p_acme", "Development"],
      ], "harvest_import"),
      ...entries("c_sam", "harvest_2026_08", undefined, [
        ["2026-08-24", 8, "p_northwind", "Development"],
        ["2026-08-25", 8, "p_northwind", "Development"],
      ], "harvest_import"),
    ],
    timeExceptions: [],
    payrolls: [],
    adjustments: [],
    payments: [],
    importBatches: [
      { id: "harvest_2025_03", contractorId: "c_maya", fileName: "maya-harvest-2025-03.csv", format: "harvest", importedOn: "2026-10-10", rowCount: 2, importedCount: 2, skippedInvalid: 0, skippedDuplicates: 0, importedMinutes: 13 * 60, firstWorkDate: "2025-03-04", lastWorkDate: "2025-03-05" },
      { id: "harvest_2026_08", contractorId: "c_sam", fileName: "sam-harvest-aug-2026.csv", format: "harvest", importedOn: "2026-10-10", rowCount: 2, importedCount: 2, skippedInvalid: 0, skippedDuplicates: 0, importedMinutes: 16 * 60, firstWorkDate: "2026-08-24", lastWorkDate: "2026-08-25" },
    ],
    paymentAccounts: [
      { id: "acct_chase", kind: "card", nickname: "Chase business card", last4: "1234" },
      { id: "acct_amex", kind: "card", nickname: "Amex Blue Business", last4: "3005" },
      { id: "acct_checking", kind: "bank", nickname: "Business checking" },
    ],
    expenses: [
      { id: "exp_gws", vendor: "Google Workspace", type: "subscription", projectId: null, frequency: "monthly", firstDueDate: "2026-05-05", amountKind: "fixed", amountCents: 3600, autopay: true, accountId: "acct_chase", createdOn: "2026-05-01" },
      { id: "exp_figma", vendor: "Figma", type: "subscription", projectId: "p_acme", frequency: "monthly", firstDueDate: "2026-06-12", amountKind: "fixed", amountCents: 4500, autopay: true, accountId: "acct_chase", notes: "Two editor seats for the member portal.", createdOn: "2026-06-10" },
      { id: "exp_adobe", vendor: "Adobe Creative Cloud", type: "subscription", projectId: null, frequency: "annual", firstDueDate: "2025-11-20", amountKind: "fixed", amountCents: 65988, autopay: true, accountId: "acct_amex", createdOn: "2025-11-01" },
      { id: "exp_aws", vendor: "AWS", type: "bill", projectId: "p_northwind", frequency: "monthly", firstDueDate: "2026-06-03", amountKind: "variable", amountCents: 12000, autopay: true, accountId: "acct_amex", notes: "Usage-based; estimate is a recent average.", createdOn: "2026-06-01" },
      { id: "exp_internet", vendor: "Office internet", type: "bill", projectId: null, frequency: "monthly", firstDueDate: "2026-06-15", amountKind: "variable", amountCents: 8500, autopay: false, accountId: "acct_checking", createdOn: "2026-06-01" },
      { id: "exp_insurance", vendor: "Business liability insurance", type: "bill", projectId: null, frequency: "quarterly", firstDueDate: "2026-01-10", amountKind: "fixed", amountCents: 31000, autopay: false, accountId: "acct_checking", createdOn: "2026-01-02" },
      { id: "exp_domain", vendor: "wepmlabs.com renewal", type: "bill", projectId: null, frequency: "one_time", firstDueDate: "2026-11-08", amountKind: "fixed", amountCents: 1999, autopay: false, accountId: "acct_chase", createdOn: "2026-10-01" },
      { id: "exp_notion", vendor: "Notion", type: "subscription", projectId: null, frequency: "monthly", firstDueDate: "2026-05-20", endDate: "2026-09-30", amountKind: "fixed", amountCents: 2000, autopay: true, accountId: "acct_chase", notes: "Cancelled in September.", createdOn: "2026-05-15" },
    ],
    expenseCharges: [],
  };

  // Bills: everything through September verified paid, plus some October items.
  const actuals: [string, number][] = [
    ["exp_aws~2026-06-03", 11842], ["exp_aws~2026-07-03", 12510], ["exp_aws~2026-08-03", 11977], ["exp_aws~2026-09-03", 12230], ["exp_aws~2026-10-03", 13142],
    ["exp_internet~2026-06-15", 8499], ["exp_internet~2026-07-15", 8499], ["exp_internet~2026-08-15", 8499], ["exp_internet~2026-10-15", 9120],
  ];
  for (const [key, cents] of actuals) data = setChargeAmount(data, key, cents, id);
  for (const c of listCharges(data, "2026-09-30")) {
    if (c.key === "exp_internet~2026-09-15") continue; // September internet still unpaid → carryover
    data = setChargesPaid(data, [c.key], c.dueDate, id);
  }
  data = setChargesPaid(data, ["exp_figma~2026-10-12", "exp_aws~2026-10-03", "exp_insurance~2026-10-10"], "2026-10-28", id);
  // Google Workspace (autopay) for October is intentionally left unconfirmed.

  // Finalize and pay earlier weeks as they would have happened.
  const fin = (contractorId: string, start: string, on: string) => {
    data = finalizePayroll(data, draftKey(contractorId, start), on, id).data;
    return data.payrolls[data.payrolls.length - 1];
  };
  const m1 = fin("c_maya", "2026-10-05", "2026-10-14");
  const j1 = fin("c_jordan", "2026-10-05", "2026-10-21");
  const m2 = fin("c_maya", "2026-10-12", "2026-10-21");
  const j2 = fin("c_jordan", "2026-10-12", "2026-10-28");

  const pay = (contractorId: string, paidOn: string, method: "venmo" | "zelle", parts: [string, number][], note?: string) => {
    data = recordPayment(
      data,
      { contractorId, paidOn, method, note, allocations: parts.map(([pid, amt]) => ({ obligation: { kind: "payroll", id: pid }, amountCents: amt })) },
      paidOn,
      id,
    ).data;
  };
  pay("c_maya", "2026-10-16", "venmo", [[m1.id, m1.amountCents]]);
  pay("c_jordan", "2026-10-23", "zelle", [[j1.id, j1.amountCents]]);
  pay("c_maya", "2026-10-23", "venmo", [[m2.id, m2.amountCents]]);
  pay("c_jordan", "2026-10-30", "zelle", [[j2.id, 50000]], "Partial — rest next week");

  // Late-approved: Maya's Saturday Oct 17 hours approved after Oct 12–18 was finalized.
  data = {
    ...data,
    timeEntries: [
      ...data.timeEntries,
      ...entries("c_maya", "wepm_ts_m1012b", "2026-10-29", [["2026-10-17", 2, "p_acme", "Development"]]),
    ],
  };

  data = addAdjustment(data, { contractorId: "c_maya", kind: "bonus", description: "Launch bonus — member portal", amountCents: 5000 }, "2026-10-27", id).data;
  data = addAdjustment(data, { contractorId: "c_jordan", kind: "reimbursement", description: "Figma seat (October)", amountCents: 8420 }, SAMPLE_BUSINESS_DATE, id).data;

  const exception: TimeException = {
    id: "exc_s001",
    record: {
      sourceEntryId: "wepm-e-88412",
      sourceTimesheetId: "wepm_ts_j1019",
      wepmUserId: "wepm_u_102",
      wepmProjectId: "wepm_p_999",
      task: "Discovery",
      workDate: "2026-10-23",
      minutes: 180,
      approvedAt: "2026-10-27",
    },
    reason: "Unknown wepm.app project “wepm_p_999”",
    receivedOn: "2026-10-27",
  };
  data = { ...data, timeExceptions: [exception] };

  return data;
}
