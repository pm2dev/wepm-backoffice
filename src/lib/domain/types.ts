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

export type BillingCadence = "weekly" | "biweekly" | "semimonthly" | "monthly";

/** Manually maintained customer (PRD §10). */
export type Customer = {
  id: string;
  name: string;
  /** Default billing cadence; a project may override it. Informational for now (PRD §19.5). */
  billingCadence: BillingCadence;
  /** QuickBooks customer identity, for the Slashbin mapping. */
  quickbooksCustomerId?: string;
  notes?: string;
};

export type Project = {
  id: string;
  name: string;
  /** null = internal project owned by the business. */
  customerId: string | null;
  /** One setting per project. Nonbillable time is still paid to contractors. */
  billable: boolean;
  /** "hourly" = one flat rate; "task" = a rate per task. */
  billingMethod: "hourly" | "task";
  hourlyRateCents?: Cents;
  /** Task name → billing rate (task method). */
  taskRates: Record<string, Cents>;
  billingCadence?: BillingCadence;
  wepmProjectId?: string;
  active: boolean;
};

/** A billing line preserved when hours are marked invoiced. */
export type BillingLine = { task: string; minutes: number; rateCents: Cents; amountCents: Cents };

/** Hours the owner marked invoiced after creating the invoice in QuickBooks. */
export type BillingRecord = {
  id: string;
  projectId: string;
  customerId: string;
  entryIds: string[];
  firstWorkDate: ISODate;
  lastWorkDate: ISODate;
  lines: BillingLine[];
  amountCents: Cents;
  invoicedOn: ISODate;
  quickbooksInvoiceRef?: string;
};

export type TimeEntrySource = "wepm" | "harvest_import" | "workbook_import";

export type TimeEntry = {
  id: string;
  contractorId: string;
  /** Backoffice project. Null for historical imports whose project only exists as source text. */
  projectId: string | null;
  task: string;
  workDate: ISODate;
  /**
   * Duration in minutes. Whole minutes for wepm.app; historical imports keep
   * the source's decimal hours exactly (e.g. 1.33 h = 79.8 min) — see `sourceHours`.
   */
  minutes: number;
  source: TimeEntrySource;
  /** Stable identity in the source system; dedupe key with `source`. */
  sourceEntryId: string;
  sourceTimesheetId?: string;
  approvedAt?: ISODate;
  approvedBy?: string;
  /** Historical-import provenance. */
  importBatchId?: string;
  sourceProject?: string;
  sourceClient?: string;
  sourceHours?: string;
  notes?: string;
};

/** One upload of historical hours into a contractor's record. */
export type ImportBatch = {
  id: string;
  contractorId: string;
  fileName: string;
  format: "harvest" | "template";
  importedOn: ISODate;
  rowCount: number;
  importedCount: number;
  skippedInvalid: number;
  skippedDuplicates: number;
  importedMinutes: number;
  firstWorkDate?: ISODate;
  lastWorkDate?: ISODate;
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

// ---------------------------------------------------------------------------
// Bills & subscriptions (PRD §9)
// ---------------------------------------------------------------------------

/** A card or bank account charges are paid from. Never a full card number. */
export type PaymentAccount = {
  id: string;
  kind: "card" | "bank";
  nickname: string;
  /** Cards only, optional. */
  last4?: string;
};

export type ExpenseFrequency = "monthly" | "quarterly" | "annual" | "one_time";

export type RecurringExpense = {
  id: string;
  vendor: string;
  type: "bill" | "subscription";
  /** null = the company; otherwise exactly one project (no splitting). */
  projectId: string | null;
  frequency: ExpenseFrequency;
  /** Anchor due/renewal date; later charges keep its day of month. */
  firstDueDate: ISODate;
  /** Charges before this date come from an earlier version of the schedule and are stored explicitly. */
  scheduleFrom?: ISODate;
  /** Last date a charge may fall on (stopped/cancelled). */
  endDate?: ISODate;
  amountKind: "fixed" | "variable";
  /** Fixed amount, or the planning estimate for variable amounts. */
  amountCents: Cents;
  autopay: boolean;
  accountId: string;
  notes?: string;
  createdOn: ISODate;
};

/**
 * One occurrence of an expense, stored once something is recorded about it
 * (paid, actual amount) or when its schedule changes. Unstored occurrences
 * are generated from the schedule.
 */
export type ExpenseCharge = {
  id: string;
  expenseId: string;
  dueDate: ISODate;
  amountCents: Cents;
  isEstimate: boolean;
  paidOn?: ISODate;
};

/** A manual override recorded by the owner. Never written back to QuickBooks. */
export type ManualMark = { on: ISODate; note?: string };

/** A customer invoice as it exists in QuickBooks (synced via Slashbin). QuickBooks is the source of truth. */
export type QuickBooksInvoice = {
  id: string;
  /** QuickBooks Invoice.Id — sync key. */
  qbInvoiceId: string;
  /** QuickBooks Invoice.DocNumber, e.g. "INV-2026-031". */
  docNumber?: string;
  customerId: string | null;
  qbCustomerId?: string;
  txnDate: ISODate;
  dueDate?: ISODate;
  totalCents: Cents;
  /** Open balance as reported by QuickBooks. */
  balanceCents: Cents;
  lastSyncedOn: ISODate;
  /** QuickBooks MetaData.LastUpdatedTime of the stored version (older deliveries are ignored). */
  qbLastUpdated?: string;
  /** Owner marked it paid/settled in Backoffice (e.g. QuickBooks not updated yet). */
  manuallyPaid?: ManualMark;
  /** Prototype-only records are labeled as such. */
  sample?: boolean;
};

export type PaymentApplication = { qbInvoiceId: string; amountCents: Cents };

/** A customer payment received in QuickBooks (synced via Slashbin). */
export type InvoiceReceipt = {
  id: string;
  /** QuickBooks Payment.Id — dedupe key. */
  externalPaymentId: string;
  customerId: string | null;
  quickbooksCustomerId?: string;
  /** Invoice number(s) the payment was applied to, for display. */
  invoiceRef?: string;
  appliedTo?: PaymentApplication[];
  unappliedCents?: Cents;
  /** QuickBooks MetaData.LastUpdatedTime of the stored version. */
  qbLastUpdated?: string;
  /** QuickBooks Payment.PaymentRefNum (check #, ACH reference…). */
  paymentRef?: string;
  amountCents: Cents;
  receivedOn: ISODate;
  /** The owner has finished handling this payment (allocated it per the suggestions). */
  done?: ManualMark;
  /** Prototype-only receipts entered by hand are labeled as such. */
  simulated?: boolean;
  /** Part of the sample data set. */
  sample?: boolean;
};

/** Owner-editable integration settings. Secrets never live here — they stay on the server. */
export type IntegrationSettings = {
  /** QuickBooks company ID (realmId); webhooks for any other company are ignored. */
  quickbooksRealmId?: string;
};

export type BackofficeData = {
  schemaVersion: 7;
  contractors: Contractor[];
  rates: ContractorRate[];
  projects: Project[];
  timeEntries: TimeEntry[];
  timeExceptions: TimeException[];
  payrolls: FinalizedPayroll[];
  adjustments: Adjustment[];
  payments: PaymentRecord[];
  importBatches: ImportBatch[];
  paymentAccounts: PaymentAccount[];
  expenses: RecurringExpense[];
  expenseCharges: ExpenseCharge[];
  customers: Customer[];
  billingRecords: BillingRecord[];
  invoiceReceipts: InvoiceReceipt[];
  quickbooksInvoices: QuickBooksInvoice[];
  integrations: IntegrationSettings;
};
