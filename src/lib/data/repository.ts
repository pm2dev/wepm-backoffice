import type { ISODate } from "@/lib/domain/dates";
import type { Cents } from "@/lib/domain/money";
import type { RecordPaymentInput } from "@/lib/domain/payroll";
import type { ContractorInput } from "@/lib/domain/contractors";
import type { Adjustment, AdjustmentKind, BackofficeData, Contractor, ContractorRate, FinalizedPayroll, ImportBatch, PaymentRecord } from "@/lib/domain/types";

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
  addContractor(input: ContractorInput & { initialRateCents?: Cents }): Promise<Contractor>;
  updateContractor(id: string, input: ContractorInput): Promise<Contractor>;
  addRate(input: { contractorId: string; effectiveDate: ISODate; hourlyRateCents: Cents }): Promise<ContractorRate>;
  /** Save historical hours. Never creates amounts owed. */
  importHistoricalHours(
    input: { contractorId: string; fileName: string; csvText: string; includeDuplicateLines?: number[] },
    today: ISODate,
  ): Promise<ImportBatch>;
  /** Only available for sample data. Never present on a live repository. */
  resetDemo?: () => Promise<BackofficeData>;
}
