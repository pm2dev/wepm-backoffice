"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { EmptyState, ErrorState, LoadingState, PageHeader } from "@/components/ui/states";
import { useBackoffice } from "@/lib/data/backoffice-provider";
import { formatMonth, monthKey } from "@/lib/domain/dates";
import { monthlySpending, upcomingCharges, type ChargeView } from "@/lib/domain/expenses";
import { formatCents } from "@/lib/domain/money";
import type { BackofficeData } from "@/lib/domain/types";
import { BillsTabs } from "./bills-tabs";
import { AmountDialog, MarkPaidDialog } from "./charge-dialogs";
import { ChargeRow } from "./charge-row";

export function UpcomingPage() {
  const { state } = useBackoffice();
  return (
    <>
      <PageHeader title="Bills & subscriptions" description="What's coming up in the next 30 days, and what you've been spending each month." />
      <BillsTabs />
      {state.status === "loading" ? <LoadingState /> : null}
      {state.status === "error" ? <ErrorState message={state.message} /> : null}
      {state.status === "ready" ? <Upcoming data={state.data} /> : null}
    </>
  );
}

function Upcoming({ data }: { data: BackofficeData }) {
  const { today } = useBackoffice();
  const upcoming = useMemo(() => upcomingCharges(data, today, 30), [data, today]);
  const spending = useMemo(() => monthlySpending(data, monthKey(today), 6), [data, today]);
  const max = Math.max(1, ...spending.map((s) => s.totalCents));
  const [paying, setPaying] = useState<ChargeView[] | null>(null);
  const [amountFor, setAmountFor] = useState<ChargeView | null>(null);

  return (
    <div className="grid gap-8 xl:grid-cols-[1fr_22rem]">
      <section aria-labelledby="upcoming-heading" className="min-w-0">
        <div className="mb-2 flex items-baseline justify-between">
          <h2 id="upcoming-heading" className="text-sm font-semibold uppercase tracking-wide text-slate-600">
            Next 30 days <span className="font-normal normal-case">({upcoming.length})</span>
          </h2>
          <span className="tabular text-sm text-slate-600">{formatCents(upcoming.reduce((s, c) => s + c.amountCents, 0))}</span>
        </div>
        {upcoming.length === 0 ? (
          <EmptyState title="Nothing due in the next 30 days" />
        ) : (
          <Card>
            <ul className="divide-y divide-slate-200">
              {upcoming.map((c) => (
                <ChargeRow key={c.key} c={c} data={data} today={today} onEnterAmount={() => setAmountFor(c)} onTogglePaid={() => setPaying([c])} />
              ))}
            </ul>
          </Card>
        )}
        <p className="mt-2 text-xs text-slate-500">
          Past-due unpaid charges are in the <Link href="/bills" className="text-blue-700 underline underline-offset-2">monthly review</Link>.
        </p>
      </section>

      <section aria-labelledby="spending-heading">
        <h2 id="spending-heading" className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-600">Monthly spending</h2>
        <Card className="p-4">
          <ul className="space-y-3">
            {spending.map((s) => (
              <li key={s.month}>
                <Link href={`/bills?month=${s.month}`} className="block rounded-lg p-1 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-blue-600">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-700">{formatMonth(s.month)}</span>
                    <span className="tabular font-medium text-slate-900">{formatCents(s.totalCents)}</span>
                  </div>
                  <div className="mt-1 h-2 rounded-full bg-slate-100" aria-hidden>
                    <div className="h-2 rounded-full bg-slate-700" style={{ width: `${(s.totalCents / max) * 100}%` }} />
                  </div>
                  {s.estimatedCents ? <p className="mt-0.5 text-xs text-amber-800">Includes {formatCents(s.estimatedCents)} estimated</p> : null}
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-slate-500">Charges due each month: actual amounts where known, otherwise estimates.</p>
        </Card>
      </section>

      {paying ? <MarkPaidDialog charges={paying} onClose={() => setPaying(null)} /> : null}
      {amountFor ? <AmountDialog charge={amountFor} onClose={() => setAmountFor(null)} /> : null}
    </div>
  );
}
