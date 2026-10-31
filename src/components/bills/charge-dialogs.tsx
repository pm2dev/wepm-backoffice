"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, useOpenerElement } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/field";
import { useNotice } from "@/components/layout/notice";
import { useBackoffice } from "@/lib/data/backoffice-provider";
import { formatDate, isISODate } from "@/lib/domain/dates";
import type { ChargeView } from "@/lib/domain/expenses";
import { centsToInput, formatCents, parseDollars } from "@/lib/domain/money";
import { DomainError } from "@/lib/domain/payroll";

/** Confirm one or more charges as paid on a date. */
export function MarkPaidDialog({ charges, onClose, onDone }: { charges: ChargeView[]; onClose: () => void; onDone?: () => void }) {
  const { today, mutate } = useBackoffice();
  const notify = useNotice();
  const opener = useOpenerElement();
  const [paidOn, setPaidOn] = useState(today);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const total = charges.reduce((s, c) => s + c.amountCents, 0);
  const estimates = charges.filter((c) => c.isEstimate).length;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!isISODate(paidOn)) return setError("Enter the date paid.");
    setSaving(true);
    try {
      await mutate((r) => r.setChargesPaid(charges.map((c) => c.key), paidOn));
      notify(`Marked ${charges.length} charge${charges.length === 1 ? "" : "s"} paid (${formatCents(total)}).`);
      onDone?.();
      onClose();
    } catch (err) {
      setError(err instanceof DomainError ? err.message : "Could not save. Nothing was changed.");
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title={charges.length === 1 ? `Mark ${charges[0].vendor} paid` : `Mark ${charges.length} charges paid`}
        description="Confirms you verified the charge against your statement. Nothing is paid from here."
        returnFocusTo={opener}
      >
        <form onSubmit={submit} noValidate className="space-y-4">
          <ul className="max-h-48 space-y-1 overflow-y-auto rounded-lg bg-slate-50 p-3 text-sm">
            {charges.map((c) => (
              <li key={c.key} className="flex justify-between gap-3">
                <span>
                  {c.vendor} <span className="text-slate-500">· due {formatDate(c.dueDate, { year: false })}</span>
                </span>
                <span className="tabular">
                  {formatCents(c.amountCents)}
                  {c.isEstimate ? <span className="text-amber-800"> est.</span> : null}
                </span>
              </li>
            ))}
          </ul>
          {estimates ? (
            <p className="text-sm text-amber-900">
              {estimates} of these {estimates === 1 ? "is an estimate" : "are estimates"}. You can enter the actual amount later; the charge won&rsquo;t be duplicated.
            </p>
          ) : null}
          <Field label="Date paid" htmlFor="bills-paid-on" error={error ?? undefined}>
            <Input id="bills-paid-on" type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
          </Field>
          <div className="flex flex-col-reverse gap-2 border-t border-slate-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-slate-700">
              Total <strong className="tabular text-slate-900">{formatCents(total)}</strong>
            </p>
            <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Mark paid"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Enter the actual amount for a charge (replaces the estimate on the same charge). */
export function AmountDialog({ charge, onClose }: { charge: ChargeView; onClose: () => void }) {
  const { mutate } = useBackoffice();
  const notify = useNotice();
  const opener = useOpenerElement();
  const [amount, setAmount] = useState(charge.isEstimate ? "" : centsToInput(charge.amountCents));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const cents = parseDollars(amount);
    if (cents === null) return setError("Enter the amount charged, e.g. 131.42.");
    setSaving(true);
    try {
      await mutate((r) => r.setChargeAmount(charge.key, cents));
      notify(`${charge.vendor} (${formatDate(charge.dueDate, { year: false })}) set to ${formatCents(cents)}.`);
      onClose();
    } catch (err) {
      setError(err instanceof DomainError ? err.message : "Could not save. Nothing was changed.");
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={`${charge.vendor} · due ${formatDate(charge.dueDate)}`} description={charge.isEstimate ? `Estimated at ${formatCents(charge.amountCents)}. Enter what was actually charged.` : "Correct the amount for this charge."} returnFocusTo={opener}>
        <form onSubmit={submit} noValidate className="space-y-4">
          <Field label="Actual amount" htmlFor="charge-amount" error={error ?? undefined}>
            <Input id="charge-amount" inputMode="decimal" autoComplete="off" placeholder={centsToInput(charge.amountCents)} value={amount} onChange={(e) => setAmount(e.target.value)} className="max-w-40" aria-invalid={!!error} />
          </Field>
          <div className="flex justify-end border-t border-slate-200 pt-4">
            <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save amount"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
