import type { CustomerInput, ProjectInput } from "@/lib/domain/billing";
import type { ContractorInput } from "@/lib/domain/contractors";
import type { ISODate } from "@/lib/domain/dates";
import type { ExpenseInput } from "@/lib/domain/expenses";
import type { Cents } from "@/lib/domain/money";
import type { RecordPaymentInput } from "@/lib/domain/payroll";
import type { AdjustmentKind, BackofficeData, PaymentAccount } from "@/lib/domain/types";
import type { OperationArgs, OperationName, OperationResult } from "./operations";

export type RepositoryMode = "sample" | "live";

/**
 * Data-access boundary. Pages talk only to this class. Every change is a named
 * operation (see operations.ts) that runs either in the browser on sample data
 * or on the server against Postgres.
 */
export abstract class BackofficeRepository {
  abstract readonly mode: RepositoryMode;
  /** Development tools (simulate QuickBooks payments, reset data) are available. */
  abstract readonly devTools: boolean;
  abstract load(): Promise<BackofficeData>;
  protected abstract run<K extends OperationName>(op: K, args: OperationArgs<K>): Promise<OperationResult<K>>;

  // Payroll
  finalizePayroll = (key: string, today: ISODate) => this.run("finalizePayroll", { key, today });
  recordPayment = (input: RecordPaymentInput, today: ISODate) => this.run("recordPayment", { input, today });
  addAdjustment = (input: { contractorId: string; kind: AdjustmentKind; description: string; amountCents: Cents }, today: ISODate) => this.run("addAdjustment", { input, today });

  // Contractors
  addContractor = (input: ContractorInput & { initialRateCents?: Cents }, today: ISODate) => this.run("addContractor", { input, today });
  updateContractor = (id: string, input: ContractorInput, today: ISODate) => this.run("updateContractor", { id, input, today });
  addRate = (input: { contractorId: string; effectiveDate: ISODate; hourlyRateCents: Cents }) => this.run("addRate", { input });
  /** Save historical hours. Never creates amounts owed. */
  importHistoricalHours = (input: { contractorId: string; fileName: string; csvText: string; includeDuplicateLines?: number[] }, today: ISODate) =>
    this.run("importHistoricalHours", { input, today });

  // Bills & subscriptions
  addPaymentAccount = (input: { kind: PaymentAccount["kind"]; nickname: string; last4?: string }) => this.run("addPaymentAccount", { input });
  addExpense = (input: ExpenseInput, today: ISODate) => this.run("addExpense", { input, today });
  updateExpense = (id: string, input: ExpenseInput, today: ISODate) => this.run("updateExpense", { id, input, today });
  /** Set or clear (null) the last date an expense may charge. */
  stopExpense = (id: string, endDate: ISODate | null) => this.run("stopExpense", { id, endDate });
  /** Mark selected charges paid on a date, or unpaid (null). */
  setChargesPaid = (keys: string[], paidOn: ISODate | null) => this.run("setChargesPaid", { keys, paidOn });
  setChargeAmount = (key: string, amountCents: Cents) => this.run("setChargeAmount", { key, amountCents });

  // Customers, projects & billing
  addCustomer = (input: CustomerInput) => this.run("addCustomer", { input });
  updateCustomer = (id: string, input: CustomerInput) => this.run("updateCustomer", { id, input });
  addProject = (input: ProjectInput, today: ISODate) => this.run("addProject", { input, today });
  updateProject = (id: string, input: ProjectInput, today: ISODate) => this.run("updateProject", { id, input, today });
  markInvoiced = (input: { projectId: string; through?: ISODate; invoicedOn: ISODate; quickbooksInvoiceRef?: string }) => this.run("markInvoiced", { input });
  removeBillingRecord = (id: string) => this.run("removeBillingRecord", { id });

  // QuickBooks invoices & payments (QuickBooks is the source of truth; data arrives server-side via Slashbin)
  /** Owner override: mark an invoice paid in Backoffice (null clears it). Never written to QuickBooks. */
  setInvoiceManuallyPaid = (invoiceId: string, value: { on: ISODate; note?: string } | null) => this.run("setInvoiceManuallyPaid", { invoiceId, value });
  /** Mark a received payment done/handled (null reopens it). */
  setPaymentDone = (receiptId: string, value: { on: ISODate; note?: string } | null) => this.run("setPaymentDone", { receiptId, value });
  setQuickBooksRealmId = (realmId: string) => this.run("setQuickBooksRealmId", { realmId });

  // Development tools (devTools only)
  simulateQuickBooksPayment = (input: { customerId: string; amountCents: Cents; receivedOn: ISODate; invoiceId?: string; paymentRef?: string }, today: ISODate) =>
    this.run("simulateQuickBooksPayment", { input, today });
  resetToSample = () => this.run("resetToSample", {});
  resetToEmpty = () => this.run("resetToEmpty", {});
}
