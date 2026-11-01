"use client";

import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, useOpenerElement } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/field";
import { useBackoffice } from "@/lib/data/backoffice-provider";
import { isISODate } from "@/lib/domain/dates";
import { DomainError } from "@/lib/domain/payroll";

/** Date + optional note confirmation used for manual "done"/"paid" marks. */
export function MarkDialog({
  title,
  description,
  dateLabel,
  confirmLabel,
  summary,
  onSave,
  onClose,
}: {
  title: string;
  description: ReactNode;
  dateLabel: string;
  confirmLabel: string;
  summary?: ReactNode;
  onSave: (value: { on: string; note?: string }) => Promise<void>;
  onClose: () => void;
}) {
  const { today } = useBackoffice();
  const opener = useOpenerElement();
  const [on, setOn] = useState(today);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={title} description={description} returnFocusTo={opener}>
        <form
          noValidate
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!isISODate(on)) return setError("Enter a date.");
            setSaving(true);
            try {
              await onSave({ on, note });
              onClose();
            } catch (err) {
              setError(err instanceof DomainError ? err.message : "Could not save. Nothing was changed.");
              setSaving(false);
            }
          }}
        >
          {summary ? <div className="rounded-lg bg-slate-50 p-3 text-sm">{summary}</div> : null}
          <Field label={dateLabel} htmlFor="mark-on" error={error ?? undefined}>
            <Input id="mark-on" type="date" value={on} onChange={(e) => setOn(e.target.value)} className="max-w-48" />
          </Field>
          <Field label="Note (optional)" htmlFor="mark-note">
            <Textarea id="mark-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
          <div className="flex justify-end border-t border-slate-200 pt-4">
            <Button type="submit" disabled={saving}>{saving ? "Saving…" : confirmLabel}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
