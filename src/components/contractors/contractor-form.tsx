"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { ValidationError, type ContractorInput, type FieldErrors } from "@/lib/domain/contractors";
import { parseDollars } from "@/lib/domain/money";
import { DomainError } from "@/lib/domain/payroll";
import { PAYMENT_METHOD_LABELS, type Contractor, type PaymentMethod } from "@/lib/domain/types";

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/** Weekly schedule options: days after the Mon–Sun week ends. */
export const PAY_DELAY_OPTIONS = Array.from({ length: 14 }, (_, i) => {
  const d = i + 1;
  const day = WEEKDAYS[(6 + d) % 7];
  return { value: d, label: d <= 7 ? `Following ${day} (${d} day${d === 1 ? "" : "s"} after the week ends)` : `Second ${day} after the week ends (${d} days)` };
});

type Values = Record<keyof ContractorInput, string> & { initialRate: string };

function initialValues(c?: Contractor): Values {
  return {
    name: c?.name ?? "",
    startDate: c?.startDate ?? "",
    endDate: c?.endDate ?? "",
    email: c?.email ?? "",
    role: c?.role ?? "",
    payDelayDays: String(c?.schedule.payDelayDays ?? 5),
    preferredMethod: c?.preferredMethod ?? "venmo",
    paymentReference: c?.paymentReference ?? "",
    notes: c?.notes ?? "",
    wepmUserId: c?.wepmUserId ?? "",
    initialRate: "",
  };
}

export function ContractorForm({
  contractor,
  submitLabel,
  onSubmit,
}: {
  contractor?: Contractor;
  submitLabel: string;
  onSubmit: (input: ContractorInput & { initialRateCents?: number }) => Promise<void>;
}) {
  const [v, setV] = useState<Values>(() => initialValues(contractor));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const isNew = !contractor;
  const set = (k: keyof Values) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setV((x) => ({ ...x, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    let initialRateCents: number | undefined;
    if (isNew && v.initialRate.trim()) {
      const cents = parseDollars(v.initialRate);
      if (cents === null || cents <= 0) {
        setErrors({ rate: "Enter an hourly rate greater than $0, or leave it blank." });
        return;
      }
      initialRateCents = cents;
    }
    setSaving(true);
    try {
      await onSubmit({
        name: v.name,
        startDate: v.startDate,
        endDate: v.endDate || undefined,
        email: v.email,
        role: v.role,
        payDelayDays: Number(v.payDelayDays),
        preferredMethod: v.preferredMethod as PaymentMethod,
        paymentReference: v.paymentReference,
        notes: v.notes,
        wepmUserId: v.wepmUserId,
        initialRateCents,
      });
    } catch (err) {
      if (err instanceof ValidationError) setErrors(err.fields);
      else setFormError(err instanceof DomainError ? err.message : "Could not save. Nothing was changed.");
      setSaving(false);
    }
  }

  const err = (k: keyof FieldErrors) => ({ "aria-invalid": !!errors[k], "aria-describedby": errors[k] ? `cf-${k}-error` : undefined });

  return (
    <form onSubmit={submit} noValidate className="space-y-6">
      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold text-slate-900">Profile</legend>
        <Field label="Name" htmlFor="cf-name" error={errors.name}>
          <Input id="cf-name" value={v.name} onChange={set("name")} autoComplete="off" {...err("name")} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Start date" htmlFor="cf-startDate" error={errors.startDate} hint="Tenure is measured from this date.">
            <Input id="cf-startDate" type="date" value={v.startDate} onChange={set("startDate")} {...err("startDate")} />
          </Field>
          <Field label="End date (optional)" htmlFor="cf-endDate" error={errors.endDate} hint="Marks the contractor inactive after this date.">
            <Input id="cf-endDate" type="date" value={v.endDate} onChange={set("endDate")} {...err("endDate")} />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Role or specialty (optional)" htmlFor="cf-role" hint="For context only — it never changes pay or billing.">
            <Input id="cf-role" value={v.role} onChange={set("role")} />
          </Field>
          <Field label="Email (optional)" htmlFor="cf-email" error={errors.email}>
            <Input id="cf-email" type="email" inputMode="email" autoComplete="off" value={v.email} onChange={set("email")} {...err("email")} />
          </Field>
        </div>
        {isNew ? (
          <Field label="Hourly cost rate (optional)" htmlFor="cf-rate" error={errors.rate} hint="Effective from the start date. You can add rate changes later.">
            <Input id="cf-rate" inputMode="decimal" autoComplete="off" placeholder="0.00" value={v.initialRate} onChange={set("initialRate")} className="max-w-40" {...err("rate")} />
          </Field>
        ) : null}
      </fieldset>

      <fieldset className="space-y-4 border-t border-slate-200 pt-5">
        <legend className="text-sm font-semibold text-slate-900">Pay schedule and payment</legend>
        <Field label="Payday" htmlFor="cf-payDelayDays" error={errors.payDelayDays} hint="Weekly, Monday–Sunday work weeks. Other schedules are coming later.">
          <Select id="cf-payDelayDays" value={v.payDelayDays} onChange={set("payDelayDays")} {...err("payDelayDays")}>
            {PAY_DELAY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </Select>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Preferred payment method" htmlFor="cf-method">
            <Select id="cf-method" value={v.preferredMethod} onChange={set("preferredMethod")}>
              {Object.entries(PAYMENT_METHOD_LABELS).map(([k, l]) => (
                <option key={k} value={k}>{l}</option>
              ))}
            </Select>
          </Field>
          <Field label="Payment reference (optional)" htmlFor="cf-ref" hint="e.g. Venmo handle or Zelle email.">
            <Input id="cf-ref" value={v.paymentReference} onChange={set("paymentReference")} autoComplete="off" />
          </Field>
        </div>
      </fieldset>

      <fieldset className="space-y-4 border-t border-slate-200 pt-5">
        <legend className="text-sm font-semibold text-slate-900">Connections and notes</legend>
        <Field label="wepm.app person ID (optional)" htmlFor="cf-wepmUserId" error={errors.wepmUserId} hint="Approved hours are matched by this ID, never by name.">
          <Input id="cf-wepmUserId" value={v.wepmUserId} onChange={set("wepmUserId")} autoComplete="off" spellCheck={false} {...err("wepmUserId")} />
        </Field>
        <Field label="Notes (optional)" htmlFor="cf-notes">
          <Textarea id="cf-notes" rows={3} value={v.notes} onChange={set("notes")} />
        </Field>
      </fieldset>

      {formError ? <p className="rounded-lg bg-red-50 p-3 text-sm text-red-800" role="alert">{formError}</p> : null}
      {Object.keys(errors).length ? <p className="text-sm text-red-700" role="alert">Please fix the highlighted fields.</p> : null}
      <div className="flex justify-end border-t border-slate-200 pt-4">
        <Button type="submit" disabled={saving}>{saving ? "Saving…" : submitLabel}</Button>
      </div>
    </form>
  );
}
