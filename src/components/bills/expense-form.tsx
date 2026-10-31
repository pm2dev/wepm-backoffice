"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { useBackoffice } from "@/lib/data/backoffice-provider";
import { accountLabel, ExpenseValidationError, FREQUENCY_LABEL, type ExpenseErrors, type ExpenseInput } from "@/lib/domain/expenses";
import { assignmentLabel } from "@/lib/domain/labels";
import { centsToInput, parseDollars } from "@/lib/domain/money";
import { DomainError } from "@/lib/domain/payroll";
import type { BackofficeData, ExpenseFrequency, RecurringExpense } from "@/lib/domain/types";

export function ExpenseForm({ data, expense, submitLabel, onSubmit }: { data: BackofficeData; expense?: RecurringExpense; submitLabel: string; onSubmit: (input: ExpenseInput) => Promise<void> }) {
  const { today } = useBackoffice();
  const [v, setV] = useState({
    vendor: expense?.vendor ?? "",
    type: expense?.type ?? "subscription",
    projectId: expense?.projectId ?? "",
    frequency: expense?.frequency ?? ("monthly" as ExpenseFrequency),
    firstDueDate: expense?.firstDueDate ?? today,
    amountKind: expense?.amountKind ?? "fixed",
    amount: expense ? centsToInput(expense.amountCents) : "",
    autopay: expense?.autopay ?? true,
    accountId: expense?.accountId ?? data.paymentAccounts[0]?.id ?? "",
    notes: expense?.notes ?? "",
  });
  const [errors, setErrors] = useState<ExpenseErrors & { form?: string }>({});
  const [saving, setSaving] = useState(false);
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setV((x) => ({ ...x, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const cents = parseDollars(v.amount);
    if (cents === null) {
      setErrors({ amountCents: v.amountKind === "variable" ? "Enter an estimate for planning." : "Enter the amount." });
      return;
    }
    setSaving(true);
    try {
      await onSubmit({
        vendor: v.vendor,
        type: v.type as RecurringExpense["type"],
        projectId: v.projectId || null,
        frequency: v.frequency,
        firstDueDate: v.firstDueDate,
        endDate: expense?.endDate,
        amountKind: v.amountKind as RecurringExpense["amountKind"],
        amountCents: cents,
        autopay: v.autopay,
        accountId: v.accountId,
        notes: v.notes,
      });
    } catch (err) {
      setErrors(err instanceof ExpenseValidationError ? err.fields : { form: err instanceof DomainError ? err.message : "Could not save. Nothing was changed." });
      setSaving(false);
    }
  }

  const inv = (k: keyof ExpenseErrors) => ({ "aria-invalid": !!errors[k] });

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <Field label="Vendor or bill name" htmlFor="ex-vendor" error={errors.vendor}>
        <Input id="ex-vendor" value={v.vendor} onChange={set("vendor")} autoComplete="off" {...inv("vendor")} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Type" htmlFor="ex-type">
          <Select id="ex-type" value={v.type} onChange={set("type")}>
            <option value="subscription">Subscription</option>
            <option value="bill">Bill</option>
          </Select>
        </Field>
        <Field label="Belongs to" htmlFor="ex-project" error={errors.projectId} hint="The company or exactly one project.">
          <Select id="ex-project" value={v.projectId} onChange={set("projectId")} {...inv("projectId")}>
            <option value="">Company</option>
            {data.projects.map((p) => (
              <option key={p.id} value={p.id}>{assignmentLabel(data, p.id)}</option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Frequency" htmlFor="ex-frequency">
          <Select id="ex-frequency" value={v.frequency} onChange={set("frequency")}>
            {Object.entries(FREQUENCY_LABEL).map(([k, l]) => (
              <option key={k} value={k}>{l}</option>
            ))}
          </Select>
        </Field>
        <Field
          label={v.frequency === "one_time" ? "Due date" : expense ? "Schedule anchor date" : "Next due or renewal date"}
          htmlFor="ex-date"
          error={errors.firstDueDate}
          hint={v.frequency === "one_time" ? undefined : "Later charges fall on the same day of the month (or the month's last day)."}
        >
          <Input id="ex-date" type="date" value={v.firstDueDate} onChange={set("firstDueDate")} {...inv("firstDueDate")} />
        </Field>
      </div>
      <fieldset>
        <legend className="mb-1.5 text-sm font-medium text-slate-800">Amount</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex gap-2">
            {(["fixed", "variable"] as const).map((k) => (
              <label key={k} className="flex min-h-11 flex-1 cursor-pointer items-center gap-2 rounded-lg border border-slate-300 px-3 text-sm has-checked:border-slate-900 has-checked:bg-slate-50">
                <input type="radio" name="ex-amount-kind" value={k} checked={v.amountKind === k} onChange={() => setV((x) => ({ ...x, amountKind: k }))} className="size-4 accent-slate-900" />
                {k === "fixed" ? "Fixed" : "Varies"}
              </label>
            ))}
          </div>
          <Field label={v.amountKind === "variable" ? "Estimate per charge" : "Amount per charge"} htmlFor="ex-amount" error={errors.amountCents} hint={v.amountKind === "variable" ? "Used for planning until you enter the actual amount." : undefined}>
            <Input id="ex-amount" inputMode="decimal" autoComplete="off" placeholder="0.00" value={v.amount} onChange={set("amount")} {...inv("amountCents")} />
          </Field>
        </div>
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Paid from" htmlFor="ex-account" error={errors.accountId}>
          <Select id="ex-account" value={v.accountId} onChange={set("accountId")} {...inv("accountId")}>
            {data.paymentAccounts.length === 0 ? <option value="">Add a card or account first</option> : null}
            {data.paymentAccounts.map((a) => (
              <option key={a.id} value={a.id}>{accountLabel(a)}</option>
            ))}
          </Select>
        </Field>
        <label className="flex min-h-11 cursor-pointer items-center gap-3 self-end rounded-lg border border-slate-300 px-3 text-sm">
          <input type="checkbox" className="size-5 accent-slate-900" checked={v.autopay} onChange={(e) => setV((x) => ({ ...x, autopay: e.target.checked }))} />
          <span>
            Autopay <span className="text-slate-500">— still confirmed manually</span>
          </span>
        </label>
      </div>
      <Field label="Notes (optional)" htmlFor="ex-notes">
        <Textarea id="ex-notes" rows={2} value={v.notes} onChange={set("notes")} />
      </Field>
      {expense ? <p className="text-xs text-slate-600">Changes apply to charges due from today. Earlier charges keep their dates, amounts, and paid status.</p> : null}
      {errors.form ? <p className="rounded-lg bg-red-50 p-3 text-sm text-red-800" role="alert">{errors.form}</p> : null}
      <div className="flex justify-end border-t border-slate-200 pt-4">
        <Button type="submit" disabled={saving}>{saving ? "Saving…" : submitLabel}</Button>
      </div>
    </form>
  );
}
