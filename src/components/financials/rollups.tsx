"use client";

import { AlertTriangle } from "lucide-react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { ErrorState, LoadingState, PageHeader } from "@/components/ui/states";
import { useBackoffice } from "@/lib/data/backoffice-provider";
import { formatDate } from "@/lib/domain/dates";
import { companyFinancials, customerFinancials, type ProjectFinancials, type RevenueTotals } from "@/lib/domain/financials";
import { formatCents } from "@/lib/domain/money";
import type { BackofficeData } from "@/lib/domain/types";
import { routes } from "@/lib/routes";
import { Figure, formatPercent } from "./project-financials";
import { RangeFilter, useDateRange } from "./range-filter";

function TotalsFigures({ t }: { t: RevenueTotals }) {
  return (
    <dl className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <Figure label="Earned" value={formatCents(t.earnedCents)} />
      <Figure label="Invoiced" value={formatCents(t.invoicedCents)} sub={`${formatCents(t.collectedCents)} collected`} />
      <Figure label="Cost" value={formatCents(t.costCents)} />
      <Figure label="Margin" value={formatCents(t.marginCents)} sub={t.earnedCents ? `${formatPercent(t.marginCents / t.earnedCents)} of earned` : undefined} tone={t.marginCents < 0 ? "danger" : undefined} />
    </dl>
  );
}

const MissingNote = () => (
  <p className="flex gap-2 text-sm text-red-800">
    <AlertTriangle className="size-4 shrink-0" aria-hidden />
    Some hours have no billing or cost rate and aren&apos;t counted. Open a project to see which.
  </p>
);

/** One row per project: earned, cost, margin. */
function ProjectTable({ rows, caption, revenue = true }: { rows: ProjectFinancials[]; caption: string; revenue?: boolean }) {
  return (
    <div role="region" aria-label={caption} tabIndex={0} className="overflow-x-auto rounded-xl border border-slate-200 bg-white focus-visible:outline-2 focus-visible:outline-blue-600">
      <table className="w-full text-left text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
          <tr>
            <th scope="col" className="px-4 py-2 font-medium">Project</th>
            {revenue ? <th scope="col" className="px-4 py-2 text-right font-medium">Earned</th> : null}
            <th scope="col" className="px-4 py-2 text-right font-medium">Cost</th>
            {revenue ? <th scope="col" className="px-4 py-2 text-right font-medium">Margin</th> : null}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {rows.map((f) => (
            <tr key={f.project.id}>
              <td className="px-4 py-2.5">
                <Link href={routes.project(f.project.id)} className="underline-offset-2 hover:underline">{f.project.name}</Link>
                {f.missingBillingRates.length || f.missingCostRates.length ? <span className="ml-1 text-xs text-red-700">· missing rates</span> : null}
              </td>
              {revenue ? <td className="tabular px-4 py-2.5 text-right">{f.revenue ? formatCents(f.revenue.earnedCents) : "—"}</td> : null}
              <td className="tabular px-4 py-2.5 text-right">{formatCents(f.cost.totalCents)}</td>
              {revenue ? (
                <td className={`tabular px-4 py-2.5 text-right ${f.marginCents !== null && f.marginCents < 0 ? "text-red-700" : ""}`}>{f.marginCents === null ? "—" : formatCents(f.marginCents)}</td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** A customer's projects added up, with a period filter (lifetime by default). */
export function CustomerFinancialsSection({ data, customerId }: { data: BackofficeData; customerId: string }) {
  const { today } = useBackoffice();
  const range = useDateRange("lifetime", today);
  const c = customerFinancials(data, customerId, today, range.range);
  if (!c.projects.length) return null;
  return (
    <section aria-labelledby="cust-fin" className="mt-8 space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 id="cust-fin" className="text-sm font-semibold uppercase tracking-wide text-slate-600">Financials</h2>
        <RangeFilter id="cust-fin" state={range} />
      </div>
      <Card className="space-y-4 p-4">
        <TotalsFigures t={c.totals} />
        {c.hasMissingRates ? <MissingNote /> : null}
      </Card>
      <ProjectTable rows={c.projects} caption="Financials by project" />
    </section>
  );
}

/** The company: client projects, internal investment, overhead, and the total (this year by default). */
export function OverviewPage() {
  const { state, today } = useBackoffice();
  const range = useDateRange("this_year", today);
  return (
    <>
      <PageHeader title="Overview" description="What client work earns, what internal projects and overhead cost, and what's left." actions={<RangeFilter id="overview" state={range} />} />
      {state.status === "loading" ? <LoadingState /> : null}
      {state.status === "error" ? <ErrorState message={state.message} /> : null}
      {state.status === "ready" ? <Overview data={state.data} today={today} range={range.range} /> : null}
    </>
  );
}

function Overview({ data, today, range }: { data: BackofficeData; today: string; range: ReturnType<typeof useDateRange>["range"] }) {
  const co = companyFinancials(data, today, range);
  return (
    <div className="space-y-8">
      <section aria-label="Total" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="p-4">
          <p className="text-sm text-slate-600">Client margin</p>
          <p className={`tabular mt-1 text-2xl font-semibold ${co.clientTotals.marginCents < 0 ? "text-red-700" : ""}`}>{formatCents(co.clientTotals.marginCents)}</p>
          <p className="text-xs text-slate-600">{formatCents(co.clientTotals.earnedCents)} earned − {formatCents(co.clientTotals.costCents)} cost</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-slate-600">Internal investment</p>
          <p className="tabular mt-1 text-2xl font-semibold">{formatCents(co.internalInvestmentCents)}</p>
          <p className="text-xs text-slate-600">{co.internal.length} internal project{co.internal.length === 1 ? "" : "s"}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-slate-600">Overhead</p>
          <p className="tabular mt-1 text-2xl font-semibold">{formatCents(co.overheadCents)}</p>
          <p className="text-xs text-slate-600">Costs on no project</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-slate-600">Total margin</p>
          <p className={`tabular mt-1 text-2xl font-semibold ${co.totalMarginCents < 0 ? "text-red-700" : "text-emerald-700"}`}>{formatCents(co.totalMarginCents)}</p>
          <p className="text-xs text-slate-600">Client margin − internal − overhead</p>
        </Card>
      </section>
      {co.hasMissingRates ? <MissingNote /> : null}

      <section aria-labelledby="ov-client" className="space-y-3">
        <h2 id="ov-client" className="text-sm font-semibold uppercase tracking-wide text-slate-600">Client projects</h2>
        <Card className="p-4">
          <TotalsFigures t={co.clientTotals} />
        </Card>
        {co.client.length ? <ProjectTable rows={co.client} caption="Client projects" /> : <p className="text-sm text-slate-600">No client projects.</p>}
      </section>

      <section aria-labelledby="ov-internal" className="space-y-3">
        <h2 id="ov-internal" className="text-sm font-semibold uppercase tracking-wide text-slate-600">Internal investment</h2>
        {co.internal.length ? <ProjectTable rows={co.internal} caption="Internal projects" revenue={false} /> : <p className="text-sm text-slate-600">No internal projects.</p>}
      </section>

      <section aria-labelledby="ov-overhead" className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="ov-overhead" className="text-sm font-semibold uppercase tracking-wide text-slate-600">Overhead</h2>
          <Link href="/bills/expenses" className="text-sm text-blue-700 underline underline-offset-2">Company expenses</Link>
        </div>
        {co.overhead.length ? (
          <Card>
            <ul className="divide-y divide-slate-200 text-sm">
              {co.overhead.slice(0, 12).map((o) => (
                <li key={o.id} className="flex justify-between gap-3 px-4 py-2">
                  <span className="min-w-0">
                    {o.vendor}
                    <span className="block text-xs text-slate-500">
                      {formatDate(o.date, { year: true })} · {o.kind === "expense" ? `One-off${o.description ? ` · ${o.description}` : ""}` : "Bill or subscription"}
                    </span>
                  </span>
                  <span className="tabular">{formatCents(o.amountCents)}</span>
                </li>
              ))}
            </ul>
            {co.overhead.length > 12 ? <p className="border-t border-slate-200 px-4 py-2 text-xs text-slate-500">And {co.overhead.length - 12} more.</p> : null}
          </Card>
        ) : (
          <p className="text-sm text-slate-600">No overhead in this period.</p>
        )}
      </section>
    </div>
  );
}
