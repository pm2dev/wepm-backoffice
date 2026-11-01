"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Select } from "@/components/ui/field";
import { EmptyState, ErrorState, LoadingState, PageHeader } from "@/components/ui/states";
import { useNotice } from "@/components/layout/notice";
import { useBackoffice } from "@/lib/data/backoffice-provider";
import { addMonthsToKey, formatMonth, monthKey } from "@/lib/domain/dates";
import { accountLabel, monthReview, type ChargeView } from "@/lib/domain/expenses";
import { formatCents } from "@/lib/domain/money";
import type { BackofficeData } from "@/lib/domain/types";
import { cn } from "@/lib/utils";
import { BillsTabs } from "./bills-tabs";
import { AmountDialog, MarkPaidDialog } from "./charge-dialogs";
import { ChargeRow } from "./charge-row";

export function MonthlyReviewPage() {
  const { state, reload } = useBackoffice();
  return (
    <>
      <PageHeader title="Bills & subscriptions" description="Verify charges at month-end against each card or account statement. Autopay charges stay unpaid until you confirm them." />
      <BillsTabs />
      {state.status === "loading" ? <LoadingState /> : null}
      {state.status === "error" ? <ErrorState message={state.message} action={<Button variant="secondary" onClick={() => void reload()}>Try again</Button>} /> : null}
      {state.status === "ready" ? <Review data={state.data} /> : null}
    </>
  );
}

function Review({ data }: { data: BackofficeData }) {
  const { today, mutate } = useBackoffice();
  const notify = useNotice();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const month = /^\d{4}-\d{2}$/.test(params.get("month") ?? "") ? params.get("month")! : monthKey(today);
  const accountId = data.paymentAccounts.some((a) => a.id === params.get("account")) ? params.get("account")! : "";
  const review = useMemo(() => monthReview(data, month, accountId || undefined), [data, month, accountId]);
  const [selected, setSelected] = useState<string[]>([]);
  const [paying, setPaying] = useState<ChargeView[] | null>(null);
  const [amountFor, setAmountFor] = useState<ChargeView | null>(null);

  const all = [...review.carryover, ...review.current];
  const unpaidKeys = new Set(all.filter((c) => !c.paid).map((c) => c.key));
  const activeSelection = selected.filter((k) => unpaidKeys.has(k));
  const selectedCharges = all.filter((c) => activeSelection.includes(c.key));

  function setQuery(next: { month?: string; account?: string }) {
    const q = new URLSearchParams(params.toString());
    if (next.month !== undefined) q.set("month", next.month);
    if (next.account !== undefined) {
      if (next.account) q.set("account", next.account);
      else q.delete("account");
    }
    setSelected([]);
    router.replace(`${pathname}?${q.toString()}`, { scroll: false });
  }

  async function markUnpaid(c: ChargeView) {
    await mutate((r) => r.setChargesPaid([c.key], null));
    notify(`${c.vendor} (${c.dueDate}) marked unpaid.`);
  }

  const rowProps = (c: ChargeView) => ({
    c,
    data,
    today,
    selectable: true,
    checked: activeSelection.includes(c.key),
    onToggle: (on: boolean) => setSelected((s) => (on ? [...s.filter((k) => unpaidKeys.has(k)), c.key] : s.filter((k) => k !== c.key))),
    onEnterAmount: () => setAmountFor(c),
    onTogglePaid: () => (c.paid ? void markUnpaid(c) : setPaying([c])),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-center gap-1" role="group" aria-label="Month">
          <Button variant="ghost" size="sm" aria-label="Previous month" onClick={() => setQuery({ month: addMonthsToKey(month, -1) })}>
            <ChevronLeft className="size-5" aria-hidden />
          </Button>
          <h2 className="min-w-40 text-center text-lg font-semibold text-slate-900" aria-live="polite">{formatMonth(month)}</h2>
          <Button variant="ghost" size="sm" aria-label="Next month" onClick={() => setQuery({ month: addMonthsToKey(month, 1) })}>
            <ChevronRight className="size-5" aria-hidden />
          </Button>
          {month !== monthKey(today) ? (
            <Button variant="ghost" size="sm" onClick={() => setQuery({ month: monthKey(today) })}>This month</Button>
          ) : null}
        </div>
        <div className="sm:w-72">
          <Field label="Card or account" htmlFor="review-account">
            <Select id="review-account" value={accountId} onChange={(e) => setQuery({ account: e.target.value })}>
              <option value="">All cards and accounts</option>
              {data.paymentAccounts.map((a) => (
                <option key={a.id} value={a.id}>{accountLabel(a)}</option>
              ))}
            </Select>
          </Field>
        </div>
      </div>

      <section aria-label="Month summary" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={`Due in ${formatMonth(month).split(" ")[0]}`} value={formatCents(review.totalCents)} sub={`${review.current.length} charge${review.current.length === 1 ? "" : "s"}`} />
        <Stat label="Paid" value={formatCents(review.paidCents)} />
        <Stat label="Unpaid" value={formatCents(review.unpaidCents)} sub={review.carryover.length ? `Includes ${review.carryover.length} carried over` : undefined} tone={review.unpaidCents ? "warning" : undefined} />
        <Stat label="Unpaid estimates" value={formatCents(review.estimatedCents)} sub="Replace with actuals when known" />
      </section>

      {review.carryover.length ? (
        <Section title="Carried over" note="Unpaid from earlier months" items={review.carryover} render={(c) => <ChargeRow key={c.key} {...rowProps(c)} />} />
      ) : null}
      {review.current.length === 0 ? (
        <EmptyState title={`Nothing due in ${formatMonth(month)}`}>{accountId ? "for this card or account." : null}</EmptyState>
      ) : (
        <Section title={`Due in ${formatMonth(month)}`} items={review.current} render={(c) => <ChargeRow key={c.key} {...rowProps(c)} />} />
      )}

      {activeSelection.length ? (
        <div className="sticky bottom-4 z-20 pb-[env(safe-area-inset-bottom)]">
          <Card className="flex flex-col gap-3 border-slate-300 p-3 shadow-lg sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-slate-700" aria-live="polite">
              <strong className="text-slate-900">{activeSelection.length}</strong> selected · <strong className="tabular text-slate-900">{formatCents(selectedCharges.reduce((s, c) => s + c.amountCents, 0))}</strong>
            </p>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setSelected([])}>Clear</Button>
              <Button onClick={() => setPaying(selectedCharges)}>Mark paid</Button>
            </div>
          </Card>
        </div>
      ) : null}

      {paying ? <MarkPaidDialog charges={paying} onClose={() => setPaying(null)} onDone={() => setSelected([])} /> : null}
      {amountFor ? <AmountDialog charge={amountFor} onClose={() => setAmountFor(null)} /> : null}
    </div>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "warning" }) {
  return (
    <Card className="p-4">
      <p className="text-sm text-slate-600">{label}</p>
      <p className={cn("tabular mt-1 text-xl font-semibold sm:text-2xl", tone === "warning" ? "text-amber-800" : "text-slate-900")}>{value}</p>
      {sub ? <p className="mt-1 text-xs text-slate-600">{sub}</p> : null}
    </Card>
  );
}

function Section({ title, note, items, render }: { title: string; note?: string; items: ChargeView[]; render: (c: ChargeView) => React.ReactNode }) {
  const id = `sec-${title.replace(/\W+/g, "-").toLowerCase()}`;
  return (
    <section aria-labelledby={id}>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h2 id={id} className="text-sm font-semibold uppercase tracking-wide text-slate-600">
          {title} <span className="font-normal normal-case">({items.length}){note ? ` · ${note}` : ""}</span>
        </h2>
        <span className="tabular text-sm text-slate-600">{formatCents(items.reduce((s, c) => s + c.amountCents, 0))}</span>
      </div>
      <Card>
        <ul className="divide-y divide-slate-200">{items.map(render)}</ul>
      </Card>
    </section>
  );
}
