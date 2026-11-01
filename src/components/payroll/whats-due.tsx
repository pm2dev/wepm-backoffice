"use client";

import { AlertTriangle, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, ErrorState, LoadingState, PageHeader } from "@/components/ui/states";
import { useBackoffice } from "@/lib/data/backoffice-provider";
import { formatDate } from "@/lib/domain/dates";
import { formatCents, formatHours } from "@/lib/domain/money";
import { isPayable, totalOutstanding, whatsDue, type Obligation } from "@/lib/domain/payroll";
import type { BackofficeData, Contractor } from "@/lib/domain/types";
import { cn } from "@/lib/utils";
import { AddAdjustmentDialog } from "./add-adjustment-dialog";
import { dueText, KindBadge, obligationDescription, StatusBadge } from "./labels";
import { PayrollTabs } from "./payroll-tabs";
import { RecordPaymentDialog } from "./record-payment-dialog";

export function WhatsDuePage() {
  const { state, reload } = useBackoffice();
  return (
    <>
      <PageHeader
        title="Payroll"
        description="Everything you owe contractors, overdue first. Finalizing confirms the amount; it never sends money or marks anything paid."
        actions={state.status === "ready" ? <AddAdjustmentDialog contractors={state.data.contractors} /> : null}
      />
      <PayrollTabs />
      {state.status === "loading" ? <LoadingState /> : null}
      {state.status === "error" ? (
        <ErrorState message={state.message} action={<Button variant="secondary" onClick={() => void reload()}>Try again</Button>} />
      ) : null}
      {state.status === "ready" ? <WhatsDueContent data={state.data} /> : null}
    </>
  );
}

function WhatsDueContent({ data }: { data: BackofficeData }) {
  const { today } = useBackoffice();
  const due = useMemo(() => whatsDue(data, today), [data, today]);
  const contractors = useMemo(() => new Map(data.contractors.map((c) => [c.id, c])), [data.contractors]);
  const [selected, setSelected] = useState<string[]>([]);
  const [payFor, setPayFor] = useState<{ contractor: Contractor; preselected: string[] } | null>(null);

  // Drop selections that are no longer payable (e.g. after recording a payment).
  const payableUids = new Set(due.filter(isPayable).map((o) => o.uid));
  const activeSelection = selected.filter((uid) => payableUids.has(uid));
  const selectedContractorId = due.find((o) => o.uid === activeSelection[0])?.contractorId;
  const selectionTotal = due.filter((o) => activeSelection.includes(o.uid)).reduce((s, o) => s + o.outstandingCents, 0);

  const overdue = due.filter((o) => o.overdue);
  const upcoming = due.filter((o) => !o.overdue);
  const missingRateMinutes = due.reduce((s, o) => s + (o.missingRateMinutes ?? 0), 0);
  const needsFinalization = due.filter((o) => o.status === "needs_finalization" || o.status === "missing_rate").length;

  function toggle(o: Obligation, on: boolean) {
    setSelected((cur) => {
      const valid = cur.filter((uid) => payableUids.has(uid));
      if (!on) return valid.filter((u) => u !== o.uid);
      const sameContractor = valid.filter((uid) => due.find((x) => x.uid === uid)?.contractorId === o.contractorId);
      return [...sameContractor, o.uid];
    });
  }

  function openPayment(contractorId: string, preselected: string[]) {
    const contractor = contractors.get(contractorId);
    if (contractor) setPayFor({ contractor, preselected });
  }

  return (
    <div className="space-y-6">
      <section aria-label="Summary" className="grid gap-3 sm:grid-cols-3">
        <SummaryCard label="Total outstanding" value={formatCents(totalOutstanding(due))}>
          {missingRateMinutes > 0 ? (
            <span className="text-red-700">+ {formatHours(missingRateMinutes)} with no rate yet</span>
          ) : (
            `${due.length} unpaid record${due.length === 1 ? "" : "s"}`
          )}
        </SummaryCard>
        <SummaryCard label="Overdue" value={formatCents(totalOutstanding(overdue))} tone={overdue.length ? "danger" : undefined}>
          {overdue.length} record{overdue.length === 1 ? "" : "s"}
        </SummaryCard>
        <SummaryCard label="Needs finalization" value={String(needsFinalization)}>
          Review hours and rates before paying
        </SummaryCard>
      </section>

      <ExceptionsNotice data={data} />

      {due.length === 0 ? (
        <EmptyState title="Nothing is owed right now">New approved hours from wepm.app will appear here automatically.</EmptyState>
      ) : (
        <>
          <ObligationSection
            title="Overdue"
            items={overdue}
            empty="Nothing overdue."
            {...{ contractors, today, activeSelection, selectedContractorId, toggle, openPayment }}
          />
          <ObligationSection
            title="Upcoming"
            items={upcoming}
            empty="No upcoming paydays with recorded amounts."
            {...{ contractors, today, activeSelection, selectedContractorId, toggle, openPayment }}
          />
        </>
      )}

      {activeSelection.length > 0 && selectedContractorId ? (
        <div className="sticky bottom-4 z-20 pb-[env(safe-area-inset-bottom)]">
          <Card className="flex flex-col gap-3 border-slate-300 p-3 shadow-lg sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-slate-700" aria-live="polite">
              <strong className="text-slate-900">{activeSelection.length}</strong> selected for {contractors.get(selectedContractorId)?.name} ·{" "}
              <strong className="tabular text-slate-900">{formatCents(selectionTotal)}</strong>
            </p>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setSelected([])}>
                Clear
              </Button>
              <Button onClick={() => openPayment(selectedContractorId, activeSelection)}>Record payment</Button>
            </div>
          </Card>
        </div>
      ) : null}

      {payFor ? (
        <RecordPaymentDialog
          open
          onOpenChange={(open) => !open && setPayFor(null)}
          contractor={payFor.contractor}
          obligations={due.filter((o) => o.contractorId === payFor.contractor.id)}
          preselected={payFor.preselected}
          onRecorded={() => setSelected([])}
        />
      ) : null}
    </div>
  );
}

function SummaryCard({ label, value, tone, children }: { label: string; value: string; tone?: "danger"; children: React.ReactNode }) {
  return (
    <Card className="p-4">
      <p className="text-sm text-slate-600">{label}</p>
      <p className={cn("tabular mt-1 text-2xl font-semibold", tone === "danger" ? "text-red-700" : "text-slate-900")}>{value}</p>
      <p className="mt-1 text-xs text-slate-600">{children}</p>
    </Card>
  );
}

function ExceptionsNotice({ data }: { data: BackofficeData }) {
  if (data.timeExceptions.length === 0) return null;
  const n = data.timeExceptions.length;
  return (
    <Card className="border-amber-300 bg-amber-50 p-4">
      <details>
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-3 text-sm text-amber-950 [&::-webkit-details-marker]:hidden">
          <AlertTriangle className="size-5 shrink-0 text-amber-700" aria-hidden />
          <span className="flex-1">
            <strong>
              {n} approved time entr{n === 1 ? "y needs" : "ies need"} attention.
            </strong>{" "}
            {n === 1 ? "It is" : "They are"} not included in payroll or billing until mapped.
          </span>
          <span className="text-amber-800 underline underline-offset-2">Details</span>
        </summary>
        <ul className="mt-3 space-y-2 text-sm text-amber-950">
          {data.timeExceptions.map((x) => (
            <li key={x.id} className="rounded-lg bg-white/70 p-3">
              <p className="font-medium">{x.reason}</p>
              <p className="text-amber-900">
                {formatDate(x.record.workDate)} · {formatHours(x.record.minutes)} · {x.record.task} · source entry {x.record.sourceEntryId}
              </p>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-amber-900">Contractors are matched by the wepm.app person ID on their profile; project mapping arrives with the Projects page.</p>
      </details>
    </Card>
  );
}

function ObligationSection({
  title,
  items,
  empty,
  contractors,
  today,
  activeSelection,
  selectedContractorId,
  toggle,
  openPayment,
}: {
  title: string;
  items: Obligation[];
  empty: string;
  contractors: Map<string, Contractor>;
  today: string;
  activeSelection: string[];
  selectedContractorId?: string;
  toggle: (o: Obligation, on: boolean) => void;
  openPayment: (contractorId: string, preselected: string[]) => void;
}) {
  const headingId = `section-${title.toLowerCase()}`;
  return (
    <section aria-labelledby={headingId}>
      <div className="mb-2 flex items-baseline justify-between">
        <h2 id={headingId} className="text-sm font-semibold uppercase tracking-wide text-slate-600">
          {title} <span className="font-normal normal-case">({items.length})</span>
        </h2>
        {items.length ? <span className="tabular text-sm text-slate-600">{formatCents(totalOutstanding(items))}</span> : null}
      </div>
      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-600">{empty}</p>
      ) : (
        <Card>
          <ul className="divide-y divide-slate-200">
            {items.map((o) => (
              <ObligationRow
                key={o.uid}
                o={o}
                contractor={contractors.get(o.contractorId)}
                today={today}
                checked={activeSelection.includes(o.uid)}
                otherContractorSelected={!!selectedContractorId && selectedContractorId !== o.contractorId}
                onToggle={(on) => toggle(o, on)}
                onPay={() => openPayment(o.contractorId, [o.uid])}
              />
            ))}
          </ul>
        </Card>
      )}
    </section>
  );
}

function ObligationRow({
  o,
  contractor,
  today,
  checked,
  otherContractorSelected,
  onToggle,
  onPay,
}: {
  o: Obligation;
  contractor?: Contractor;
  today: string;
  checked: boolean;
  otherContractorSelected: boolean;
  onToggle: (on: boolean) => void;
  onPay: () => void;
}) {
  const payable = isPayable(o);
  const name = contractor?.name ?? "Unknown contractor";
  const checkId = `sel-${o.uid}`;
  const reviewHref = o.draftKey ? `/payroll/draft/${encodeURIComponent(o.draftKey)}` : o.kind === "payroll" && o.ref ? `/payroll/records/${o.ref.id}` : null;

  return (
    <li className="flex gap-3 p-4">
      <div className="flex w-6 shrink-0 justify-center pt-0.5">
        {payable ? (
          <>
            <input
              id={checkId}
              type="checkbox"
              className="size-5 accent-slate-900 disabled:opacity-40"
              checked={checked}
              disabled={otherContractorSelected}
              onChange={(e) => onToggle(e.target.checked)}
              aria-describedby={otherContractorSelected ? `${checkId}-why` : undefined}
            />
            <label htmlFor={checkId} className="sr-only">
              Select {name} {obligationDescription(o)} for payment
            </label>
            {otherContractorSelected ? (
              <span id={`${checkId}-why`} className="sr-only">
                A payment can only cover one contractor. Clear the current selection first.
              </span>
            ) : null}
          </>
        ) : null}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-3 xl:flex-row xl:items-center">
        <div className="min-w-0 flex-1">
          <p className="font-medium text-slate-900">{name}</p>
          <p className="text-sm text-slate-700">{obligationDescription(o)}</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <KindBadge kind={o.kind} />
            <StatusBadge status={o.status} />
            {o.overdue ? <Badge tone="danger">Overdue</Badge> : null}
            {o.lateApproved ? <Badge tone="info">Approved after finalization</Badge> : null}
          </div>
        </div>

        <div className="flex flex-col gap-0.5 xl:w-64 xl:shrink-0 xl:text-right">
          <p className="tabular text-lg font-semibold text-slate-900">
            {formatCents(o.outstandingCents)}
            {o.status === "missing_rate" ? <span className="text-sm font-normal text-red-700"> + {formatHours(o.missingRateMinutes ?? 0)} unpriced</span> : null}
          </p>
          {o.paidCents > 0 ? <p className="tabular text-xs text-slate-600">of {formatCents(o.amountCents)} · {formatCents(o.paidCents)} paid</p> : null}
          <p className={cn("text-sm", o.overdue ? "font-medium text-red-700" : "text-slate-600")}>{dueText(o.dueDate, today)}</p>
        </div>

        <div className="flex gap-2 xl:min-w-44 xl:shrink-0 xl:justify-end">
          {o.ref === null && reviewHref ? (
            <Link
              href={reviewHref}
              className="inline-flex min-h-11 flex-1 items-center justify-center gap-1 rounded-lg bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 xl:flex-none"
            >
              {o.status === "missing_rate" ? "Review" : "Review & finalize"}
              <ChevronRight className="size-4" aria-hidden />
              <span className="sr-only">
                {" "}
                {name} {obligationDescription(o)}
              </span>
            </Link>
          ) : (
            <>
              {reviewHref ? (
                <Link
                  href={reviewHref}
                  className="inline-flex min-h-11 items-center justify-center rounded-lg px-3 text-sm font-medium text-slate-700 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-blue-600"
                >
                  Details<span className="sr-only"> for {name} {obligationDescription(o)}</span>
                </Link>
              ) : null}
              <Button variant="secondary" onClick={onPay} className="flex-1 xl:flex-none">
                Record payment<span className="sr-only"> for {name} {obligationDescription(o)}</span>
              </Button>
            </>
          )}
        </div>
      </div>
    </li>
  );
}
