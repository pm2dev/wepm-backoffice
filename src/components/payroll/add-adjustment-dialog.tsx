"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/field";
import { useNotice } from "@/components/layout/notice";
import { useBackoffice } from "@/lib/data/backoffice-provider";
import { formatDate } from "@/lib/domain/dates";
import { formatCents, parseDollars } from "@/lib/domain/money";
import { DomainError } from "@/lib/domain/payroll";
import { nextPayday } from "@/lib/domain/schedule";
import type { AdjustmentKind, Contractor } from "@/lib/domain/types";

export function AddAdjustmentDialog({ contractors }: { contractors: Contractor[] }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary">
          <Plus className="size-4" aria-hidden />
          Bonus or reimbursement
        </Button>
      </DialogTrigger>
      {open ? (
        <DialogContent title="Add a bonus or reimbursement" description="Added as its own record, due on the contractor's next payday.">
          <AdjustmentForm contractors={contractors} onDone={() => setOpen(false)} />
        </DialogContent>
      ) : null}
    </Dialog>
  );
}

function AdjustmentForm({ contractors, onDone }: { contractors: Contractor[]; onDone: () => void }) {
  const { today, mutate } = useBackoffice();
  const notify = useNotice();
  const active = contractors.filter((c) => !c.endDate || c.endDate >= today);
  const [contractorId, setContractorId] = useState("");
  const [kind, setKind] = useState<AdjustmentKind>("bonus");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const contractor = active.find((c) => c.id === contractorId);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const next: Record<string, string> = {};
    const cents = parseDollars(amount);
    if (!contractor) next.contractor = "Choose a contractor.";
    if (!description.trim()) next.description = "Add a short description.";
    if (cents === null || cents <= 0) next.amount = "Enter an amount greater than $0.";
    setErrors(next);
    if (Object.keys(next).length) return;
    setSaving(true);
    try {
      await mutate((r) => r.addAdjustment({ contractorId, kind, description, amountCents: cents! }, today));
      notify(`${kind === "bonus" ? "Bonus" : "Reimbursement"} of ${formatCents(cents!)} added for ${contractor!.name}.`);
      onDone();
    } catch (err) {
      setErrors({ form: err instanceof DomainError ? err.message : "Could not save. Nothing was changed." });
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <Field label="Contractor" htmlFor="adj-contractor" error={errors.contractor}>
        <Select id="adj-contractor" value={contractorId} onChange={(e) => setContractorId(e.target.value)} aria-invalid={!!errors.contractor}>
          <option value="">Choose…</option>
          {active.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </Field>
      <fieldset>
        <legend className="mb-1.5 text-sm font-medium text-slate-800">Type</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {(
            [
              ["bonus", "Bonus", "Counts toward earnings"],
              ["reimbursement", "Reimbursement", "Shown separately from earnings"],
            ] as const
          ).map(([value, label, help]) => (
            <label key={value} className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border border-slate-300 p-3 has-checked:border-slate-900 has-checked:bg-slate-50">
              <input type="radio" name="adj-kind" value={value} checked={kind === value} onChange={() => setKind(value)} className="mt-0.5 size-4 accent-slate-900" />
              <span className="text-sm">
                <span className="block font-medium text-slate-900">{label}</span>
                <span className="text-slate-600">{help}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <Field label="Description" htmlFor="adj-desc" error={errors.description}>
        <Input id="adj-desc" value={description} onChange={(e) => setDescription(e.target.value)} aria-invalid={!!errors.description} placeholder={kind === "bonus" ? "e.g. Launch bonus" : "e.g. Software license"} />
      </Field>
      <Field label="Amount" htmlFor="adj-amount" error={errors.amount}>
        <Input id="adj-amount" inputMode="decimal" autoComplete="off" value={amount} onChange={(e) => setAmount(e.target.value)} aria-invalid={!!errors.amount} placeholder="0.00" className="max-w-40" />
      </Field>
      {contractor ? (
        <p className="text-sm text-slate-600">
          Due on {contractor.name}&rsquo;s next payday: <strong>{formatDate(nextPayday(contractor, today), { weekday: true })}</strong>
        </p>
      ) : null}
      {errors.form ? <p className="rounded-lg bg-red-50 p-3 text-sm text-red-800" role="alert">{errors.form}</p> : null}
      <div className="flex justify-end border-t border-slate-200 pt-4">
        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : "Add record"}
        </Button>
      </div>
    </form>
  );
}
