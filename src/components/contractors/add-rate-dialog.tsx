"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/field";
import { useNotice } from "@/components/layout/notice";
import { useBackoffice } from "@/lib/data/backoffice-provider";
import { rateChangeImpact, ValidationError, type FieldErrors } from "@/lib/domain/contractors";
import { formatDate, isISODate } from "@/lib/domain/dates";
import { formatCents, formatHours, parseDollars } from "@/lib/domain/money";
import { DomainError } from "@/lib/domain/payroll";
import type { Contractor } from "@/lib/domain/types";

export function AddRateDialog({ contractor }: { contractor: Contractor }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary" size="sm">
          <Plus className="size-4" aria-hidden />
          Add rate change
        </Button>
      </DialogTrigger>
      {open ? (
        <DialogContent title="Add a rate change" description={`${contractor.name}'s hourly cost rate — the same for every project and task.`}>
          <RateForm contractor={contractor} onDone={() => setOpen(false)} />
        </DialogContent>
      ) : null}
    </Dialog>
  );
}

function RateForm({ contractor, onDone }: { contractor: Contractor; onDone: () => void }) {
  const { state, today, mutate } = useBackoffice();
  const notify = useNotice();
  const [effectiveDate, setEffectiveDate] = useState(today);
  const [rate, setRate] = useState("");
  const [errors, setErrors] = useState<FieldErrors & { form?: string }>({});
  const [saving, setSaving] = useState(false);

  const impact = state.status === "ready" && isISODate(effectiveDate) ? rateChangeImpact(state.data, contractor.id, effectiveDate, today) : null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const cents = parseDollars(rate);
    if (cents === null || cents <= 0) {
      setErrors({ rate: "Enter an hourly rate greater than $0." });
      return;
    }
    setSaving(true);
    try {
      await mutate((r) => r.addRate({ contractorId: contractor.id, effectiveDate, hourlyRateCents: cents }));
      notify(`${contractor.name}'s rate is ${formatCents(cents)}/h from ${formatDate(effectiveDate)}.`);
      onDone();
    } catch (err) {
      if (err instanceof ValidationError) setErrors(err.fields);
      else setErrors({ form: err instanceof DomainError ? err.message : "Could not save. Nothing was changed." });
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Effective date" htmlFor="rate-date" error={errors.effectiveDate} hint="Applies to hours worked on or after this date.">
          <Input id="rate-date" type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} aria-invalid={!!errors.effectiveDate} />
        </Field>
        <Field label="Hourly cost rate" htmlFor="rate-amount" error={errors.rate}>
          <Input id="rate-amount" inputMode="decimal" autoComplete="off" placeholder="0.00" value={rate} onChange={(e) => setRate(e.target.value)} aria-invalid={!!errors.rate} />
        </Field>
      </div>
      {impact ? (
        <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
          {impact.unfinalizedMinutes > 0 ? (
            <p>
              Recalculates <strong>{formatHours(impact.unfinalizedMinutes)}</strong> of approved, not-yet-finalized hours worked from {formatDate(effectiveDate, { year: false })}
              {impact.nextRateDate ? ` until ${formatDate(impact.nextRateDate, { year: false })}, when a later rate takes over` : ""}.
            </p>
          ) : (
            <p>No unfinalized hours are affected right now.</p>
          )}
          <p className="mt-1">Finalized payroll keeps its original rates and amounts.</p>
        </div>
      ) : null}
      {errors.form ? <p className="rounded-lg bg-red-50 p-3 text-sm text-red-800" role="alert">{errors.form}</p> : null}
      <div className="flex justify-end border-t border-slate-200 pt-4">
        <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Add rate"}</Button>
      </div>
    </form>
  );
}
