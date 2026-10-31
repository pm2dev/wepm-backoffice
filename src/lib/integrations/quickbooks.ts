/**
 * QuickBooks Online → Backoffice mapping.
 *
 * Shapes follow QuickBooks Online's Invoice and Payment entities (Accounting
 * API). Slashbin is a webhook gateway: it relays QuickBooks change notices
 * (see quickbooks-webhooks.ts), and the full entities are then fetched from the
 * Accounting API and mapped here.
 */
import type { ISODate } from "@/lib/domain/dates";
import { isISODate } from "@/lib/domain/dates";
import type { Cents } from "@/lib/domain/money";

/** Subset of a QuickBooks Online Invoice. */
export type QboInvoice = {
  Id: string;
  DocNumber?: string;
  TxnDate: string;
  DueDate?: string;
  TotalAmt: number;
  Balance: number;
  CustomerRef: { value: string; name?: string };
  MetaData?: { LastUpdatedTime?: string };
  /** Present on deleted entities in change-data-capture feeds. */
  status?: "Deleted";
};

/** Subset of a QuickBooks Online Payment (customer payment received). */
export type QboPayment = {
  Id: string;
  TxnDate: string;
  TotalAmt: number;
  UnappliedAmt?: number;
  PaymentRefNum?: string;
  CustomerRef: { value: string; name?: string };
  Line?: { Amount: number; LinkedTxn?: { TxnId: string; TxnType: string }[] }[];
  MetaData?: { LastUpdatedTime?: string };
  status?: "Deleted";
};

export class QuickBooksMappingError extends Error {}

/** QuickBooks amounts are decimals with two places; convert without float drift. */
export function qboAmountToCents(amount: number): Cents {
  if (!Number.isFinite(amount)) throw new QuickBooksMappingError(`Invalid amount ${amount}`);
  const [whole, frac = ""] = Math.abs(amount).toFixed(2).split(".");
  const cents = parseInt(whole, 10) * 100 + parseInt(frac.padEnd(2, "0"), 10);
  return amount < 0 ? -cents : cents;
}

function date(value: string | undefined, field: string): ISODate {
  const d = value?.slice(0, 10) ?? "";
  if (!isISODate(d)) throw new QuickBooksMappingError(`Invalid ${field}: ${value}`);
  return d;
}

export type MappedInvoice = {
  qbInvoiceId: string;
  docNumber?: string;
  qbCustomerId: string;
  txnDate: ISODate;
  dueDate?: ISODate;
  totalCents: Cents;
  balanceCents: Cents;
  qbLastUpdated?: string;
};

export function mapInvoice(raw: QboInvoice): MappedInvoice {
  if (!raw.Id) throw new QuickBooksMappingError("Invoice without Id");
  return {
    qbInvoiceId: raw.Id,
    docNumber: raw.DocNumber || undefined,
    qbCustomerId: raw.CustomerRef?.value,
    txnDate: date(raw.TxnDate, "TxnDate"),
    dueDate: raw.DueDate ? date(raw.DueDate, "DueDate") : undefined,
    totalCents: qboAmountToCents(raw.TotalAmt),
    balanceCents: qboAmountToCents(raw.Balance),
    qbLastUpdated: raw.MetaData?.LastUpdatedTime,
  };
}

export type MappedPayment = {
  externalPaymentId: string;
  quickbooksCustomerId: string;
  receivedOn: ISODate;
  amountCents: Cents;
  unappliedCents: Cents;
  paymentRef?: string;
  appliedTo: { qbInvoiceId: string; amountCents: Cents }[];
  qbLastUpdated?: string;
};

export function mapPayment(raw: QboPayment): MappedPayment {
  if (!raw.Id) throw new QuickBooksMappingError("Payment without Id");
  const appliedTo = (raw.Line ?? []).flatMap((l) =>
    (l.LinkedTxn ?? []).filter((t) => t.TxnType === "Invoice").map((t) => ({ qbInvoiceId: t.TxnId, amountCents: qboAmountToCents(l.Amount) })),
  );
  return {
    externalPaymentId: raw.Id,
    quickbooksCustomerId: raw.CustomerRef?.value,
    receivedOn: date(raw.TxnDate, "TxnDate"),
    amountCents: qboAmountToCents(raw.TotalAmt),
    unappliedCents: qboAmountToCents(raw.UnappliedAmt ?? 0),
    paymentRef: raw.PaymentRefNum || undefined,
    appliedTo,
    qbLastUpdated: raw.MetaData?.LastUpdatedTime,
  };
}
