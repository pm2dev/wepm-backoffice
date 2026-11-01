import type { ISODate } from "./dates";
import type { Cents } from "./money";

export type PaymentMethod = "venmo" | "zelle" | "bank_transfer" | "check" | "other";

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  venmo: "Venmo",
  zelle: "Zelle",
  bank_transfer: "Bank transfer",
  check: "Check",
  other: "Other",
};

/**
 * Pay schedule. Only `weekly` is implemented for Phase 1 (PRD §8 default:
 * Monday–Sunday week, paid a configurable number of days after the period
 * ends). Biweekly / twice-monthly / monthly anchors are open item §19.3.
 */
export type PaySchedule = {
  kind: "weekly";
  /** Days after the period's Sunday that pay is due. 5 = following Friday. */
  payDelayDays: number;
};

export type Contractor = {
  id: string;
  name: string;
  startDate: ISODate;
  endDate?: ISODate;
  email?: string;
  role?: string;
  schedule: PaySchedule;
  preferredMethod: PaymentMethod;
  paymentReference?: string;
  notes?: string;
  /** Source-system identity (wepm.app) — matched explicitly, never by name. */
  wepmUserId?: string;
};

export type ContractorRate = {
  id: string;
  contractorId: string;
  effectiveDate: ISODate;
  hourlyRateCents: Cents;
};

export type Project = {
  id: string;
  name: string;
  customerName?: string;
  billable: boolean;
  wepmProjectId?: string;
};

export type TimeEntrySource = "wepm" | "harvest_import" | "workbook_import";

export type TimeEntry = {
  id: string;
  contractorId: string;
  projectId: string;
  task: string;
  workDate: ISODate;
  /** Source duration preserved in whole minutes. */
  minutes: number;
  source: TimeEntrySource;
  /** Stable identity in the source system; dedupe key with `source`. */
  sourceEntryId: string;
  sourceTimesheetId?: string;
  approvedAt?: ISODate;
  approvedBy?: string;
};

/** Raw record as delivered by Slashbin (shape TBD — PRD §19.1). */
export type IncomingTimeRecord = {
  sourceEntryId: string;
  sourceTimesheetId?: string;
  wepmUserId: string;
  wepmProjectId: string;
  task: string;
  workDate: ISODate;
  minutes: number;
  approvedAt?: ISODate;
  approvedBy?: string;
};

export type TimeException = {
  id: string;
  record: IncomingTimeRecord;
  reason: string;
  receivedOn: ISODate;
};

/** A rate segment preserved at finalization. */
export type PayrollLine = {
  hourlyRateCents: Cents;
  minutes: number;
  amountCents: Cents;
  firstWorkDate: ISODate;
  lastWorkDate: ISODate;
};

/** A finalized payroll record. Its calculation never changes afterwards. */
export type FinalizedPayroll = {
  id: string;
  contractorId: string;
  periodStart: ISODate;
  periodEnd: ISODate;
  dueDate: ISODate;
  entryIds: string[];
  lines: PayrollLine[];
  amountCents: Cents;
  finalizedOn: ISODate;
  /** True when these hours were approved after the period was first finalized. */
  lateApproved: boolean;
};

export type AdjustmentKind = "bonus" | "reimbursement";

export type Adjustment = {
  id: string;
  contractorId: string;
  kind: AdjustmentKind;
  description: string;
  amountCents: Cents;
  createdOn: ISODate;
  dueDate: ISODate;
};

export type ObligationKind = "payroll" | AdjustmentKind;

export type ObligationRef = { kind: ObligationKind; id: string };

export type PaymentAllocation = {
  obligation: ObligationRef;
  amountCents: Cents;
};

export type PaymentRecord = {
  id: string;
  contractorId: string;
  paidOn: ISODate;
  method: PaymentMethod;
  note?: string;
  allocations: PaymentAllocation[];
  recordedOn: ISODate;
};

export type BackofficeData = {
  schemaVersion: 1;
  contractors: Contractor[];
  rates: ContractorRate[];
  projects: Project[];
  timeEntries: TimeEntry[];
  timeExceptions: TimeException[];
  payrolls: FinalizedPayroll[];
  adjustments: Adjustment[];
  payments: PaymentRecord[];
};
