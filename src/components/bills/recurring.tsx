"use client";

import { Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogTrigger, useOpenerElement } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/field";
import { EmptyState, ErrorState, LoadingState, PageHeader } from "@/components/ui/states";
import { useNotice } from "@/components/layout/notice";
import { useBackoffice } from "@/lib/data/backoffice-provider";
import { formatDate, isISODate } from "@/lib/domain/dates";
import { accountLabel, FREQUENCY_LABEL, nextChargeDate } from "@/lib/domain/expenses";
import { assignmentLabel } from "@/lib/domain/labels";
import { formatCents } from "@/lib/domain/money";
import { DomainError } from "@/lib/domain/payroll";
import type { BackofficeData, RecurringExpense } from "@/lib/domain/types";
import { BillsTabs } from "./bills-tabs";
import { ExpenseForm } from "./expense-form";

const MONTHS_PER: Record<RecurringExpense["frequency"], number | null> = { monthly: 1, quarterly: 3, annual: 12, one_time: null };

export function RecurringPage() {
  const { state } = useBackoffice();
  return (
    <>
      <PageHeader
        title="Bills & subscriptions"
        description="Everything you pay on a schedule. Edit or stop future charges here; past charges are always kept."
        actions={state.status === "ready" ? <AddExpenseDialog data={state.data} /> : null}
      />
      <BillsTabs />
      {state.status === "loading" ? <LoadingState /> : null}
      {state.status === "error" ? <ErrorState message={state.message} /> : null}
      {state.status === "ready" ? <List data={state.data} /> : null}
    </>
  );
}

function List({ data }: { data: BackofficeData }) {
  const { today } = useBackoffice();
  const rows = useMemo(
    () =>
      data.expenses
        .map((e) => ({ e, next: nextChargeDate(e, today) }))
        .sort((a, b) => (a.next ?? "9999") .localeCompare(b.next ?? "9999") || a.e.vendor.localeCompare(b.e.vendor)),
    [data.expenses, today],
  );
  const active = rows.filter((r) => r.next);
  const ended = rows.filter((r) => !r.next);
  const [editing, setEditing] = useState<RecurringExpense | null>(null);
  const [stopping, setStopping] = useState<RecurringExpense | null>(null);
  const { mutate } = useBackoffice();
  const notify = useNotice();

  const recurringMonthly = active
    .filter((r) => MONTHS_PER[r.e.frequency])
    .reduce((s, r) => s + Math.round(r.e.amountCents / MONTHS_PER[r.e.frequency]!), 0);
  const subscriptionsMonthly = active
    .filter((r) => r.e.type === "subscription" && MONTHS_PER[r.e.frequency])
    .reduce((s, r) => s + Math.round(r.e.amountCents / MONTHS_PER[r.e.frequency]!), 0);

  const row = ({ e, next }: { e: RecurringExpense; next: string | null }) => {
    const account = data.paymentAccounts.find((a) => a.id === e.accountId);
    const per = MONTHS_PER[e.frequency];
    return (
      <li key={e.id} className="flex flex-col gap-3 p-4 xl:flex-row xl:items-center">
        <div className="min-w-0 flex-1">
          <p className="font-medium text-slate-900">{e.vendor}</p>
          <p className="text-sm text-slate-600">
            {assignmentLabel(data, e.projectId)} · {account ? accountLabel(account) : "Unknown account"}
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <Badge tone={e.type === "subscription" ? "info" : "neutral"}>{e.type === "subscription" ? "Subscription" : "Bill"}</Badge>
            <Badge>{FREQUENCY_LABEL[e.frequency]}</Badge>
            <Badge>{e.autopay ? "Autopay" : "Manual"}</Badge>
            {next ? null : <Badge>{e.endDate ? `Ended ${formatDate(e.endDate)}` : "Complete"}</Badge>}
          </div>
          {e.notes ? <p className="mt-1 text-xs text-slate-500">{e.notes}</p> : null}
        </div>
        <div className="xl:w-52 xl:shrink-0 xl:text-right">
          <p className="tabular text-lg font-semibold text-slate-900">
            {formatCents(e.amountCents)}
            {e.amountKind === "variable" ? <span className="ml-2 align-middle text-xs font-medium text-amber-800">Estimate</span> : null}
          </p>
          {per && per > 1 ? <p className="tabular text-xs text-slate-600">≈ {formatCents(Math.round(e.amountCents / per))}/month</p> : null}
          <p className="text-sm text-slate-600">{next ? `Next ${formatDate(next, { weekday: true })}` : "No future charges"}</p>
        </div>
        <div className="flex gap-2 xl:w-48 xl:shrink-0 xl:justify-end">
          <Button variant="secondary" size="sm" onClick={() => setEditing(e)}>
            Edit<span className="sr-only"> {e.vendor}</span>
          </Button>
          {next ? (
            <Button variant="ghost" size="sm" onClick={() => setStopping(e)}>
              Stop<span className="sr-only"> {e.vendor}</span>
            </Button>
          ) : e.endDate ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                await mutate((r) => r.stopExpense(e.id, null));
                notify(`${e.vendor} resumed.`);
              }}
            >
              Resume<span className="sr-only"> {e.vendor}</span>
            </Button>
          ) : null}
        </div>
      </li>
    );
  };

  return (
    <div className="space-y-6">
      <section aria-label="Commitments" className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Card className="p-4">
          <p className="text-sm text-slate-600">Active</p>
          <p className="tabular mt-1 text-2xl font-semibold">{active.length}</p>
          <p className="text-xs text-slate-600">{active.filter((r) => r.e.type === "subscription").length} subscriptions</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-slate-600">Subscriptions per month</p>
          <p className="tabular mt-1 text-2xl font-semibold">{formatCents(subscriptionsMonthly)}</p>
          <p className="text-xs text-slate-600">Quarterly/annual spread monthly</p>
        </Card>
        <Card className="col-span-2 p-4 lg:col-span-1">
          <p className="text-sm text-slate-600">All recurring per month</p>
          <p className="tabular mt-1 text-2xl font-semibold">{formatCents(recurringMonthly)}</p>
          <p className="text-xs text-slate-600">Uses estimates for variable bills</p>
        </Card>
      </section>

      {rows.length === 0 ? (
        <EmptyState title="No bills or subscriptions yet">Add the first one to start tracking charges.</EmptyState>
      ) : (
        <>
          <section aria-labelledby="active-heading">
            <h2 id="active-heading" className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-600">Active ({active.length})</h2>
            <Card>
              <ul className="divide-y divide-slate-200">{active.map(row)}</ul>
            </Card>
          </section>
          {ended.length ? (
            <section aria-labelledby="ended-heading">
              <h2 id="ended-heading" className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-600">Stopped or complete ({ended.length})</h2>
              <Card>
                <ul className="divide-y divide-slate-200">{ended.map(row)}</ul>
              </Card>
            </section>
          ) : null}
        </>
      )}

      {editing ? <EditExpenseDialog data={data} expense={editing} onClose={() => setEditing(null)} /> : null}
      {stopping ? <StopDialog expense={stopping} onClose={() => setStopping(null)} /> : null}
    </div>
  );
}

function AddExpenseDialog({ data }: { data: BackofficeData }) {
  const [open, setOpen] = useState(false);
  const { today, mutate } = useBackoffice();
  const notify = useNotice();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="size-4" aria-hidden />
          Add bill or subscription
        </Button>
      </DialogTrigger>
      {open ? (
        <DialogContent title="Add a bill or subscription">
          <ExpenseForm
            data={data}
            submitLabel="Add"
            onSubmit={async (input) => {
              const e = await mutate((r) => r.addExpense(input, today));
              notify(`${e.vendor} added.`);
              setOpen(false);
            }}
          />
        </DialogContent>
      ) : null}
    </Dialog>
  );
}

function EditExpenseDialog({ data, expense, onClose }: { data: BackofficeData; expense: RecurringExpense; onClose: () => void }) {
  const { today, mutate } = useBackoffice();
  const notify = useNotice();
  const opener = useOpenerElement();
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={`Edit ${expense.vendor}`} returnFocusTo={opener}>
        <ExpenseForm
          data={data}
          expense={expense}
          submitLabel="Save changes"
          onSubmit={async (input) => {
            await mutate((r) => r.updateExpense(expense.id, input, today));
            notify(`${input.vendor} saved. Earlier charges are unchanged.`);
            onClose();
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

function StopDialog({ expense, onClose }: { expense: RecurringExpense; onClose: () => void }) {
  const { today, mutate } = useBackoffice();
  const notify = useNotice();
  const opener = useOpenerElement();
  const [endDate, setEndDate] = useState(today);
  const [error, setError] = useState<string | null>(null);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title={`Stop ${expense.vendor}`}
        description="Records that it no longer charges after a date. Cancel the subscription with the vendor yourself — Backoffice doesn't contact vendors."
        returnFocusTo={opener}
      >
        <form
          className="space-y-4"
          noValidate
          onSubmit={async (e) => {
            e.preventDefault();
            if (!isISODate(endDate)) return setError("Enter the last date it may charge.");
            try {
              await mutate((r) => r.stopExpense(expense.id, endDate));
              notify(`${expense.vendor} stopped after ${formatDate(endDate)}.`);
              onClose();
            } catch (err) {
              setError(err instanceof DomainError ? err.message : "Could not save.");
            }
          }}
        >
          <Field label="Last date it may charge" htmlFor="stop-date" error={error ?? undefined} hint="Charges up to and including this date are kept, paid or not.">
            <Input id="stop-date" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </Field>
          <div className="flex justify-end border-t border-slate-200 pt-4">
            <Button type="submit" variant="danger">Stop future charges</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
