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

export type ProjectStatus = "active" | "on_hold" | "completed";

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  active: "Active",
  on_hold: "On hold",
  completed: "Completed",
};

export type Project = {
  id: string;
  name: string;
  /** null = internal project owned by the business. */
  customerId: string | null;
  /** One setting per project. Nonbillable time is still paid to contractors. */
  billable: boolean;
  /** "hourly" = one rate for every task; "task" = a rate per task. Rates live in `billingRates`. */
  billingMethod: "hourly" | "task";
  billingCadence?: BillingCadence;
  wepmProjectId?: string;
  status: ProjectStatus;
  startDate?: ISODate;
  endDate?: ISODate;
  /** Client projects: lifetime budget in billable dollars (billable hours × billing rate + billable expenses). */
  budgetCents?: Cents;
  /** Client projects: optional lifetime budget in billable minutes. */
  budgetMinutes?: number;
  /** Internal projects: lifetime cost budget. */
  costBudgetCents?: Cents;
};

/**
 * What a customer is charged per hour on a project, from a date (ADR-0003).
 * `task: null` is the project's one hourly rate (hourly method); otherwise the
 * rate for that task (task method). A time entry uses the rate in effect on its work date.
 */
export type BillingRate = {
  id: string;
  projectId: string;
  task: string | null;
  effectiveDate: ISODate;
  rateCents: Cents;
};

/** Billed hours for one task at one rate, preserved on an invoice draft. */
export type InvoiceLaborLine = {
  id: string;
  task: string;
  minutes: number;
  rateCents: Cents;
  amountCents: Cents;
  firstWorkDate: ISODate;
  lastWorkDate: ISODate;
  entryIds: string[];
};

/** A billable project expense on an invoice draft, billed at cost. */
export type InvoiceExpenseLine = { id: string; expenseId: string; date: ISODate; vendor: string; description: string; amountCents: Cents };

export type InvoiceDraftStatus = "draft" | "invoiced" | "linked";

/**
 * What Backoffice prepares for one project's invoice (ADR-0002): uninvoiced
 * billable hours and billable expenses up to a through date. Draft → Invoiced
 * (created in QuickBooks) → Linked (matched to the synced QuickBooks invoice).
 * Items on any draft are reserved so they can't be billed twice.
 */
export type InvoiceDraft = {
  id: string;
  projectId: string;
  customerId: string;
  throughDate: ISODate;
  status: InvoiceDraftStatus;
  createdOn: ISODate;
  laborLines: InvoiceLaborLine[];
  expenseLines: InvoiceExpenseLine[];
  amountCents: Cents;
  invoicedOn?: ISODate;
  /** QuickBooks invoice number the owner typed, or the linked invoice's DocNumber. */
  quickbooksInvoiceRef?: string;
  /** QuickBooks Invoice.Id once linked. */
  qbInvoiceId?: string;
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

/** `fixed_fee`: owed for fixed-fee work entered as a Contractor services expense. Counts as earnings. */
export type AdjustmentKind = "bonus" | "reimbursement" | "fixed_fee";

export type Adjustment = {
  id: string;
  contractorId: string;
  kind: AdjustmentKind;
  description: string;
  amountCents: Cents;
  createdOn: ISODate;
  dueDate: ISODate;
  /** Set when the amount owed comes from a contractor-paid project expense. */
  projectExpenseId?: string;
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

export type ExpenseCategory = "software" | "hardware" | "travel" | "contractor_services" | "other";

/**
 * Who paid for a project expense: one of the owner's cards or accounts, or a
 * contractor (who is then owed it: a reimbursement, or a fixed fee for
 * Contractor services).
 */
export type ExpensePayer = { kind: "account"; accountId: string } | { kind: "contractor"; contractorId: string };

/**
 * A one-off cost tied to one project, or to the company (overhead) when
 * `projectId` is null. Never split across projects. Billable expenses are
 * passed to the customer at cost.
 */
export type ProjectExpense = {
  id: string;
  date: ISODate;
  vendor: string;
  description: string;
  amountCents: Cents;
  category: ExpenseCategory;
  projectId: string | null;
  billable: boolean;
  paidBy: ExpensePayer;
  /** A link to the receipt (e.g. Google Drive). File uploads aren't supported yet. */
  receiptUrl?: string;
  notes?: string;
  createdOn: ISODate;
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
  schemaVersion: 11;
  contractors: Contractor[];
  rates: ContractorRate[];
  projects: Project[];
  billingRates: BillingRate[];
  timeEntries: TimeEntry[];
  timeExceptions: TimeException[];
  payrolls: FinalizedPayroll[];
  adjustments: Adjustment[];
  payments: PaymentRecord[];
  importBatches: ImportBatch[];
  paymentAccounts: PaymentAccount[];
  expenses: RecurringExpense[];
  expenseCharges: ExpenseCharge[];
  projectExpenses: ProjectExpense[];
  customers: Customer[];
  invoiceDrafts: InvoiceDraft[];
  invoiceReceipts: InvoiceReceipt[];
  quickbooksInvoices: QuickBooksInvoice[];
  integrations: IntegrationSettings;
};
