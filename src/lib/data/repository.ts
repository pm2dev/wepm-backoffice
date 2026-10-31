import type { ISODate } from "@/lib/domain/dates";
import type { Cents } from "@/lib/domain/money";
import type { RecordPaymentInput } from "@/lib/domain/payroll";
import type { CustomerInput, ProjectInput } from "@/lib/domain/billing";
import type { ContractorInput } from "@/lib/domain/contractors";
import type { ExpenseInput } from "@/lib/domain/expenses";
import type { Adjustment, AdjustmentKind, BackofficeData, Contractor, ContractorRate, FinalizedPayroll, ImportBatch, BillingRecord, Customer, PaymentAccount, PaymentRecord, Project, RecurringExpense } from "@/lib/domain/types";

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
  /** Only available for sample data. Never present on a live repository. */
  resetDemo?: () => Promise<BackofficeData>;
}
