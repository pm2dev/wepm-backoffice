import { Card } from "@/components/ui/card";
import { formatDate } from "@/lib/domain/dates";
import { formatCents, formatHours } from "@/lib/domain/money";
import type { PayrollLine } from "@/lib/domain/types";

/** Pay calculation by rate segment: hours × the rate in effect on the dates worked. */
export function RateLines({ lines, total, missingRateMinutes = 0 }: { lines: PayrollLine[]; total: number; missingRateMinutes?: number }) {
  return (
    <Card className="p-4">
      <h2 className="text-sm font-semibold text-slate-900">Calculation</h2>
      <dl className="mt-3 divide-y divide-slate-200 text-sm">
        {lines.map((l) => (
          <div key={l.hourlyRateCents} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2">
            <dt className="text-slate-700">
              <span className="tabular">{formatHours(l.minutes)}</span> × <span className="tabular">{formatCents(l.hourlyRateCents)}/h</span>
              <span className="block text-xs text-slate-500">
                Work dates {formatDate(l.firstWorkDate, { year: false })}
                {l.lastWorkDate !== l.firstWorkDate ? ` – ${formatDate(l.lastWorkDate, { year: false })}` : ""}
              </span>
            </dt>
            <dd className="tabular font-medium text-slate-900">{formatCents(l.amountCents)}</dd>
          </div>
        ))}
        {missingRateMinutes > 0 ? (
          <div className="flex justify-between gap-4 py-2 text-red-800">
            <dt>{formatHours(missingRateMinutes)} × no rate on file</dt>
            <dd className="font-medium">Not calculated</dd>
          </div>
        ) : null}
        <div className="flex justify-between gap-4 pt-3">
          <dt className="font-semibold text-slate-900">{missingRateMinutes > 0 ? "Calculated so far" : "Total pay"}</dt>
          <dd className="tabular text-lg font-semibold text-slate-900">{formatCents(total)}</dd>
        </div>
      </dl>
      <p className="mt-3 text-xs text-slate-500">Rates apply by actual work date. Amounts round to the cent once per rate.</p>
    </Card>
  );
}
