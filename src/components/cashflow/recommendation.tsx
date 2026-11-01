"use client";

import { Info } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState, ErrorState, LoadingState, PageHeader } from "@/components/ui/states";
import { BackLink } from "@/components/payroll/back-link";
import { Button } from "@/components/ui/button";
import { useNotice } from "@/components/layout/notice";
import { DoneBadge, MarkPaymentDoneDialog, SourceBadge } from "./receipts";
import { useBackoffice } from "@/lib/data/backoffice-provider";
import { BILL_HORIZON_DAYS, recommend, type Suggestion } from "@/lib/domain/cashflow";
import { formatDate, formatRange } from "@/lib/domain/dates";
import { formatCents, formatHours } from "@/lib/domain/money";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";

const KIND_LABEL: Record<Suggestion["kind"], string> = { payroll: "Payroll", bonus: "Bonus", reimbursement: "Reimbursement", bill: "Bill", subscription: "Subscription" };

export function RecommendationRoute() {
  const id = useSearchParams().get("id") ?? "";
  const { state, today, mutate } = useBackoffice();
  const notify = useNotice();
  const [marking, setMarking] = useState(false);
  const rec = useMemo(() => {
    if (state.status !== "ready" || !state.data.invoiceReceipts.some((r) => r.id === id)) return null;
    return recommend(state.data, id, today);
  }, [state, id, today]);

  if (state.status === "loading") return <LoadingState />;
  if (state.status === "error") return <ErrorState message={state.message} />;
  if (!rec) {
    return (
      <>
        <BackLink href={routes.cashFlow} label="Cash flow" />
        <EmptyState title="Payment not found" />
      </>
    );
  }
  const customer = state.data.customers.find((c) => c.id === rec.receipt.customerId);
  const contractorTotal = rec.contractor.reduce((s, x) => s + x.suggestedCents, 0);
  const billTotal = rec.bills.reduce((s, x) => s + x.suggestedCents, 0);

  return (
    <>
      <BackLink href={routes.cashFlow} label="Cash flow" />
      <PageHeader
        title={`${formatCents(rec.incomingCents)} from ${customer?.name ?? "an unmatched customer"}`}
        description={`Received ${formatDate(rec.receipt.receivedOn, { weekday: true })}${rec.receipt.paymentRef ? ` · ${rec.receipt.paymentRef}` : ""}`}
        actions={
          rec.receipt.done ? (
            <Button
              variant="secondary"
              onClick={async () => {
                await mutate((r) => r.setPaymentDone(rec.receipt.id, null));
                notify("Payment reopened.");
              }}
            >
              Reopen
            </Button>
          ) : (
            <Button onClick={() => setMarking(true)}>Mark done</Button>
          )
        }
      />
      <div className="-mt-3 mb-4 flex flex-wrap gap-1.5">
        <DoneBadge r={rec.receipt} />
        <SourceBadge r={rec.receipt} />
      </div>
      {rec.receipt.done?.note ? <p className="mb-4 text-sm text-slate-600">Done note: {rec.receipt.done.note}</p> : null}
      {rec.receipt.appliedTo?.length || rec.receipt.unappliedCents ? (
        <p className="mb-4 text-sm text-slate-700">
          {rec.receipt.appliedTo?.length ? (
            <>
              Applied in QuickBooks to{" "}
              {rec.receipt.appliedTo.map((a, i) => {
                const inv = state.data.quickbooksInvoices.find((x) => x.qbInvoiceId === a.qbInvoiceId);
                return (
                  <span key={a.qbInvoiceId}>
                    {i ? ", " : ""}
                    <Link href={routes.invoices} className="underline underline-offset-2">{inv?.docNumber ?? `#${a.qbInvoiceId}`}</Link> ({formatCents(a.amountCents)})
                  </span>
                );
              })}
            </>
          ) : null}
          {rec.receipt.unappliedCents ? <span className="text-amber-800"> {formatCents(rec.receipt.unappliedCents)} not applied to an invoice.</span> : null}
        </p>
      ) : null}
      {marking ? <MarkPaymentDoneDialog data={state.data} receipt={rec.receipt} onClose={() => setMarking(false)} /> : null}

      <Card className="mb-6 flex gap-3 border-blue-200 bg-blue-50 p-4 text-sm text-blue-950">
        <Info className="size-5 shrink-0 text-blue-700" aria-hidden />
        <p>
          A snapshot as of <strong>{formatDate(rec.asOf)}</strong>, based on unpaid amounts recorded in Backoffice and starting from $0. It doesn&rsquo;t reserve money or change any balance.
          If more payments arrive before you record what you paid out, they&rsquo;ll suggest the same items — each suggestion is independent.
        </p>
      </Card>

      <section aria-label="Summary" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Incoming" value={formatCents(rec.incomingCents)} />
        <Stat label="1. Contractor pay" value={formatCents(contractorTotal)} />
        <Stat label="2. Bills & subscriptions" value={formatCents(billTotal)} />
        {rec.remainderCents > 0 ? (
          <Stat label="Left to allocate" value={formatCents(rec.remainderCents)} tone="success" />
        ) : (
          <Stat label="Shortfall" value={formatCents(rec.shortfallCents)} tone={rec.shortfallCents ? "danger" : undefined} sub={rec.shortfallCents ? "More is owed than this payment covers" : undefined} />
        )}
      </section>

      <div className="mt-8 space-y-8">
        <Group
          title="1. Contractor pay"
          note="All unpaid contractor amounts, earliest due first — whichever customer the money came from."
          items={rec.contractor}
          empty={rec.notCovered.some((s) => s.category === "contractor") ? "This payment doesn't reach contractor pay." : "No contractor pay is owed."}
          action={<Link href={routes.payroll} className="text-sm text-blue-700 underline underline-offset-2">Open Payroll</Link>}
        />
        {rec.unpricedPayrollMinutes ? (
          <p className="-mt-6 text-sm text-red-700">{formatHours(rec.unpricedPayrollMinutes)} of approved hours have no rate yet, so they can&rsquo;t be included.</p>
        ) : null}
        <Group
          title="2. Bills & subscriptions"
          note={`Unpaid charges due through the next ${BILL_HORIZON_DAYS} days, earliest first.`}
          items={rec.bills}
          empty={contractorTotal >= rec.incomingCents ? "Nothing left after contractor pay." : "No unpaid bills in that window."}
          action={<Link href={"/bills"} className="text-sm text-blue-700 underline underline-offset-2">Open Bills</Link>}
        />
        <Card className={cn("p-4", rec.remainderCents > 0 ? "border-emerald-200 bg-emerald-50" : "")}>
          <div className="flex items-baseline justify-between gap-3">
            <p className="font-medium text-slate-900">3. Left to allocate</p>
            <p className="tabular text-xl font-semibold">{formatCents(rec.remainderCents)}</p>
          </div>
          <p className="mt-1 text-sm text-slate-600">{rec.remainderCents > 0 ? "Yours to decide." : "This payment is fully used by the suggestions above."}</p>
        </Card>

        {rec.notCovered.length ? (
          <details className="rounded-xl border border-slate-200 bg-white p-4">
            <summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium text-slate-800">
              Still unpaid after this payment ({rec.notCovered.length}) · {formatCents(rec.notCovered.reduce((s, x) => s + x.outstandingCents, 0))}
            </summary>
            <ul className="mt-2 divide-y divide-slate-200 text-sm">
              {rec.notCovered.map((s) => (
                <li key={s.key} className="flex justify-between gap-3 py-2">
                  <span>
                    {s.label} · {s.periodStart && s.periodEnd ? formatRange(s.periodStart, s.periodEnd) : s.detail}
                    <span className="block text-xs text-slate-500">Due {formatDate(s.dueDate)}</span>
                  </span>
                  <span className="tabular">{formatCents(s.outstandingCents)}</span>
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </div>
    </>
  );
}

function Stat({ label, value, tone, sub }: { label: string; value: string; tone?: "success" | "danger"; sub?: string }) {
  return (
    <Card className="p-4">
      <p className="text-sm text-slate-600">{label}</p>
      <p className={cn("tabular mt-1 text-xl font-semibold sm:text-2xl", tone === "success" && "text-emerald-700", tone === "danger" && "text-red-700")}>{value}</p>
      {sub ? <p className="text-xs text-slate-600">{sub}</p> : null}
    </Card>
  );
}

function Group({ title, note, items, empty, action }: { title: string; note: string; items: Suggestion[]; empty: string; action: React.ReactNode }) {
  const id = `grp-${title.replace(/\W+/g, "-")}`;
  return (
    <section aria-labelledby={id}>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id={id} className="text-sm font-semibold uppercase tracking-wide text-slate-600">{title}</h2>
        {action}
      </div>
      <p className="mb-2 text-xs text-slate-600">{note}</p>
      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-600">{empty}</p>
      ) : (
        <Card>
          <ul className="divide-y divide-slate-200">
            {items.map((s) => {
              const partial = s.suggestedCents < s.outstandingCents;
              return (
                <li key={s.key} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-slate-900">{s.label}</p>
                    <p className="text-sm text-slate-600">
                      {s.periodStart && s.periodEnd ? `${s.detail} · ${formatRange(s.periodStart, s.periodEnd)}` : s.detail}
                    </p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      <Badge>{KIND_LABEL[s.kind]}</Badge>
                      {s.overdue ? <Badge tone="danger">Overdue</Badge> : null}
                      {s.needsFinalization ? <Badge tone="warning">Needs finalization</Badge> : null}
                      {s.isEstimate ? <Badge tone="warning">Estimate</Badge> : null}
                      {partial ? <Badge tone="info">Partial</Badge> : null}
                    </div>
                  </div>
                  <div className="sm:w-56 sm:text-right">
                    <p className="tabular text-lg font-semibold text-slate-900">{formatCents(s.suggestedCents)}</p>
                    <p className="text-xs text-slate-600">
                      {partial ? `of ${formatCents(s.outstandingCents)} owed · ` : ""}due {formatDate(s.dueDate, { year: false })}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </section>
  );
}
