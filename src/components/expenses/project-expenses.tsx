"use client";

import { ExternalLink, Pencil, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { useNotice } from "@/components/layout/notice";
import { useBackoffice } from "@/lib/data/backoffice-provider";
import { FormError } from "@/lib/domain/billing";
import { draftForExpense } from "@/lib/domain/invoice-drafts";
import { formatDate } from "@/lib/domain/dates";
import { accountLabel } from "@/lib/domain/expenses";
import { assignmentLabel } from "@/lib/domain/labels";
import { centsToInput, formatCents, parseDollars } from "@/lib/domain/money";
import { DomainError } from "@/lib/domain/payroll";
import { canBillExpensesTo, EXPENSE_CATEGORIES, EXPENSE_CATEGORY_LABELS, expenseTotals, owedFor, owedKindFor, owedPaidCents, type ProjectExpenseInput } from "@/lib/domain/project-expenses";
import type { Adjustment, BackofficeData, ExpenseCategory, ExpensePayer, ProjectExpense } from "@/lib/domain/types";

function payerLabel(data: BackofficeData, x: ProjectExpense): string {
  if (x.paidBy.kind === "contractor") {
    const id = x.paidBy.contractorId;
    return `Paid by ${data.contractors.find((c) => c.id === id)?.name ?? "a contractor"}`;
  }
  const id = x.paidBy.accountId;
  const account = data.paymentAccounts.find((a) => a.id === id);
  return account ? accountLabel(account) : "Unknown account";
}

/** Whether a contractor has been paid back (or paid the fee) for this expense. */
function OwedBadge({ data, owed }: { data: BackofficeData; owed: Adjustment }) {
  const paid = owedPaidCents(data, owed);
  const what = owed.kind === "fixed_fee" ? "Fee" : "Reimbursement";
  if (paid >= owed.amountCents) return <Badge tone="success">{what} paid</Badge>;
  if (paid > 0) return <Badge tone="warning">{what} partly paid · {formatCents(owed.amountCents - paid)} left</Badge>;
  return <Badge tone="warning">{what} due {formatDate(owed.dueDate)}</Badge>;
}

const encodePayer = (p: ExpensePayer) => (p.kind === "account" ? `account:${p.accountId}` : `contractor:${p.contractorId}`);
function decodePayer(v: string): ExpensePayer {
  const [kind, ...rest] = v.split(":");
  const id = rest.join(":");
  return kind === "contractor" ? { kind: "contractor", contractorId: id } : { kind: "account", accountId: id };
}
import { routes } from "@/lib/routes";

/** A list of one-off expenses with totals, edit and delete. */
export function ProjectExpenseList({ data, expenses, showProject, emptyText }: { data: BackofficeData; expenses: ProjectExpense[]; showProject: boolean; emptyText: string }) {
  const { mutate } = useBackoffice();
  const notify = useNotice();
  if (!expenses.length) return <p className="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-600">{emptyText}</p>;
  const totals = expenseTotals(expenses);

  async function remove(x: ProjectExpense) {
    try {
      await mutate((r) => r.deleteProjectExpense(x.id));
      notify(`Deleted ${x.vendor}, ${formatCents(x.amountCents)}.`);
    } catch (err) {
      notify(err instanceof DomainError ? err.message : "Could not delete. Nothing was changed.");
    }
  }

  return (
    <Card>
      <ul className="divide-y divide-slate-200">
        {expenses.map((x) => {
          const owed = owedFor(data, x.id);
          return (
            <li key={x.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <p className="font-medium text-slate-900">{x.vendor}</p>
                {x.description ? <p className="text-sm text-slate-700">{x.description}</p> : null}
                <p className="text-xs text-slate-500">
                  {formatDate(x.date, { year: true })} · {payerLabel(data, x)}
                  {showProject ? (
                    <>
                      {" · "}
                      {x.projectId ? <Link className="underline-offset-2 hover:underline" href={routes.project(x.projectId)}>{assignmentLabel(data, x.projectId)}</Link> : "Company (overhead)"}
                    </>
                  ) : null}
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  <Badge>{EXPENSE_CATEGORY_LABELS[x.category]}</Badge>
                  {x.billable ? <Badge tone="info">Billable at cost</Badge> : null}
                  {owed ? <OwedBadge data={data} owed={owed} /> : null}
                  {(() => {
                    const d = draftForExpense(data, x.id);
                    return d ? <Badge tone={d.status === "draft" ? "warning" : "success"}>{d.status === "draft" ? "On an invoice draft" : "Invoiced"}</Badge> : null;
                  })()}
                  {x.receiptUrl ? (
                    <a href={x.receiptUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-blue-700 underline-offset-2 hover:underline">
                      Receipt <ExternalLink className="size-3" aria-hidden />
                    </a>
                  ) : null}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1 sm:flex-col sm:items-end">
                <p className="tabular font-semibold">{formatCents(x.amountCents)}</p>
                <div className="flex gap-1">
                  <EditProjectExpenseDialog data={data} expense={x} />
                  <Button variant="ghost" size="sm" aria-label={`Delete ${x.vendor} ${formatCents(x.amountCents)}`} onClick={() => remove(x)}>
                    <Trash2 className="size-4" aria-hidden />
                  </Button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap justify-between gap-2 border-t border-slate-200 p-4 text-sm">
        <span className="text-slate-600">
          {expenses.length} expense{expenses.length === 1 ? "" : "s"}
          {totals.billableCents ? ` · ${formatCents(totals.billableCents)} billable` : ""}
        </span>
        <span className="tabular font-semibold">Total {formatCents(totals.totalCents)}</span>
      </div>
    </Card>
  );
}

export function AddProjectExpenseDialog({ data, projectId, label = "Add expense" }: { data: BackofficeData; projectId?: string | null; label?: string }) {
  const [open, setOpen] = useState(false);
  const { today, mutate } = useBackoffice();
  const notify = useNotice();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary">
          <Plus className="size-4" aria-hidden />
          {label}
        </Button>
      </DialogTrigger>
      {open ? (
        <DialogContent title="Add an expense" description="A one-off cost on a project, or company overhead.">
          <ProjectExpenseForm
            data={data}
            defaultProjectId={projectId ?? null}
            submitLabel="Add expense"
            onSubmit={async (input) => {
              await mutate((r) => r.addProjectExpense(input, today));
              notify(`${input.vendor.trim()}, ${formatCents(input.amountCents)} added.`);
              setOpen(false);
            }}
          />
        </DialogContent>
      ) : null}
    </Dialog>
  );
}

function EditProjectExpenseDialog({ data, expense }: { data: BackofficeData; expense: ProjectExpense }) {
  const [open, setOpen] = useState(false);
  const { today, mutate } = useBackoffice();
  const notify = useNotice();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" aria-label={`Edit ${expense.vendor} ${formatCents(expense.amountCents)}`}>
          <Pencil className="size-4" aria-hidden />
        </Button>
      </DialogTrigger>
      {open ? (
        <DialogContent title={`Edit ${expense.vendor}`}>
          <ProjectExpenseForm
            data={data}
            expense={expense}
            submitLabel="Save changes"
            onSubmit={async (input) => {
              await mutate((r) => r.updateProjectExpense(expense.id, input, today));
              notify(`${input.vendor.trim()} saved.`);
              setOpen(false);
            }}
          />
        </DialogContent>
      ) : null}
    </Dialog>
  );
}

function ProjectExpenseForm({
  data,
  expense,
  defaultProjectId = null,
  submitLabel,
  onSubmit,
}: {
  data: BackofficeData;
  expense?: ProjectExpense;
  defaultProjectId?: string | null;
  submitLabel: string;
  onSubmit: (input: ProjectExpenseInput) => Promise<void>;
}) {
  const { today } = useBackoffice();
  const [v, setV] = useState({
    date: expense?.date ?? today,
    vendor: expense?.vendor ?? "",
    description: expense?.description ?? "",
    amount: expense ? centsToInput(expense.amountCents) : "",
    category: expense?.category ?? ("software" as ExpenseCategory),
    projectId: expense ? (expense.projectId ?? "") : (defaultProjectId ?? ""),
    billable: expense?.billable ?? false,
    payer: expense ? encodePayer(expense.paidBy) : data.paymentAccounts[0] ? `account:${data.paymentAccounts[0].id}` : "",
    receiptUrl: expense?.receiptUrl ?? "",
    notes: expense?.notes ?? "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setV((x) => ({ ...x, [k]: e.target.value }));
  const billableAllowed = canBillExpensesTo(data, v.projectId || null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const cents = parseDollars(v.amount);
    if (cents === null || cents <= 0) return setErrors({ amountCents: "Enter an amount greater than $0." });
    setSaving(true);
    try {
      await onSubmit({
        date: v.date,
        vendor: v.vendor,
        description: v.description,
        amountCents: cents,
        category: v.category,
        projectId: v.projectId || null,
        billable: billableAllowed && v.billable,
        paidBy: decodePayer(v.payer),
        receiptUrl: v.receiptUrl,
        notes: v.notes,
      });
    } catch (err) {
      setErrors(err instanceof FormError ? err.fields : { form: err instanceof DomainError ? err.message : "Could not save. Nothing was changed." });
      setSaving(false);
    }
  }

  const inv = (k: string) => ({ "aria-invalid": !!errors[k] });

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Vendor" htmlFor="pe-vendor" error={errors.vendor}>
          <Input id="pe-vendor" value={v.vendor} onChange={set("vendor")} autoComplete="off" {...inv("vendor")} />
        </Field>
        <Field label="Amount" htmlFor="pe-amount" error={errors.amountCents}>
          <Input id="pe-amount" inputMode="decimal" autoComplete="off" placeholder="0.00" value={v.amount} onChange={set("amount")} {...inv("amountCents")} />
        </Field>
      </div>
      <Field label="What was it for? (optional)" htmlFor="pe-description">
        <Input id="pe-description" value={v.description} onChange={set("description")} autoComplete="off" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Date" htmlFor="pe-date" error={errors.date}>
          <Input id="pe-date" type="date" value={v.date} onChange={set("date")} {...inv("date")} />
        </Field>
        <Field label="Category" htmlFor="pe-category" error={errors.category}>
          <Select id="pe-category" value={v.category} onChange={set("category")}>
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c} value={c}>{EXPENSE_CATEGORY_LABELS[c]}</option>
            ))}
          </Select>
        </Field>
        <Field label="Belongs to" htmlFor="pe-project" error={errors.projectId} hint="One project, or the company as overhead.">
          <Select id="pe-project" value={v.projectId} onChange={set("projectId")} {...inv("projectId")}>
            <option value="">Company (overhead)</option>
            {data.projects.map((p) => (
              <option key={p.id} value={p.id}>{assignmentLabel(data, p.id)}</option>
            ))}
          </Select>
        </Field>
        <Field
          label="Paid by"
          htmlFor="pe-account"
          error={errors.paidBy}
          hint={v.payer.startsWith("contractor:") ? (owedKindFor(v.category) === "fixed_fee" ? "They're owed this fee on their next payday. Counts as their earnings." : "They're owed a reimbursement on their next payday.") : undefined}
        >
          <Select id="pe-account" value={v.payer} onChange={set("payer")} {...inv("paidBy")}>
            {data.paymentAccounts.length === 0 && data.contractors.length === 0 ? <option value="">Add a card or account under Bills first</option> : null}
            {data.paymentAccounts.length ? (
              <optgroup label="Your cards and accounts">
                {data.paymentAccounts.map((a) => (
                  <option key={a.id} value={`account:${a.id}`}>{accountLabel(a)}</option>
                ))}
              </optgroup>
            ) : null}
            {data.contractors.length ? (
              <optgroup label="A contractor (owed back)">
                {data.contractors.map((c) => (
                  <option key={c.id} value={`contractor:${c.id}`}>{c.name}</option>
                ))}
              </optgroup>
            ) : null}
          </Select>
        </Field>
      </div>
      <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm">
        <input
          type="checkbox"
          className="mt-0.5 size-5 accent-slate-900 disabled:opacity-40"
          checked={billableAllowed && v.billable}
          disabled={!billableAllowed}
          onChange={(e) => setV((x) => ({ ...x, billable: e.target.checked }))}
        />
        <span>
          <span className="font-medium text-slate-900">Bill to the customer at cost</span>
          <span className="block text-slate-600">{billableAllowed ? "Goes on the project's next invoice. Either way it counts as project cost." : "Only expenses on a billable customer project can be billed."}</span>
        </span>
      </label>
      {errors.billable ? <p className="text-sm text-red-700" role="alert">{errors.billable}</p> : null}
      <Field label="Receipt link (optional)" htmlFor="pe-receipt" error={errors.receiptUrl} hint="For example a Google Drive link.">
        <Input id="pe-receipt" type="url" inputMode="url" value={v.receiptUrl} onChange={set("receiptUrl")} autoComplete="off" spellCheck={false} {...inv("receiptUrl")} />
      </Field>
      <Field label="Notes (optional)" htmlFor="pe-notes">
        <Textarea id="pe-notes" rows={2} value={v.notes} onChange={set("notes")} />
      </Field>
      {errors.form ? <p className="rounded-lg bg-red-50 p-3 text-sm text-red-800" role="alert">{errors.form}</p> : null}
      <div className="flex justify-end border-t border-slate-200 pt-4">
        <Button type="submit" disabled={saving}>{saving ? "Saving…" : submitLabel}</Button>
      </div>
    </form>
  );
}
