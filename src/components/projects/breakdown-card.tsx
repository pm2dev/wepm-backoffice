"use client";

import { AlertTriangle } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, useOpenerElement } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/field";
import { useNotice } from "@/components/layout/notice";
import { useBackoffice } from "@/lib/data/backoffice-provider";
import type { ProjectBreakdown } from "@/lib/domain/billing";
import { formatDate, formatRange, isISODate } from "@/lib/domain/dates";
import { formatCents, formatHours } from "@/lib/domain/money";
import { DomainError } from "@/lib/domain/payroll";
import { routes } from "@/lib/routes";

/** One project's uninvoiced hours × billing rates, with the "mark invoiced" step. */
export function BreakdownCard({ b, through, showProjectLink = true }: { b: ProjectBreakdown; through?: string; showProjectLink?: boolean }) {
  const [marking, setMarking] = useState(false);
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col gap-2 border-b border-slate-200 p-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="font-medium text-slate-900">
            {showProjectLink ? <Link href={routes.project(b.project.id)} className="underline-offset-2 hover:underline">{b.project.name}</Link> : b.project.name}
          </p>
          <p className="text-sm text-slate-600">
            {formatHours(b.minutes)} · work dates {formatRange(b.firstWorkDate, b.lastWorkDate)} · {b.project.billingMethod === "hourly" ? "one hourly rate" : "rates by task"}
          </p>
        </div>
        <div className="sm:text-right">
          <p className="tabular text-xl font-semibold text-slate-900">{formatCents(b.knownAmountCents)}</p>
          {b.complete ? <Badge tone="success">Ready to invoice</Badge> : <Badge tone="danger">Incomplete — missing rate</Badge>}
        </div>
      </div>
      <div role="region" aria-label={`${b.project.name} billing lines`} tabIndex={0} className="overflow-x-auto focus-visible:outline-2 focus-visible:outline-blue-600">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">{b.project.name}: hours by task and billing rate</caption>
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
            <tr>
              <th scope="col" className="px-4 py-2 font-medium">Task</th>
              <th scope="col" className="px-4 py-2 text-right font-medium">Hours</th>
              <th scope="col" className="hidden px-4 py-2 text-right font-medium sm:table-cell">Bill rate</th>
              <th scope="col" className="px-4 py-2 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {b.lines.map((l) => (
              <tr key={l.task} className={l.rateCents === null ? "bg-red-50/60" : undefined}>
                <td className="px-4 py-2.5">{l.task}</td>
                <td className="tabular px-4 py-2.5 text-right">
                  {formatHours(l.minutes)}
                  <span className={`block text-xs sm:hidden ${l.rateCents === null ? "font-medium text-red-700" : "text-slate-500"}`}>
                    {l.rateCents === null ? "No rate" : `× ${formatCents(l.rateCents)}/h`}
                  </span>
                </td>
                <td className="tabular hidden px-4 py-2.5 text-right sm:table-cell">{l.rateCents === null ? <span className="font-medium text-red-700">No rate</span> : `${formatCents(l.rateCents)}/h`}</td>
                <td className="tabular px-4 py-2.5 text-right">{l.amountCents === null ? <span className="text-red-700">—</span> : formatCents(l.amountCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-col gap-3 border-t border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between">
        {b.complete ? (
          <p className="text-sm text-slate-600">Create this invoice in QuickBooks, then mark these hours invoiced.</p>
        ) : (
          <p className="flex gap-2 text-sm text-red-800">
            <AlertTriangle className="size-4 shrink-0" aria-hidden />
            <span>
              Add a billing rate for <strong>{b.missingRateTasks.join(", ")}</strong>. These hours are never billed at $0.{" "}
              <Link href={routes.project(b.project.id)} className="underline underline-offset-2">Set rates</Link>
            </span>
          </p>
        )}
        <Button onClick={() => setMarking(true)} disabled={!b.complete} className="shrink-0">
          Mark invoiced<span className="sr-only"> for {b.project.name}</span>
        </Button>
      </div>
      {marking ? <MarkInvoicedDialog b={b} through={through} onClose={() => setMarking(false)} /> : null}
    </Card>
  );
}

function MarkInvoicedDialog({ b, through, onClose }: { b: ProjectBreakdown; through?: string; onClose: () => void }) {
  const { today, mutate } = useBackoffice();
  const notify = useNotice();
  const opener = useOpenerElement();
  const [invoicedOn, setInvoicedOn] = useState(today);
  const [ref, setRef] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title={`Mark ${b.project.name} invoiced`}
        description="Use after creating the invoice in QuickBooks. This doesn't mark the invoice paid or pay any contractor."
        returnFocusTo={opener}
      >
        <form
          noValidate
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!isISODate(invoicedOn)) return setError("Enter the invoice date.");
            setSaving(true);
            try {
              const r = await mutate((repo) => repo.markInvoiced({ projectId: b.project.id, through, invoicedOn, quickbooksInvoiceRef: ref }));
              notify(`${formatHours(b.minutes)} on ${b.project.name} marked invoiced (${formatCents(r.amountCents)}).`);
              onClose();
            } catch (err) {
              setError(err instanceof DomainError ? err.message : "Could not save. Nothing was changed.");
              setSaving(false);
            }
          }}
        >
          <div className="rounded-lg bg-slate-50 p-3 text-sm">
            <p>
              <strong className="tabular">{formatCents(b.knownAmountCents)}</strong> for {formatHours(b.minutes)} ({b.entries.length} entries)
            </p>
            <p className="text-slate-600">Work dates {formatDate(b.firstWorkDate)} – {formatDate(b.lastWorkDate)}</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Invoice date" htmlFor="inv-date" error={error ?? undefined}>
              <Input id="inv-date" type="date" value={invoicedOn} onChange={(e) => setInvoicedOn(e.target.value)} />
            </Field>
            <Field label="QuickBooks invoice # (optional)" htmlFor="inv-ref">
              <Input id="inv-ref" value={ref} onChange={(e) => setRef(e.target.value)} autoComplete="off" />
            </Field>
          </div>
          <div className="flex justify-end border-t border-slate-200 pt-4">
            <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Mark invoiced"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
