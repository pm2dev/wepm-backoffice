import type { ISODate } from "./dates";
import type { Cents } from "./money";
import type { ContractorRate } from "./types";

/**
 * The contractor's hourly cost rate in effect on the actual date worked.
 * Approval date and payment date never affect the rate.
 * Returns null when no rate covers the date — never zero, never "today's rate".
 */
export function rateOn(rates: ContractorRate[], contractorId: string, workDate: ISODate): Cents | null {
  let best: ContractorRate | null = null;
  for (const r of rates) {
    if (r.contractorId !== contractorId || r.effectiveDate > workDate) continue;
    if (!best || r.effectiveDate > best.effectiveDate) best = r;
  }
  return best ? best.hourlyRateCents : null;
}

export function rateHistory(rates: ContractorRate[], contractorId: string): ContractorRate[] {
  return rates
    .filter((r) => r.contractorId === contractorId)
    .sort((a, b) => (a.effectiveDate < b.effectiveDate ? 1 : -1));
}
