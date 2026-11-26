"use client";

import { AlertTriangle, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, useOpenerElement } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/field";
import { useNotice } from "@/components/layout/notice";
import { useBackoffice } from "@/lib/data/backoffice-provider";
import { formatDate, formatRange, isISODate } from "@/lib/domain/dates";
import { DRAFT_STATUS_LABELS, linkableInvoices, linkedInvoice } from "@/lib/domain/invoice-drafts";
import { formatCents, formatHours } from "@/lib/domain/money";
import { DomainError } from "@/lib/domain/payroll";
import type { BackofficeData, InvoiceDraft } from "@/lib/domain/types";
import { routes } from "@/lib/routes";

const TONE = { draft: "warning", invoiced: "info", linked: "success" } as const;

/** One invoice draft: its lines, status, and the next step (mark invoiced, link, undo). */
export function InvoiceDraftCard({ data, draft: d, showProject = true }: { data: BackofficeData; draft: InvoiceDraft; showProject?: boolean }) {
  const { mutate } = useBackoffice();
  const notify = useNotice();
  const [dialog, setDialog] = useState<"invoiced" | "link" | "undo" | null>(null);
  const project = data.projects.find((p) => p.id === d.projectId);
  const customer = data.customers.find((c) => c.id === d.customerId);
  const invoice = linkedInvoice(data, d);
  const minutes = d.laborLines.reduce((s, l) => s + l.minutes, 0);
  const editable = d.status === "draft";

  async function removeLine(lineId: string, label: string) {
    try {
      await mutate((r) => r.removeDraftLine(d.id, lineId));
      notify(`${label} removed from the draft. It's back in Ready to invoice.`);
    } catch (err) {
      notify(err instanceof DomainError ? err.message : "Could not change the draft. Nothing was changed.");
    }
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col gap-2 border-b border-slate-200 p-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          {showProject ? (
            <p className="font-medium text-slate-900">
              {customer?.name} · <Link href={routes.project(d.projectId)} className="underline-offset-2 hover:underline">{project?.name ?? "Unknown project"}</Link>
            </p>
          ) : null}
          <p className="text-sm text-slate-700">
            {d.status === "draft" ? `Drafted ${formatDate(d.createdOn)}` : `Invoiced ${formatDate(d.invoicedOn ?? d.createdOn)}`}
            {d.quickbooksInvoiceRef ? ` · ${d.quickbooksInvoiceRef}` : ""} · through {formatDate(d.throughDate, { year: true })}
          </p>
          <p className="text-sm text-slate-600">
            {minutes ? formatHours(minutes) : "No hours"}
            {d.expenseLines.length ? ` · ${d.expenseLines.length} expense${d.expenseLines.length === 1 ? "" : "s"}` : ""}
          </p>
        </div>
        <div className="sm:text-right">
          <p className="tabular text-xl font-semibold text-slate-900">{formatCents(d.amountCents)}</p>
          <Badge tone={TONE[d.status]}>{DRAFT_STATUS_LABELS[d.status]}</Badge>
        </div>
      </div>

      <ul className="divide-y divide-slate-200 text-sm" aria-label="Invoice lines">
        {d.laborLines.map((l) => (
          <li key={l.id} className="flex items-center gap-3 px-4 py-2">
            <div className="min-w-0 flex-1">
              <p>{l.task}</p>
              <p className="text-xs text-slate-500">
                {formatHours(l.minutes)} × {formatCents(l.rateCents)}/h · {formatRange(l.firstWorkDate, l.lastWorkDate)}
              </p>
            </div>
            <span className="tabular">{formatCents(l.amountCents)}</span>
            {editable ? (
              <Button variant="ghost" size="sm" aria-label={`Remove ${l.task} ${formatRange(l.firstWorkDate, l.lastWorkDate)} from the draft`} onClick={() => removeLine(l.id, `${l.task} (${formatHours(l.minutes)})`)}>
                <Trash2 className="size-4" aria-hidden />
              </Button>
            ) : null}
          </li>
        ))}
        {d.expenseLines.map((l) => (
          <li key={l.id} className="flex items-center gap-3 px-4 py-2">
            <div className="min-w-0 flex-1">
              <p>{l.vendor}{l.description ? ` · ${l.description}` : ""}</p>
              <p className="text-xs text-slate-500">Expense at cost · {formatDate(l.date)}</p>
            </div>
            <span className="tabular">{formatCents(l.amountCents)}</span>
            {editable ? (
              <Button variant="ghost" size="sm" aria-label={`Remove ${l.vendor} expense from the draft`} onClick={() => removeLine(l.id, `${l.vendor} expense`)}>
                <Trash2 className="size-4" aria-hidden />
              </Button>
            ) : null}
          </li>
        ))}
      </ul>

      <div className="flex flex-col gap-3 border-t border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-slate-600">
          {d.status === "draft" ? "Create this invoice in QuickBooks, then mark it invoiced." : null}
          {d.status === "invoiced" ? "When QuickBooks syncs this invoice, link it so payments show here." : null}
          {d.status === "linked" && invoice ? (
            <>
              Linked to {invoice.docNumber ?? `QuickBooks #${invoice.qbInvoiceId}`} ({formatCents(invoice.totalCents)}, {invoice.balanceCents === 0 ? "paid" : `${formatCents(invoice.balanceCents)} open`}).
              {invoice.totalCents !== d.amountCents ? <span className="block text-amber-800">The QuickBooks total differs from this draft by {formatCents(Math.abs(invoice.totalCents - d.amountCents))}.</span> : null}
            </>
          ) : null}
        </p>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button variant="ghost" onClick={() => setDialog("undo")}>
            {d.status === "draft" ? "Delete draft" : "Undo"}
            <span className="sr-only"> for {project?.name} {formatCents(d.amountCents)}</span>
          </Button>
          {d.status === "draft" ? <Button onClick={() => setDialog("invoiced")}>Mark invoiced<span className="sr-only"> for {project?.name}</span></Button> : null}
          {d.status === "invoiced" ? <Button onClick={() => setDialog("link")}>Link to QuickBooks invoice<span className="sr-only"> for {project?.name}</span></Button> : null}
        </div>
      </div>
      {dialog === "invoiced" ? <MarkInvoicedDialog draft={d} projectName={project?.name ?? "project"} onClose={() => setDialog(null)} /> : null}
      {dialog === "link" ? <LinkDialog data={data} draft={d} onClose={() => setDialog(null)} /> : null}
      {dialog === "undo" ? <UndoDialog draft={d} onClose={() => setDialog(null)} /> : null}
    </Card>
  );
}

/** A list of drafts, newest first, or a placeholder. */
export function InvoiceDraftList({ data, drafts, showProject = true, emptyText }: { data: BackofficeData; drafts: InvoiceDraft[]; showProject?: boolean; emptyText: string }) {
  if (!drafts.length) return <p className="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-600">{emptyText}</p>;
  return (
    <div className="space-y-3">
      {drafts.map((d) => (
        <InvoiceDraftCard key={d.id} data={data} draft={d} showProject={showProject} />
      ))}
    </div>
  );
}

export const byNewest = (a: InvoiceDraft, b: InvoiceDraft) => ((a.invoicedOn ?? a.createdOn) < (b.invoicedOn ?? b.createdOn) ? 1 : -1);

function MarkInvoicedDialog({ draft, projectName, onClose }: { draft: InvoiceDraft; projectName: string; onClose: () => void }) {
  const { today, mutate } = useBackoffice();
  const notify = useNotice();
  const opener = useOpenerElement();
  const [invoicedOn, setInvoicedOn] = useState(today);
  const [ref, setRef] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={`Mark ${projectName} invoiced`} description="Use after creating the invoice in QuickBooks. This doesn't mark it paid or pay any contractor." returnFocusTo={opener}>
        <form
          noValidate
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!isISODate(invoicedOn)) return setError("Enter the invoice date.");
            setSaving(true);
            try {
              await mutate((r) => r.markDraftInvoiced({ draftId: draft.id, invoicedOn, quickbooksInvoiceRef: ref }));
              notify(`${projectName} marked invoiced (${formatCents(draft.amountCents)}).`);
              onClose();
            } catch (err) {
              setError(err instanceof DomainError ? err.message : "Could not save. Nothing was changed.");
              setSaving(false);
            }
          }}
        >
          <p className="rounded-lg bg-slate-50 p-3 text-sm">
            <strong className="tabular">{formatCents(draft.amountCents)}</strong> through {formatDate(draft.throughDate, { year: true })}
          </p>
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

function LinkDialog({ data, draft, onClose }: { data: BackofficeData; draft: InvoiceDraft; onClose: () => void }) {
  const { mutate } = useBackoffice();
  const notify = useNotice();
  const opener = useOpenerElement();
  const options = linkableInvoices(data, draft.customerId);
  const suggested = options.find((i) => draft.quickbooksInvoiceRef && i.docNumber === draft.quickbooksInvoiceRef) ?? options.find((i) => i.totalCents === draft.amountCents);
  const [choice, setChoice] = useState(suggested?.qbInvoiceId ?? options[0]?.qbInvoiceId ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const chosen = options.find((i) => i.qbInvoiceId === choice);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="Link to a QuickBooks invoice" description="Choose the synced invoice you created from this draft. Payment status then comes from QuickBooks." returnFocusTo={opener}>
        {options.length === 0 ? (
          <div className="space-y-4">
            <p className="text-sm text-slate-700">No unlinked QuickBooks invoices for this customer have synced yet. Try again after QuickBooks syncs.</p>
            <div className="flex justify-end">
              <Button variant="secondary" onClick={onClose}>Close</Button>
            </div>
          </div>
        ) : (
          <form
            noValidate
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              setSaving(true);
              try {
                await mutate((r) => r.linkDraft({ draftId: draft.id, qbInvoiceId: choice }));
                notify(`Linked to ${chosen?.docNumber ?? `QuickBooks #${choice}`}.`);
                onClose();
              } catch (err) {
                setError(err instanceof DomainError ? err.message : "Could not link. Nothing was changed.");
                setSaving(false);
              }
            }}
          >
            <Field label="QuickBooks invoice" htmlFor="link-inv" error={error ?? undefined}>
              <Select id="link-inv" value={choice} onChange={(e) => setChoice(e.target.value)}>
                {options.map((i) => (
                  <option key={i.qbInvoiceId} value={i.qbInvoiceId}>
                    {i.docNumber ?? `#${i.qbInvoiceId}`} · {formatDate(i.txnDate)} · {formatCents(i.totalCents)}
                  </option>
                ))}
              </Select>
            </Field>
            {chosen && chosen.totalCents !== draft.amountCents ? (
              <p className="flex gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900" role="status">
                <AlertTriangle className="size-4 shrink-0" aria-hidden />
                <span>
                  This invoice is {formatCents(chosen.totalCents)}; the draft is {formatCents(draft.amountCents)}. You can still link it if you adjusted lines in QuickBooks.
                </span>
              </p>
            ) : null}
            <div className="flex justify-end border-t border-slate-200 pt-4">
              <Button type="submit" disabled={saving || !choice}>{saving ? "Linking…" : "Link invoice"}</Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function UndoDialog({ draft, onClose }: { draft: InvoiceDraft; onClose: () => void }) {
  const { mutate } = useBackoffice();
  const notify = useNotice();
  const opener = useOpenerElement();
  const copy = {
    draft: { title: "Delete this draft?", body: "Its hours and expenses return to Ready to invoice.", action: "Delete draft", done: "Draft deleted." },
    invoiced: { title: "Undo “invoiced”?", body: "The draft goes back to Draft so you can change it. QuickBooks is not changed.", action: "Undo", done: "Back to Draft." },
    linked: { title: "Unlink from QuickBooks?", body: "The draft stays Invoiced and can be linked to another invoice. QuickBooks is not changed.", action: "Unlink", done: "Unlinked." },
  }[draft.status];
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={copy.title} description={copy.body} returnFocusTo={opener}>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose}>Keep it</Button>
          <Button
            variant="danger"
            onClick={async () => {
              try {
                await mutate((r) => r.undoDraftStep(draft.id));
                notify(copy.done);
              } catch (err) {
                notify(err instanceof DomainError ? err.message : "Could not change the draft. Nothing was changed.");
              }
              onClose();
            }}
          >
            {copy.action}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
