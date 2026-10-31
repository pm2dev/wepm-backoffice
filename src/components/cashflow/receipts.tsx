"use client";

import { ChevronRight, FlaskConical } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/field";
import { EmptyState, ErrorState, LoadingState, PageHeader } from "@/components/ui/states";
import { useNotice } from "@/components/layout/notice";
import { useBackoffice } from "@/lib/data/backoffice-provider";
import { formatDate, isISODate } from "@/lib/domain/dates";
import { formatCents, parseDollars } from "@/lib/domain/money";
import { DomainError } from "@/lib/domain/payroll";
import type { BackofficeData } from "@/lib/domain/types";
import { routes } from "@/lib/routes";

export function ReceiptsPage() {
  const { state } = useBackoffice();
  return (
    <>
      <PageHeader
        title="Cash flow"
        description="When a customer pays an invoice, see a suggested way to use it: contractor pay first, then bills, then what's left. Suggestions only — nothing is reserved or paid."
        actions={state.status === "ready" ? <SimulateDialog data={state.data} /> : null}
      />
      {state.status === "loading" ? <LoadingState /> : null}
      {state.status === "error" ? <ErrorState message={state.message} /> : null}
      {state.status === "ready" ? <ReceiptList data={state.data} /> : null}
    </>
  );
}

function ReceiptList({ data }: { data: BackofficeData }) {
  const receipts = [...data.invoiceReceipts].sort((a, b) => (a.receivedOn === b.receivedOn ? (a.id < b.id ? 1 : -1) : a.receivedOn < b.receivedOn ? 1 : -1));
  if (receipts.length === 0) return <EmptyState title="No invoice payments yet">Payments recorded in QuickBooks will appear here once the integration is connected.</EmptyState>;
  return (
    <section aria-labelledby="receipts-heading">
      <h2 id="receipts-heading" className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-600">Invoice payments received</h2>
      <Card>
        <ul className="divide-y divide-slate-200">
          {receipts.map((r) => {
            const customer = data.customers.find((c) => c.id === r.customerId);
            return (
              <li key={r.id}>
                <Link href={routes.receipt(r.id)} className="flex items-center gap-3 p-4 hover:bg-slate-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue-600">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-slate-900">{customer?.name ?? "Unmatched customer"}</p>
                    <p className="text-sm text-slate-600">
                      Received {formatDate(r.receivedOn, { weekday: true })}
                      {r.invoiceRef ? ` · ${r.invoiceRef}` : ""}
                    </p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {r.simulated ? <Badge tone="sample">Simulated</Badge> : <Badge>QuickBooks</Badge>}
                      {!customer ? <Badge tone="warning">No matching QuickBooks customer ID</Badge> : null}
                    </div>
                  </div>
                  <p className="tabular text-lg font-semibold text-slate-900">{formatCents(r.amountCents)}</p>
                  <span className="sr-only">See suggestions</span>
                  <ChevronRight className="size-5 shrink-0 text-slate-400" aria-hidden />
                </Link>
              </li>
            );
          })}
        </ul>
      </Card>
    </section>
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
        <DialogContent title="Simulate an invoice payment" description="Prototype only. In production, payments arrive from QuickBooks automatically.">
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
  const [customerId, setCustomerId] = useState(data.customers[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [receivedOn, setReceivedOn] = useState(today);
  const [invoiceRef, setInvoiceRef] = useState("");
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
          const customer = data.customers.find((c) => c.id === customerId);
          const { receipt } = await mutate((r) =>
            r.recordInvoiceReceipt({
              externalPaymentId: `sim-${Date.now()}`,
              customerId: customer?.id ?? null,
              quickbooksCustomerId: customer?.quickbooksCustomerId,
              invoiceRef,
              amountCents: cents,
              receivedOn,
              simulated: true,
            }),
          );
          notify(`Simulated ${formatCents(cents)} payment recorded.`);
          onDone();
          router.push(routes.receipt(receipt.id));
        } catch (err) {
          setError(err instanceof DomainError ? err.message : "Could not save.");
        }
      }}
    >
      <Field label="Customer" htmlFor="sim-customer">
        <Select id="sim-customer" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
          {data.customers.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
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
      <Field label="Invoice # (optional)" htmlFor="sim-ref">
        <Input id="sim-ref" value={invoiceRef} onChange={(e) => setInvoiceRef(e.target.value)} autoComplete="off" />
      </Field>
      <div className="flex justify-end border-t border-slate-200 pt-4">
        <Button type="submit">Record and see suggestions</Button>
      </div>
    </form>
  );
}
