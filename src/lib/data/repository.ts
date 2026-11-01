import type { ISODate } from "@/lib/domain/dates";
import type { Cents } from "@/lib/domain/money";
import type { RecordPaymentInput } from "@/lib/domain/payroll";
import type { Adjustment, AdjustmentKind, BackofficeData, FinalizedPayroll, PaymentRecord } from "@/lib/domain/types";

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
  /** Only available for sample data. Never present on a live repository. */
  resetDemo?: () => Promise<BackofficeData>;
}
