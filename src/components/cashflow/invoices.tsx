"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, ErrorState, LoadingState, PageHeader } from "@/components/ui/states";
import { useNotice } from "@/components/layout/notice";
import { useBackoffice } from "@/lib/data/backoffice-provider";
import { formatDate } from "@/lib/domain/dates";
import { formatCents } from "@/lib/domain/money";
import { listInvoices, outstandingInvoiceCents, type InvoiceView } from "@/lib/domain/quickbooks-sync";
import type { BackofficeData } from "@/lib/domain/types";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { CashFlowTabs } from "./cashflow-tabs";
import { MarkDialog } from "./mark-dialog";

type Filter = "open" | "paid" | "all";
const isSettled = (v: InvoiceView) => v.status === "paid" || v.status === "marked_paid";

export function InvoiceStatusBadge({ v }: { v: InvoiceView }) {
  switch (v.status) {
    case "paid":
      return <Badge tone="success">Paid in QuickBooks</Badge>;
    case "marked_paid":
      return <Badge tone="info">Marked paid {v.manuallyPaid ? formatDate(v.manuallyPaid.on, { year: false }) : ""}</Badge>;
    case "overdue":
      return <Badge tone="danger">Overdue · {v.daysOverdue}d</Badge>;
    case "partially_paid":
      return <Badge tone="warning">Partially paid</Badge>;
    default:
      return <Badge tone="warning">Open</Badge>;
  }
}

export function InvoicesPage() {
  const { state } = useBackoffice();
  return (
    <>
      <PageHeader title="Cash flow" description="Customer invoices as they are in QuickBooks. Balances come from QuickBooks; you can mark one paid here if QuickBooks hasn't caught up." />
      <CashFlowTabs />
      {state.status === "loading" ? <LoadingState /> : null}
      {state.status === "error" ? <ErrorState message={state.message} /> : null}
      {state.status === "ready" ? <InvoiceList data={state.data} /> : null}
    </>
  );
}

function InvoiceList({ data }: { data: BackofficeData }) {
  const { today } = useBackoffice();
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const filter: Filter = (["open", "paid", "all"] as const).find((f) => f === params.get("show")) ?? "open";
  const all = useMemo(() => listInvoices(data, today), [data, today]);
  const counts = { open: all.filter((v) => !isSettled(v)).length, paid: all.filter(isSettled).length, all: all.length };
  const shown = all.filter((v) => (filter === "all" ? true : filter === "open" ? !isSettled(v) : isSettled(v)));
  const overdue = all.filter((v) => v.status === "overdue");

  return (
    <div className="space-y-4">
      <section aria-label="Summary" className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Card className="p-4">
          <p className="text-sm text-slate-600">Open balance</p>
          <p className="tabular mt-1 text-2xl font-semibold">{formatCents(outstandingInvoiceCents(all))}</p>
          <p className="text-xs text-slate-600">{counts.open} open invoice{counts.open === 1 ? "" : "s"}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-slate-600">Overdue</p>
          <p className={cn("tabular mt-1 text-2xl font-semibold", overdue.length && "text-red-700")}>{formatCents(overdue.reduce((s, v) => s + v.balanceCents, 0))}</p>
          <p className="text-xs text-slate-600">{overdue.length} invoice{overdue.length === 1 ? "" : "s"}</p>
        </Card>
        <Card className="col-span-2 p-4 lg:col-span-1">
          <p className="text-sm text-slate-600">Last synced from QuickBooks</p>
          <p className="mt-1 text-lg font-semibold">{all.length ? formatDate(all.map((v) => v.lastSyncedOn).sort().at(-1)!) : "Never"}</p>
          <p className="text-xs text-slate-600">{all.some((v) => v.sample) ? "Sample data — QuickBooks isn't connected" : "Via Slashbin"}</p>
        </Card>
      </section>

      <div role="group" aria-label="Show invoices" className="flex flex-wrap gap-1">
        {(["open", "paid", "all"] as const).map((f) => (
          <Button key={f} size="sm" variant={filter === f ? "primary" : "ghost"} aria-pressed={filter === f} onClick={() => router.replace(`${pathname}?show=${f}`, { scroll: false })}>
            {f === "open" ? "Open" : f === "paid" ? "Paid" : "All"} ({counts[f]})
          </Button>
        ))}
      </div>

      {shown.length === 0 ? (
        <EmptyState title={filter === "open" ? "No open invoices" : "Nothing here"} />
      ) : (
        <InvoiceRows data={data} invoices={shown} />
      )}
    </div>
  );
}

export function InvoiceRows({ data, invoices, showCustomer = true }: { data: BackofficeData; invoices: InvoiceView[]; showCustomer?: boolean }) {
  const { mutate } = useBackoffice();
  const notify = useNotice();
  const [marking, setMarking] = useState<InvoiceView | null>(null);
  return (
    <>
      <Card>
        <ul className="divide-y divide-slate-200">
          {invoices.map((v) => {
            const customer = data.customers.find((c) => c.id === v.customerId);
            const billed = v.docNumber ? data.billingRecords.find((r) => r.quickbooksInvoiceRef === v.docNumber) : undefined;
            const label = v.docNumber ?? `QuickBooks #${v.qbInvoiceId}`;
            return (
              <li key={v.id} className="flex flex-col gap-3 p-4 xl:flex-row xl:items-center">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-slate-900">
                    {label}
                    {showCustomer ? <span className="font-normal text-slate-600"> · {customer?.name ?? "Unmatched customer"}</span> : null}
                  </p>
                  <p className="text-sm text-slate-600">
                    Issued {formatDate(v.txnDate)}
                    {v.dueDate ? ` · due ${formatDate(v.dueDate)}` : ""}
                    {billed ? (
                      <>
                        {" · "}
                        <Link href={routes.project(billed.projectId)} className="underline underline-offset-2">billed hours</Link>
                      </>
                    ) : null}
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    <InvoiceStatusBadge v={v} />
                    {v.sample ? <Badge>QuickBooks (sample)</Badge> : <Badge>QuickBooks</Badge>}
                  </div>
                  {v.payments.length ? (
                    <p className="mt-1 text-xs text-slate-500">
                      Payments: {v.payments.map((p) => `${formatCents(p.amountCents)} on ${formatDate(p.receipt.receivedOn, { year: false })}`).join(" · ")}
                    </p>
                  ) : null}
                  {v.manuallyPaid?.note ? <p className="mt-1 text-xs text-slate-500">Note: {v.manuallyPaid.note}</p> : null}
                </div>
                <div className="xl:w-48 xl:shrink-0 xl:text-right">
                  <p className="tabular text-lg font-semibold text-slate-900">{formatCents(v.balanceCents)}</p>
                  <p className="tabular text-xs text-slate-600">
                    open of {formatCents(v.totalCents)}
                    {v.status === "marked_paid" ? " in QuickBooks" : ""}
                  </p>
                </div>
                <div className="flex gap-2 xl:w-44 xl:shrink-0 xl:justify-end">
                  {v.status === "marked_paid" ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="flex-1 xl:flex-none"
                      onClick={async () => {
                        await mutate((r) => r.setInvoiceManuallyPaid(v.id, null));
                        notify(`${label} is no longer marked paid.`);
                      }}
                    >
                      Undo mark<span className="sr-only"> for {label}</span>
                    </Button>
                  ) : v.status !== "paid" ? (
                    <Button variant="secondary" size="sm" className="flex-1 xl:flex-none" onClick={() => setMarking(v)}>
                      Mark paid<span className="sr-only"> {label}</span>
                    </Button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      </Card>
      {marking ? (
        <MarkDialog
          title={`Mark ${marking.docNumber ?? "invoice"} paid`}
          description="For payments QuickBooks doesn't show yet. This only changes Backoffice — update QuickBooks too. If QuickBooks later shows it paid, that replaces this mark."
          dateLabel="Paid on"
          confirmLabel="Mark paid"
          summary={
            <>
              <strong className="tabular">{formatCents(marking.balanceCents)}</strong> open of {formatCents(marking.totalCents)} · {data.customers.find((c) => c.id === marking.customerId)?.name}
            </>
          }
          onSave={async (value) => {
            await mutate((r) => r.setInvoiceManuallyPaid(marking.id, value));
            notify(`${marking.docNumber ?? "Invoice"} marked paid.`);
          }}
          onClose={() => setMarking(null)}
        />
      ) : null}
    </>
  );
}
