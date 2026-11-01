"use client";

import { ChevronRight, FlaskConical } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/field";
import { EmptyState, ErrorState, LoadingState, PageHeader } from "@/components/ui/states";
import { useNotice } from "@/components/layout/notice";
import { useBackoffice } from "@/lib/data/backoffice-provider";
import { formatDate, isISODate } from "@/lib/domain/dates";
import { centsToInput, formatCents, parseDollars } from "@/lib/domain/money";
import { DomainError } from "@/lib/domain/payroll";
import { listInvoices } from "@/lib/domain/quickbooks-sync";
import type { BackofficeData, InvoiceReceipt } from "@/lib/domain/types";
import { routes } from "@/lib/routes";
import { CashFlowTabs } from "./cashflow-tabs";
import { MarkDialog } from "./mark-dialog";

type Filter = "new" | "done" | "all";

export function SourceBadge({ r }: { r: InvoiceReceipt }) {
  if (r.simulated) return <Badge tone="sample">Simulated</Badge>;
  return <Badge>QuickBooks{r.sample ? " (sample)" : ""}</Badge>;
}

export function DoneBadge({ r }: { r: InvoiceReceipt }) {
  return r.done ? <Badge tone="success">Done {formatDate(r.done.on, { year: false })}</Badge> : <Badge tone="warning">New</Badge>;
}

export function ReceiptsPage() {
  const { state, repo } = useBackoffice();
  return (
    <>
      <PageHeader
        title="Cash flow"
        description="Customer payments from QuickBooks. Open one to see a suggested way to use it — contractor pay first, then bills — and mark it done once you've handled it."
        actions={state.status === "ready" && repo.simulateQuickBooksPayment ? <SimulateDialog data={state.data} /> : null}
      />
      <CashFlowTabs />
      {state.status === "loading" ? <LoadingState /> : null}
      {state.status === "error" ? <ErrorState message={state.message} /> : null}
      {state.status === "ready" ? <ReceiptList data={state.data} /> : null}
    </>
  );
}

function ReceiptList({ data }: { data: BackofficeData }) {
  const { mutate } = useBackoffice();
  const notify = useNotice();
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const filter: Filter = (["new", "done", "all"] as const).find((f) => f === params.get("show")) ?? "new";
  const [marking, setMarking] = useState<InvoiceReceipt | null>(null);

  const all = useMemo(
    () => [...data.invoiceReceipts].sort((a, b) => (a.receivedOn === b.receivedOn ? (a.id < b.id ? 1 : -1) : a.receivedOn < b.receivedOn ? 1 : -1)),
    [data.invoiceReceipts],
  );
  const counts = { new: all.filter((r) => !r.done).length, done: all.filter((r) => r.done).length, all: all.length };
  const shown = all.filter((r) => (filter === "all" ? true : filter === "new" ? !r.done : !!r.done));

  return (
    <div className="space-y-4">
      <div role="group" aria-label="Show payments" className="flex flex-wrap gap-1">
        {(["new", "done", "all"] as const).map((f) => (
          <Button
            key={f}
            size="sm"
            variant={filter === f ? "primary" : "ghost"}
            aria-pressed={filter === f}
            onClick={() => router.replace(`${pathname}?show=${f}`, { scroll: false })}
          >
            {f === "new" ? "New" : f === "done" ? "Done" : "All"} ({counts[f]})
          </Button>
        ))}
      </div>
      {shown.length === 0 ? (
        <EmptyState title={filter === "new" ? "No new payments" : "Nothing here"}>
          {filter === "new" ? "Payments recorded in QuickBooks show up here once Slashbin delivers them." : null}
        </EmptyState>
      ) : (
        <Card>
          <ul className="divide-y divide-slate-200">
            {shown.map((r) => {
              const customer = data.customers.find((c) => c.id === r.customerId);
              return (
                <li key={r.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                  <Link href={routes.receipt(r.id)} className="flex min-w-0 flex-1 items-center gap-3 rounded-lg focus-visible:outline-2 focus-visible:outline-blue-600">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-slate-900">{customer?.name ?? "Unmatched customer"}</p>
                      <p className="text-sm text-slate-600">
                        Received {formatDate(r.receivedOn, { weekday: true })}
                        {r.invoiceRef ? ` · ${r.invoiceRef}` : r.unappliedCents ? " · not applied to an invoice" : ""}
                        {r.paymentRef ? ` · ${r.paymentRef}` : ""}
                      </p>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        <DoneBadge r={r} />
                        <SourceBadge r={r} />
                        {!customer ? <Badge tone="warning">No matching QuickBooks customer ID</Badge> : null}
                      </div>
                      {r.done?.note ? <p className="mt-1 text-xs text-slate-500">{r.done.note}</p> : null}
                    </div>
                    <p className="tabular text-lg font-semibold text-slate-900">{formatCents(r.amountCents)}</p>
                    <span className="sr-only">See suggestions</span>
                    <ChevronRight className="size-5 shrink-0 text-slate-400" aria-hidden />
                  </Link>
                  <div className="flex gap-2 sm:w-32 sm:justify-end">
                    {r.done ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="flex-1 sm:flex-none"
                        onClick={async () => {
                          await mutate((repo) => repo.setPaymentDone(r.id, null));
                          notify(`${formatCents(r.amountCents)} payment reopened.`);
                        }}
                      >
                        Reopen<span className="sr-only"> payment of {formatCents(r.amountCents)} from {customer?.name}</span>
                      </Button>
                    ) : (
                      <Button variant="secondary" size="sm" className="flex-1 sm:flex-none" onClick={() => setMarking(r)}>
                        Mark done<span className="sr-only"> payment of {formatCents(r.amountCents)} from {customer?.name}</span>
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
      {marking ? <MarkPaymentDoneDialog data={data} receipt={marking} onClose={() => setMarking(null)} /> : null}
    </div>
  );
}

export function MarkPaymentDoneDialog({ data, receipt, onClose }: { data: BackofficeData; receipt: InvoiceReceipt; onClose: () => void }) {
  const { mutate } = useBackoffice();
  const notify = useNotice();
  const customer = data.customers.find((c) => c.id === receipt.customerId);
  return (
    <MarkDialog
      title="Mark payment done"
      description="Records that you've handled this payment. Nothing is paid or moved, and QuickBooks isn't changed."
      dateLabel="Done on"
      confirmLabel="Mark done"
      summary={
        <>
          <strong className="tabular">{formatCents(receipt.amountCents)}</strong> from {customer?.name ?? "an unmatched customer"} · received {formatDate(receipt.receivedOn)}
        </>
      }
      onSave={async (value) => {
        await mutate((r) => r.setPaymentDone(receipt.id, value));
        notify(`${formatCents(receipt.amountCents)} payment marked done.`);
      }}
      onClose={onClose}
    />
  );
}

function SimulateDialog({ data }: { data: BackofficeData }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary">
          <FlaskConical className="size-4" aria-hidden />
          Simulate a payment
        </Button>
      </DialogTrigger>
      {open ? (
        <DialogContent title="Simulate a QuickBooks payment" description="Prototype only. In production, payments recorded in QuickBooks arrive automatically through Slashbin.">
          <SimulateForm data={data} onDone={() => setOpen(false)} />
        </DialogContent>
      ) : null}
    </Dialog>
  );
}

function SimulateForm({ data, onDone }: { data: BackofficeData; onDone: () => void }) {
  const { today, mutate } = useBackoffice();
  const notify = useNotice();
  const router = useRouter();
  const linked = data.customers.filter((c) => c.quickbooksCustomerId);
  const [customerId, setCustomerId] = useState(linked[0]?.id ?? "");
  const openInvoices = listInvoices(data, today).filter((i) => i.customerId === customerId && i.balanceCents > 0);
  const [invoiceId, setInvoiceId] = useState("");
  const [amount, setAmount] = useState("");
  const [receivedOn, setReceivedOn] = useState(today);
  const [paymentRef, setPaymentRef] = useState("");
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const cents = parseDollars(amount);
        if (cents === null || cents <= 0) return setError("Enter an amount greater than $0.");
        if (!isISODate(receivedOn)) return setError("Enter the date received.");
        try {
          const receipt = await mutate((r) => r.simulateQuickBooksPayment!({ customerId, amountCents: cents, receivedOn, invoiceId: invoiceId || undefined, paymentRef }, today));
          notify(`Simulated ${formatCents(cents)} QuickBooks payment received.`);
          onDone();
          router.push(routes.receipt(receipt.id));
        } catch (err) {
          setError(err instanceof DomainError ? err.message : "Could not save.");
        }
      }}
    >
      <Field label="Customer" htmlFor="sim-customer">
        <Select
          id="sim-customer"
          value={customerId}
          onChange={(e) => {
            setCustomerId(e.target.value);
            setInvoiceId("");
          }}
        >
          {linked.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </Select>
      </Field>
      <Field label="Apply to invoice" htmlFor="sim-invoice" hint="Applying lowers the invoice's open balance, as QuickBooks would.">
        <Select
          id="sim-invoice"
          value={invoiceId}
          onChange={(e) => {
            setInvoiceId(e.target.value);
            const inv = openInvoices.find((i) => i.id === e.target.value);
            if (inv) setAmount(centsToInput(inv.balanceCents));
          }}
        >
          <option value="">Not applied (unapplied payment)</option>
          {openInvoices.map((i) => (
            <option key={i.id} value={i.id}>
              {i.docNumber ?? `#${i.qbInvoiceId}`} · {formatCents(i.balanceCents)} open
            </option>
          ))}
        </Select>
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Amount received" htmlFor="sim-amount" error={error ?? undefined}>
          <Input id="sim-amount" inputMode="decimal" autoComplete="off" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} aria-invalid={!!error} />
        </Field>
        <Field label="Date received" htmlFor="sim-date">
          <Input id="sim-date" type="date" value={receivedOn} onChange={(e) => setReceivedOn(e.target.value)} />
        </Field>
      </div>
      <Field label="Reference (optional)" htmlFor="sim-ref" hint="Check number or ACH reference.">
        <Input id="sim-ref" value={paymentRef} onChange={(e) => setPaymentRef(e.target.value)} autoComplete="off" />
      </Field>
      <div className="flex justify-end border-t border-slate-200 pt-4">
        <Button type="submit">Record and see suggestions</Button>
      </div>
    </form>
  );
}
