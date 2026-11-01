"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, useOpenerElement } from "@/components/ui/dialog";
import { EmptyState, ErrorState, LoadingState, PageHeader } from "@/components/ui/states";
import { useNotice } from "@/components/layout/notice";
import { useBackoffice } from "@/lib/data/backoffice-provider";
import { formatDate, formatRange } from "@/lib/domain/dates";
import { formatCents, formatHours } from "@/lib/domain/money";
import type { BackofficeData, BillingRecord } from "@/lib/domain/types";
import { routes } from "@/lib/routes";
import { ProjectsTabs } from "./projects-tabs";

export function BillingRecords({ data, records, showProject = true }: { data: BackofficeData; records: BillingRecord[]; showProject?: boolean }) {
  const [undo, setUndo] = useState<BillingRecord | null>(null);
  if (records.length === 0) return <p className="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-600">No hours marked invoiced yet.</p>;
  return (
    <>
      <Card>
        <ul className="divide-y divide-slate-200">
          {records.map((r) => {
            const project = data.projects.find((p) => p.id === r.projectId);
            const customer = data.customers.find((c) => c.id === r.customerId);
            const minutes = r.lines.reduce((s, l) => s + l.minutes, 0);
            return (
              <li key={r.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  {showProject ? (
                    <p className="font-medium text-slate-900">
                      {customer?.name} · <Link href={routes.project(r.projectId)} className="underline-offset-2 hover:underline">{project?.name}</Link>
                    </p>
                  ) : null}
                  <p className="text-sm text-slate-700">
                    Invoiced {formatDate(r.invoicedOn)}
                    {r.quickbooksInvoiceRef ? ` · ${r.quickbooksInvoiceRef}` : ""}
                  </p>
                  <p className="text-sm text-slate-600">
                    {formatHours(minutes)} · work dates {formatRange(r.firstWorkDate, r.lastWorkDate)}
                  </p>
                  <p className="text-xs text-slate-500">{r.lines.map((l) => `${l.task} ${formatHours(l.minutes)} × ${formatCents(l.rateCents)}`).join(" · ")}</p>
                </div>
                <div className="flex items-center gap-2 sm:flex-col sm:items-end">
                  <p className="tabular text-lg font-semibold">{formatCents(r.amountCents)}</p>
                  <Button variant="ghost" size="sm" onClick={() => setUndo(r)}>
                    Undo<span className="sr-only"> invoiced marking for {project?.name} on {formatDate(r.invoicedOn)}</span>
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      </Card>
      {undo ? <UndoDialog record={undo} onClose={() => setUndo(null)} /> : null}
    </>
  );
}

function UndoDialog({ record, onClose }: { record: BillingRecord; onClose: () => void }) {
  const { mutate } = useBackoffice();
  const notify = useNotice();
  const opener = useOpenerElement();
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="Undo invoiced marking?" description="Use this only if the hours were marked by mistake. They'll return to Ready to invoice. QuickBooks is not changed." returnFocusTo={opener}>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose}>Keep it</Button>
          <Button
            variant="danger"
            onClick={async () => {
              await mutate((r) => r.removeBillingRecord(record.id));
              notify(`Invoiced marking removed (${formatCents(record.amountCents)}).`);
              onClose();
            }}
          >
            Undo marking
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function InvoicedPage() {
  const { state } = useBackoffice();
  return (
    <>
      <PageHeader title="Projects & billing" description="Hours you marked invoiced after creating invoices in QuickBooks. Payment status lives in QuickBooks." />
      <ProjectsTabs />
      {state.status === "loading" ? <LoadingState /> : null}
      {state.status === "error" ? <ErrorState message={state.message} /> : null}
      {state.status === "ready" ? (
        state.data.billingRecords.length === 0 ? (
          <EmptyState title="Nothing marked invoiced yet" />
        ) : (
          <BillingRecords data={state.data} records={[...state.data.billingRecords].sort((a, b) => (a.invoicedOn < b.invoicedOn ? 1 : -1))} />
        )
      ) : null}
    </>
  );
}
