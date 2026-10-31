"use client";

import { use, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, ErrorState, LoadingState, PageHeader } from "@/components/ui/states";
import { useBackoffice } from "@/lib/data/backoffice-provider";
import { formatDate, formatRange } from "@/lib/domain/dates";
import { formatCents, formatHours } from "@/lib/domain/money";
import { listObligations } from "@/lib/domain/payroll";
import { PAYMENT_METHOD_LABELS } from "@/lib/domain/types";
import { BackLink } from "./back-link";
import { EntriesTable } from "./entries-table";
import { dueText, StatusBadge } from "./labels";
import { RateLines } from "./rate-lines";
import { RecordPaymentDialog } from "./record-payment-dialog";

export function RecordDetailPage({ payrollId }: { payrollId: string }) {
  const { state, today } = useBackoffice();
  const [paying, setPaying] = useState(false);
  const obligations = useMemo(() => (state.status === "ready" ? listObligations(state.data, today) : []), [state, today]);

  if (state.status === "loading") return <LoadingState />;
  if (state.status === "error") return <ErrorState message={state.message} />;
  const { data } = state;
  const payroll = data.payrolls.find((p) => p.id === payrollId);
  const contractor = payroll && data.contractors.find((c) => c.id === payroll.contractorId);
  const ob = obligations.find((o) => o.uid === `payroll:${payrollId}`);
  if (!payroll || !contractor || !ob) {
    return (
      <>
        <BackLink />
        <EmptyState title="Payroll record not found" />
      </>
    );
  }
  const entryIds = new Set(payroll.entryIds);
  const entries = data.timeEntries.filter((e) => entryIds.has(e.id)).sort((a, b) => (a.workDate < b.workDate ? -1 : 1));
  const payments = data.payments
    .flatMap((p) => p.allocations.filter((a) => a.obligation.kind === "payroll" && a.obligation.id === payroll.id).map((a) => ({ p, a })))
    .sort((x, y) => (x.p.paidOn < y.p.paidOn ? 1 : -1));
  const totalMinutes = payroll.lines.reduce((s, l) => s + l.minutes, 0);

  return (
    <>
      <BackLink />
      <PageHeader
        title={`${contractor.name} · ${formatRange(payroll.periodStart, payroll.periodEnd)}`}
        description={`${payroll.lateApproved ? "Late-approved hours" : "Weekly hours"} · finalized ${formatDate(payroll.finalizedOn)} · ${dueText(payroll.dueDate, today, ob.status === "paid")}`}
        actions={ob.outstandingCents > 0 ? <Button onClick={() => setPaying(true)}>Record payment</Button> : null}
      />
      <div className="mb-6 flex flex-wrap gap-1.5">
        <Badge tone="neutral">Payroll</Badge>
        <StatusBadge status={ob.status} />
        {ob.overdue ? <Badge tone="danger">Overdue</Badge> : null}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="min-w-0 space-y-6">
          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">Hours in this record ({formatHours(totalMinutes)})</h2>
            <EntriesTable data={data} entries={entries} contractorId={contractor.id} caption={`Hours finalized for ${contractor.name}`} />
            <p className="text-xs text-slate-500">The calculation at right was preserved when finalized. The rate column shows today&rsquo;s rate table for reference only.</p>
          </section>
          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">Payments applied</h2>
            {payments.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-600">No payments recorded yet.</p>
            ) : (
              <Card>
                <ul className="divide-y divide-slate-200 text-sm">
                  {payments.map(({ p, a }) => (
                    <li key={p.id} className="flex flex-wrap justify-between gap-2 p-4">
                      <span>
                        {formatDate(p.paidOn, { weekday: true })} · {PAYMENT_METHOD_LABELS[p.method]}
                        {p.note ? <span className="block text-slate-600">{p.note}</span> : null}
                      </span>
                      <span className="tabular font-medium">{formatCents(a.amountCents)}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </section>
        </div>
        <div className="space-y-4">
          <RateLines lines={payroll.lines} total={payroll.amountCents} />
          <Card className="p-4 text-sm">
            <dl className="space-y-2">
              <div className="flex justify-between"><dt className="text-slate-600">Paid</dt><dd className="tabular">{formatCents(ob.paidCents)}</dd></div>
              <div className="flex justify-between font-semibold"><dt>Outstanding</dt><dd className="tabular">{formatCents(ob.outstandingCents)}</dd></div>
            </dl>
          </Card>
        </div>
      </div>

      {paying ? (
        <RecordPaymentDialog
          open
          onOpenChange={setPaying}
          contractor={contractor}
          obligations={obligations.filter((o) => o.contractorId === contractor.id && o.status !== "paid")}
          preselected={[ob.uid]}
        />
      ) : null}
    </>
  );
}

export function RecordDetailRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <RecordDetailPage payrollId={id} />;
}
