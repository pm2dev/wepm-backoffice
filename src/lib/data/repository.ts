import type { ISODate } from "@/lib/domain/dates";
import type { Cents } from "@/lib/domain/money";
import type { RecordPaymentInput } from "@/lib/domain/payroll";
import type { CustomerInput, ProjectInput } from "@/lib/domain/billing";
import type { ContractorInput } from "@/lib/domain/contractors";
import type { ExpenseInput } from "@/lib/domain/expenses";
import type { SyncResult } from "@/lib/domain/quickbooks-sync";
import type { QboInvoice, QboPayment } from "@/lib/integrations/quickbooks";
import type { Adjustment, AdjustmentKind, BackofficeData, Contractor, ContractorRate, FinalizedPayroll, ImportBatch, BillingRecord, Customer, InvoiceReceipt, PaymentAccount, PaymentRecord, Project, RecurringExpense } from "@/lib/domain/types";

/**
 * Data-access boundary. Pages talk only to this interface. During frontend
 * development it is backed by sample data in the browser; in production it
 * will be backed by authenticated server APIs over PostgreSQL.
 */
export interface BackofficeRepository {
  readonly mode: "sample" | "live";
  load(): Promise<BackofficeData>;
  finalizePayroll(draftKey: string, today: ISODate): Promise<FinalizedPayroll>;
  recordPayment(input: RecordPaymentInput, today: ISODate): Promise<PaymentRecord>;
  addAdjustment(
    input: { contractorId: string; kind: AdjustmentKind; description: string; amountCents: Cents },
    today: ISODate,
  ): Promise<Adjustment>;
  addContractor(input: ContractorInput & { initialRateCents?: Cents }, today: ISODate): Promise<Contractor>;
  updateContractor(id: string, input: ContractorInput, today: ISODate): Promise<Contractor>;
  addRate(input: { contractorId: string; effectiveDate: ISODate; hourlyRateCents: Cents }): Promise<ContractorRate>;
  /** Save historical hours. Never creates amounts owed. */
  importHistoricalHours(
    input: { contractorId: string; fileName: string; csvText: string; includeDuplicateLines?: number[] },
    today: ISODate,
  ): Promise<ImportBatch>;
  // Bills & subscriptions
  addPaymentAccount(input: { kind: PaymentAccount["kind"]; nickname: string; last4?: string }): Promise<PaymentAccount>;
  addExpense(input: ExpenseInput, today: ISODate): Promise<RecurringExpense>;
  updateExpense(id: string, input: ExpenseInput, today: ISODate): Promise<RecurringExpense>;
  /** Set or clear (null) the last date an expense may charge. */
  stopExpense(id: string, endDate: ISODate | null): Promise<void>;
  /** Mark selected charges paid on a date, or unpaid (null). */
  setChargesPaid(chargeKeys: string[], paidOn: ISODate | null): Promise<void>;
  setChargeAmount(chargeKey: string, amountCents: Cents): Promise<void>;
  // Customers, projects & billing
  addCustomer(input: CustomerInput): Promise<Customer>;
  updateCustomer(id: string, input: CustomerInput): Promise<Customer>;
  addProject(input: ProjectInput, today: ISODate): Promise<Project>;
  updateProject(id: string, input: ProjectInput, today: ISODate): Promise<Project>;
  /** After creating the invoice in QuickBooks: mark the project's uninvoiced hours invoiced. */
  markInvoiced(input: { projectId: string; through?: ISODate; invoicedOn: ISODate; quickbooksInvoiceRef?: string }): Promise<BillingRecord>;
  removeBillingRecord(id: string): Promise<void>;
  // QuickBooks invoices & payments (source of truth: QuickBooks via Slashbin)
  /** Apply a batch delivered from QuickBooks. In production this runs server-side from the Slashbin endpoint. */
  syncQuickBooks(batch: { invoices?: QboInvoice[]; payments?: QboPayment[] }, today: ISODate): Promise<SyncResult>;
  /** Owner override: mark an invoice paid in Backoffice (null clears it). Never written to QuickBooks. */
  setInvoiceManuallyPaid(invoiceId: string, value: { on: ISODate; note?: string } | null): Promise<void>;
  /** Mark a received payment done/handled (null reopens it). */
  setPaymentDone(receiptId: string, value: { on: ISODate; note?: string } | null): Promise<void>;
  /** Integration settings (no secrets). */
  setQuickBooksRealmId(realmId: string): Promise<void>;
  /** Prototype only: emulate a QuickBooks payment arriving. */
  simulateQuickBooksPayment?: (input: { customerId: string; amountCents: Cents; receivedOn: ISODate; invoiceId?: string; paymentRef?: string }, today: ISODate) => Promise<InvoiceReceipt>;
  /** Only available for sample data. Never present on a live repository. */
  resetDemo?: () => Promise<BackofficeData>;
}
