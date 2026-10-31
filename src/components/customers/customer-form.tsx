"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { CADENCE_LABEL, FormError, type CustomerInput } from "@/lib/domain/billing";
import { DomainError } from "@/lib/domain/payroll";
import type { BillingCadence, Customer } from "@/lib/domain/types";

export function CustomerForm({ customer, submitLabel, onSubmit }: { customer?: Customer; submitLabel: string; onSubmit: (input: CustomerInput) => Promise<void> }) {
  const [v, setV] = useState({
    name: customer?.name ?? "",
    billingCadence: customer?.billingCadence ?? ("monthly" as BillingCadence),
    quickbooksCustomerId: customer?.quickbooksCustomerId ?? "",
    notes: customer?.notes ?? "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setV((x) => ({ ...x, [k]: e.target.value }));
  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
          await onSubmit(v);
        } catch (err) {
          setErrors(err instanceof FormError ? err.fields : { form: err instanceof DomainError ? err.message : "Could not save. Nothing was changed." });
          setSaving(false);
        }
      }}
    >
      <Field label="Customer name" htmlFor="cu-name" error={errors.name}>
        <Input id="cu-name" value={v.name} onChange={set("name")} autoComplete="organization" aria-invalid={!!errors.name} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Default billing cadence" htmlFor="cu-cadence" hint="Projects can override it.">
          <Select id="cu-cadence" value={v.billingCadence} onChange={set("billingCadence")}>
            {Object.entries(CADENCE_LABEL).map(([k, l]) => (
              <option key={k} value={k}>{l}</option>
            ))}
          </Select>
        </Field>
        <Field label="QuickBooks customer ID (optional)" htmlFor="cu-qb" error={errors.quickbooksCustomerId} hint="Matches invoice payments from QuickBooks.">
          <Input id="cu-qb" value={v.quickbooksCustomerId} onChange={set("quickbooksCustomerId")} autoComplete="off" spellCheck={false} aria-invalid={!!errors.quickbooksCustomerId} />
        </Field>
      </div>
      <Field label="Notes (optional)" htmlFor="cu-notes">
        <Textarea id="cu-notes" rows={2} value={v.notes} onChange={set("notes")} />
      </Field>
      {errors.form ? <p className="rounded-lg bg-red-50 p-3 text-sm text-red-800" role="alert">{errors.form}</p> : null}
      <div className="flex justify-end border-t border-slate-200 pt-4">
        <Button type="submit" disabled={saving}>{saving ? "Saving…" : submitLabel}</Button>
      </div>
    </form>
  );
}
