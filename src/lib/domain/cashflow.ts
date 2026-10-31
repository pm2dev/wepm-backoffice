import { addDays, compareDates, isISODate, type ISODate } from "./dates";
import { accountLabel, listCharges } from "./expenses";
import { type Cents } from "./money";
import { DomainError, randomId, whatsDue, type IdFactory } from "./payroll";
import type { BackofficeData, InvoiceReceipt, ObligationKind } from "./types";

/**
 * Cash-flow recommendations (PRD §11). Suggestions only: they never move money,
 * reserve funds, or change any balance or paid status. Zero starting balance;
 * only the incoming invoice payment is considered.
 */

export function recordInvoiceReceipt(
  data: BackofficeData,
  input: Omit<InvoiceReceipt, "id">,
  newId: IdFactory = randomId,
): { data: BackofficeData; receipt: InvoiceReceipt; duplicate: boolean } {
  const existing = data.invoiceReceipts.find((r) => r.externalPaymentId === input.externalPaymentId);
  // Re-delivery of the same QuickBooks payment never creates a second receipt.
  if (existing) return { data, receipt: existing, duplicate: true };
  const errors: string[] = [];
  if (!input.externalPaymentId.trim()) errors.push("Missing payment ID");
  if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0) errors.push("Enter an amount greater than $0.");
  if (!isISODate(input.receivedOn)) errors.push("Enter the date received.");
  if (errors.length) throw new DomainError(errors.join(" "));
  // Explicit mapping only: QuickBooks customer ID → Backoffice customer.
  const customerId = input.customerId ?? data.customers.find((c) => input.quickbooksCustomerId && c.quickbooksCustomerId === input.quickbooksCustomerId)?.id ?? null;
  const receipt: InvoiceReceipt = { ...input, customerId, id: newId("rcpt"), invoiceRef: input.invoiceRef?.trim() || undefined };
  return { data: { ...data, invoiceReceipts: [...data.invoiceReceipts, receipt] }, receipt, duplicate: false };
}

/** How far ahead bills are considered. Contractor obligations are all unpaid ones, upcoming included. */
export const BILL_HORIZON_DAYS = 30;

export type Suggestion = {
  category: "contractor" | "bill";
  key: string;
  label: string;
  detail: string;
  kind: ObligationKind | "bill" | "subscription";
  contractorId?: string;
  periodStart?: ISODate;
  periodEnd?: ISODate;
  dueDate: ISODate;
  outstandingCents: Cents;
  suggestedCents: Cents;
  /** Unfinalized payroll: amount is the current calculation. */
  needsFinalization?: boolean;
  isEstimate?: boolean;
  overdue: boolean;
};

export type Recommendation = {
  receipt: InvoiceReceipt;
  asOf: ISODate;
  incomingCents: Cents;
  contractor: Suggestion[];
  bills: Suggestion[];
  /** Obligations considered but not reached by this payment. */
  notCovered: Suggestion[];
  suggestedTotalCents: Cents;
  remainderCents: Cents;
  /** Total obligations considered minus the incoming amount, if positive. */
  shortfallCents: Cents;
  /** Approved hours with no rate are owed but can't be priced. */
  unpricedPayrollMinutes: number;
};

export function recommend(data: BackofficeData, receiptId: string, today: ISODate): Recommendation {
  const receipt = data.invoiceReceipts.find((r) => r.id === receiptId);
  if (!receipt) throw new DomainError("Payment not found.");
  const contractors = new Map(data.contractors.map((c) => [c.id, c.name]));

  const due = whatsDue(data, today);
  const contractorCandidates: Suggestion[] = due
    .filter((o) => o.outstandingCents > 0)
    .map((o) => ({
      category: "contractor" as const,
      key: o.uid,
      label: contractors.get(o.contractorId) ?? "Contractor",
      detail: o.title,
      periodStart: o.periodStart,
      periodEnd: o.periodEnd,
      kind: o.kind,
      contractorId: o.contractorId,
      dueDate: o.dueDate,
      outstandingCents: o.outstandingCents,
      suggestedCents: 0,
      needsFinalization: o.ref === null,
      overdue: o.overdue,
    }))
    // Earliest due first. Bonuses and reimbursements rank with payroll by due date (PRD §19.7 — assumption).
    .sort((a, b) => compareDates(a.dueDate, b.dueDate) || a.label.localeCompare(b.label));
  const unpricedPayrollMinutes = due.reduce((s, o) => s + (o.missingRateMinutes ?? 0), 0);

  const horizon = addDays(today, BILL_HORIZON_DAYS);
  const billCandidates: Suggestion[] = listCharges(data, horizon)
    .filter((c) => !c.paid && c.amountCents > 0)
    .map((c) => ({
      category: "bill" as const,
      key: c.key,
      label: c.vendor,
      detail: (() => {
        const a = data.paymentAccounts.find((x) => x.id === c.accountId);
        return a ? `Paid from ${accountLabel(a)}` : "";
      })(),
      kind: c.type,
      dueDate: c.dueDate,
      outstandingCents: c.amountCents,
      suggestedCents: 0,
      isEstimate: c.isEstimate,
      overdue: c.dueDate < today,
    }))
    .sort((a, b) => compareDates(a.dueDate, b.dueDate) || a.label.localeCompare(b.label));

  let remaining = receipt.amountCents;
  const allocate = (list: Suggestion[]) => {
    const covered: Suggestion[] = [];
    const left: Suggestion[] = [];
    for (const s of list) {
      const amt = Math.min(remaining, s.outstandingCents);
      if (amt > 0) {
        covered.push({ ...s, suggestedCents: amt });
        remaining -= amt;
      } else left.push(s);
    }
    return { covered, left };
  };
  const c = allocate(contractorCandidates);
  const b = allocate(billCandidates);
  const totalConsidered = [...contractorCandidates, ...billCandidates].reduce((s, x) => s + x.outstandingCents, 0);
  const suggestedTotal = receipt.amountCents - remaining;

  return {
    receipt,
    asOf: today,
    incomingCents: receipt.amountCents,
    contractor: c.covered,
    bills: b.covered,
    notCovered: [...c.left, ...b.left],
    suggestedTotalCents: suggestedTotal,
    remainderCents: remaining,
    shortfallCents: Math.max(0, totalConsidered - receipt.amountCents),
    unpricedPayrollMinutes,
  };
}
