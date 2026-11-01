"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, useOpenerElement } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { useNotice } from "@/components/layout/notice";
import { useBackoffice } from "@/lib/data/backoffice-provider";
import { formatDate, isISODate } from "@/lib/domain/dates";
import { centsToInput, formatCents, parseDollars } from "@/lib/domain/money";
import { DomainError, isPayable, type Obligation } from "@/lib/domain/payroll";
import { PAYMENT_METHOD_LABELS, type Contractor, type PaymentMethod } from "@/lib/domain/types";
import { KindBadge, obligationDescription } from "./labels";

type Row = { checked: boolean; amount: string };

/**
 * Record a payment made outside Backoffice (Venmo, Zelle, …). Covers one
 * contractor's finalized records; each keeps its own identity.
 */
export function RecordPaymentDialog({
  open,
  onOpenChange,
  contractor,
  obligations,
  preselected,
  onRecorded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contractor: Contractor;
  /** All of this contractor's unpaid obligations. Unpayable ones are listed as unavailable. */
  obligations: Obligation[];
  preselected: string[];
  onRecorded?: () => void;
}) {
  const opener = useOpenerElement();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open ? (
        <DialogContent
          title={`Record payment to ${contractor.name}`}
          description="Record a payment you already sent. Backoffice does not send money."
          returnFocusTo={opener}
        >
          <PaymentForm
            contractor={contractor}
            obligations={obligations}
            preselected={preselected}
            onDone={() => {
              onOpenChange(false);
              onRecorded?.();
            }}
          />
        </DialogContent>
      ) : null}
    </Dialog>
  );
}

function PaymentForm({
  contractor,
  obligations,
  preselected,
  onDone,
}: {
  contractor: Contractor;
  obligations: Obligation[];
  preselected: string[];
  onDone: () => void;
}) {
  const { today, mutate } = useBackoffice();
  const notify = useNotice();
  const payable = obligations.filter(isPayable);
  const blocked = obligations.filter((o) => !isPayable(o));
  const [rows, setRows] = useState<Record<string, Row>>(() =>
    Object.fromEntries(payable.map((o) => [o.uid, { checked: preselected.includes(o.uid), amount: centsToInput(o.outstandingCents) }])),
  );
  const [paidOn, setPaidOn] = useState(today);
  const [method, setMethod] = useState<PaymentMethod>(contractor.preferredMethod);
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const total = useMemo(
    () => payable.reduce((s, o) => (rows[o.uid]?.checked ? s + (parseDollars(rows[o.uid].amount) ?? 0) : s), 0),
    [payable, rows],
  );

  function validate() {
    const next: Record<string, string> = {};
    const selected = payable.filter((o) => rows[o.uid]?.checked);
    if (selected.length === 0) next.form = "Select at least one record.";
    for (const o of selected) {
      const cents = parseDollars(rows[o.uid].amount);
      if (cents === null || cents <= 0) next[o.uid] = "Enter an amount greater than $0.";
      else if (cents > o.outstandingCents) next[o.uid] = `Can't be more than the ${formatCents(o.outstandingCents)} outstanding.`;
    }
    if (!isISODate(paidOn)) next.paidOn = "Enter the date you paid.";
    setErrors(next);
    return { ok: Object.keys(next).length === 0, selected };
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    const { ok, selected } = validate();
    if (!ok) return;
    setSaving(true);
    try {
      await mutate((r) =>
        r.recordPayment(
          {
            contractorId: contractor.id,
            paidOn,
            method,
            note,
            allocations: selected.map((o) => ({ obligation: o.ref!, amountCents: parseDollars(rows[o.uid].amount)! })),
          },
          today,
        ),
      );
      notify(`Recorded ${formatCents(total)} paid to ${contractor.name} on ${formatDate(paidOn)}.`);
      onDone();
    } catch (err) {
      setFormError(err instanceof DomainError ? err.message : "The payment could not be recorded. Nothing was saved.");
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-medium text-slate-800">Records covered by this payment</legend>
        {payable.length === 0 ? <p className="text-sm text-slate-600">No finalized records are waiting for payment.</p> : null}
        {payable.map((o) => {
          const row = rows[o.uid];
          const inputId = `amt-${o.uid}`;
          return (
            <div key={o.uid} className="rounded-lg border border-slate-200 p-3">
              <div className="flex items-start gap-3">
                <input
                  id={`chk-${o.uid}`}
                  type="checkbox"
                  className="mt-0.5 size-5 shrink-0 accent-slate-900"
                  checked={row.checked}
                  onChange={(e) => setRows((r) => ({ ...r, [o.uid]: { ...r[o.uid], checked: e.target.checked } }))}
                />
                <label htmlFor={`chk-${o.uid}`} className="min-w-0 flex-1 text-sm">
                  <span className="flex flex-wrap items-center gap-2">
                    <KindBadge kind={o.kind} />
                    <span className="font-medium text-slate-900">{obligationDescription(o)}</span>
                  </span>
                  <span className="mt-1 block text-slate-600">
                    {formatCents(o.outstandingCents)} outstanding
                    {o.paidCents > 0 ? ` (${formatCents(o.paidCents)} of ${formatCents(o.amountCents)} already paid)` : ""}
                  </span>
                </label>
              </div>
              {row.checked ? (
                <div className="mt-3 pl-8">
                  <Field label="Amount paid" htmlFor={inputId} error={errors[o.uid]}>
                    <Input
                      id={inputId}
                      inputMode="decimal"
                      autoComplete="off"
                      value={row.amount}
                      aria-invalid={!!errors[o.uid]}
                      aria-describedby={errors[o.uid] ? `${inputId}-error` : undefined}
                      onChange={(e) => setRows((r) => ({ ...r, [o.uid]: { ...r[o.uid], amount: e.target.value } }))}
                      className="max-w-40"
                    />
                  </Field>
                </div>
              ) : null}
            </div>
          );
        })}
        {blocked.length > 0 ? (
          <p className="text-xs text-slate-500">
            {blocked.length} other record{blocked.length === 1 ? "" : "s"} for {contractor.name} must be finalized before {blocked.length === 1 ? "it" : "they"} can be paid.
          </p>
        ) : null}
        {errors.form ? <p className="text-sm text-red-700" role="alert">{errors.form}</p> : null}
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Date paid" htmlFor="paid-on" error={errors.paidOn}>
          <Input id="paid-on" type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} aria-invalid={!!errors.paidOn} required />
        </Field>
        <Field label="Method" htmlFor="method" hint={contractor.paymentReference ? `Usual: ${PAYMENT_METHOD_LABELS[contractor.preferredMethod]} · ${contractor.paymentReference}` : undefined}>
          <Select id="method" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
            {Object.entries(PAYMENT_METHOD_LABELS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Note (optional)" htmlFor="note">
        <Textarea id="note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
      </Field>

      {formError ? <p className="rounded-lg bg-red-50 p-3 text-sm text-red-800" role="alert">{formError}</p> : null}

      <div className="flex flex-col-reverse gap-2 border-t border-slate-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-slate-700">
          Total recorded: <strong className="tabular text-slate-900">{formatCents(total)}</strong>
        </p>
        <Button type="submit" disabled={saving || total <= 0}>
          {saving ? "Saving…" : "Record payment"}
        </Button>
      </div>
    </form>
  );
}

