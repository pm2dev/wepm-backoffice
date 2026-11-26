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
import { billingBreakdown, type ProjectBreakdown } from "@/lib/domain/billing";
import { defaultThroughFor } from "@/lib/domain/invoice-drafts";
import { formatDate, formatRange, isISODate } from "@/lib/domain/dates";
import { formatCents, formatHours } from "@/lib/domain/money";
import { DomainError } from "@/lib/domain/payroll";
import { routes } from "@/lib/routes";

/** One project's uninvoiced hours × billing rates and billable expenses, with the "create invoice draft" step. */
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
            {formatHours(b.minutes)}
            {b.expenses.length ? ` + ${b.expenses.length} expense${b.expenses.length === 1 ? "" : "s"}` : ""} · {formatRange(b.firstWorkDate, b.lastWorkDate)} ·{" "}
            {b.project.billingMethod === "hourly" ? "one hourly rate" : "rates by task"}
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
              <tr key={`${l.task}-${l.rateCents ?? "none"}-${l.firstWorkDate}`} className={l.rateCents === null ? "bg-red-50/60" : undefined}>
                <td className="px-4 py-2.5">
                  {l.task}
                  {b.lines.filter((x) => x.task === l.task).length > 1 ? <span className="block text-xs text-slate-500">{formatRange(l.firstWorkDate, l.lastWorkDate)}</span> : null}
                </td>
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
            {b.expenses.map((x) => (
              <tr key={x.id}>
                <td className="px-4 py-2.5">
                  {x.vendor}
                  <span className="block text-xs text-slate-500">Expense at cost · {formatDate(x.date)}{x.description ? ` · ${x.description}` : ""}</span>
                </td>
                <td className="px-4 py-2.5 text-right text-slate-400">—</td>
                <td className="hidden px-4 py-2.5 sm:table-cell" />
                <td className="tabular px-4 py-2.5 text-right">{formatCents(x.amountCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-col gap-3 border-t border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between">
        {b.complete ? (
          <p className="text-sm text-slate-600">Create a draft to reserve these items, then create the invoice in QuickBooks.</p>
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
          Create invoice draft<span className="sr-only"> for {b.project.name}</span>
        </Button>
      </div>
      {marking ? <CreateDraftDialog b={b} through={through} onClose={() => setMarking(false)} /> : null}
    </Card>
  );
}

function CreateDraftDialog({ b, through, onClose }: { b: ProjectBreakdown; through?: string; onClose: () => void }) {
  const { state, today, mutate } = useBackoffice();
  const notify = useNotice();
  const opener = useOpenerElement();
  const [throughDate, setThroughDate] = useState(through ?? (state.status === "ready" ? defaultThroughFor(state.data, b.project.id, today) : today));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const preview = state.status === "ready" && isISODate(throughDate) ? billingBreakdown(state.data, throughDate).flatMap((c) => c.projects).find((x) => x.project.id === b.project.id) : undefined;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={`Create an invoice draft for ${b.project.name}`} description="Reserves the uninvoiced hours and billable expenses up to a date, so they can't be billed twice. Nothing is sent to QuickBooks." returnFocusTo={opener}>
        <form
          noValidate
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!isISODate(throughDate)) return setError("Enter the date to invoice through.");
            setSaving(true);
            try {
              const d = await mutate((repo) => repo.createInvoiceDraft({ projectId: b.project.id, throughDate }, today));
              notify(`Draft created for ${b.project.name}: ${formatCents(d.amountCents)}.`);
              onClose();
            } catch (err) {
              setError(err instanceof DomainError ? err.message : "Could not create the draft. Nothing was changed.");
              setSaving(false);
            }
          }}
        >
          <Field label="Invoice through" htmlFor="draft-through" error={error ?? undefined} hint="Defaults to the end of the last full billing period.">
            <Input id="draft-through" type="date" value={throughDate} onChange={(e) => setThroughDate(e.target.value)} className="max-w-48" />
          </Field>
          <div className="rounded-lg bg-slate-50 p-3 text-sm" role="status">
            {preview ? (
              <>
                <p>
                  <strong className="tabular">{formatCents(preview.knownAmountCents)}</strong> for {formatHours(preview.minutes)}
                  {preview.expenses.length ? ` and ${preview.expenses.length} expense${preview.expenses.length === 1 ? "" : "s"}` : ""}
                </p>
                {!preview.complete ? <p className="text-red-800">Some of these hours have no billing rate yet.</p> : null}
              </>
            ) : (
              <p>Nothing to invoice through that date.</p>
            )}
          </div>
          <div className="flex justify-end border-t border-slate-200 pt-4">
            <Button type="submit" disabled={saving || !preview || !preview.complete}>{saving ? "Creating…" : "Create draft"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
