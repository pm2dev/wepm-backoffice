"use client";

import { AlertTriangle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useBackoffice } from "@/lib/data/backoffice-provider";
import { formatDate } from "@/lib/domain/dates";
import { budgetUse, projectFinancials, type ProjectFinancials } from "@/lib/domain/financials";
import { formatCents, formatHours } from "@/lib/domain/money";
import type { BackofficeData, Project } from "@/lib/domain/types";
import { RangeFilter, useDateRange } from "./range-filter";

export const formatPercent = (r: number | null) => (r === null ? "—" : `${Math.round(r * 100)}%`);

/** A labeled amount in a definition list. */
export function Figure({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "danger" | "success" }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className={`tabular text-lg font-semibold ${tone === "danger" ? "text-red-700" : tone === "success" ? "text-emerald-700" : "text-slate-900"}`}>{value}</dd>
      {sub ? <dd className="text-xs text-slate-500">{sub}</dd> : null}
    </div>
  );
}

/** Revenue, cost and margin for one project, with a date filter (lifetime by default) and lifetime budget use. */
export function ProjectFinancialsSection({ data, project }: { data: BackofficeData; project: Project }) {
  const { today } = useBackoffice();
  const range = useDateRange("lifetime", today);
  const f = projectFinancials(data, project.id, today, range.range);
  const budget = budgetUse(data, project.id, today);
  return (
    <section aria-labelledby="fin-heading" className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 id="fin-heading" className="text-sm font-semibold uppercase tracking-wide text-slate-600">Financials</h2>
        <RangeFilter id="fin" state={range} />
      </div>
      <Card className="space-y-4 p-4">
        <FinancialFigures f={f} />
        <MissingRates data={data} f={f} />
        {budget ? <BudgetBar budget={budget} /> : null}
      </Card>
    </section>
  );
}

export function FinancialFigures({ f }: { f: Pick<ProjectFinancials, "revenue" | "cost" | "marginCents" | "marginRatio"> }) {
  return (
    <dl className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {f.revenue ? (
        <>
          <Figure label="Earned" value={formatCents(f.revenue.earnedCents)} sub={`${formatHours(f.revenue.billableMinutes)} billable${f.revenue.earnedExpenseCents ? ` + ${formatCents(f.revenue.earnedExpenseCents)} expenses` : ""}`} />
          <Figure label="Invoiced" value={formatCents(f.revenue.invoicedCents)} sub={`${formatCents(f.revenue.collectedCents)} collected`} />
        </>
      ) : null}
      <Figure
        label="Cost"
        value={formatCents(f.cost.totalCents)}
        sub={`${formatCents(f.cost.laborCents)} labor · ${formatCents(f.cost.projectExpenseCents + f.cost.recurringCents)} expenses`}
      />
      {f.revenue ? (
        <Figure label="Margin" value={formatCents(f.marginCents!)} sub={f.marginRatio === null ? undefined : `${formatPercent(f.marginRatio)} of earned`} tone={f.marginCents! < 0 ? "danger" : undefined} />
      ) : (
        <Figure label="Labor hours" value={formatHours(f.cost.laborMinutes)} sub="Internal project: cost only" />
      )}
    </dl>
  );
}

function MissingRates({ data, f }: { data: BackofficeData; f: ProjectFinancials }) {
  if (!f.missingBillingRates.length && !f.missingCostRates.length) return null;
  return (
    <div className="flex gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-900">
      <AlertTriangle className="size-4 shrink-0" aria-hidden />
      <ul className="space-y-1">
        {f.missingBillingRates.map((m) => (
          <li key={`b-${m.task}`}>
            {formatHours(m.minutes)} of <strong>{m.task}</strong> ({formatDate(m.from)} – {formatDate(m.to)}) have no billing rate, so they aren&apos;t in Earned.
          </li>
        ))}
        {f.missingCostRates.map((m) => (
          <li key={`c-${m.contractorId}`}>
            {formatHours(m.minutes)} by <strong>{data.contractors.find((c) => c.id === m.contractorId)?.name ?? "a contractor"}</strong> ({formatDate(m.from)} – {formatDate(m.to)}) have no cost rate, so they aren&apos;t in Cost.
          </li>
        ))}
      </ul>
    </div>
  );
}

function BudgetBar({ budget }: { budget: NonNullable<ReturnType<typeof budgetUse>> }) {
  const rows: { label: string; used: string; of: string; ratio: number }[] = [];
  if (budget.budgetCents) rows.push({ label: budget.kind === "cost" ? "Cost budget" : "Budget", used: formatCents(budget.usedCents), of: formatCents(budget.budgetCents), ratio: budget.usedCents / budget.budgetCents });
  if (budget.budgetMinutes) rows.push({ label: "Budget hours", used: formatHours(budget.usedMinutes ?? 0), of: formatHours(budget.budgetMinutes), ratio: (budget.usedMinutes ?? 0) / budget.budgetMinutes });
  return (
    <div className="space-y-3 border-t border-slate-200 pt-4">
      {rows.map((r) => (
        <div key={r.label}>
          <div className="flex flex-wrap justify-between gap-2 text-sm">
            <span className="font-medium text-slate-900">{r.label} used (lifetime)</span>
            <span className="tabular text-slate-700">
              {r.used} of {r.of} · {formatPercent(r.ratio)}
            </span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-200" role="meter" aria-label={`${r.label} used`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(r.ratio * 100)}>
            <div className={`h-full ${r.ratio > 1 ? "bg-red-600" : r.ratio > 0.85 ? "bg-amber-500" : "bg-slate-900"}`} style={{ width: `${Math.min(100, r.ratio * 100)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}
