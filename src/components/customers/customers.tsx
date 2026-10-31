"use client";

import { ChevronRight, Pencil, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { EmptyState, ErrorState, LoadingState, PageHeader } from "@/components/ui/states";
import { useNotice } from "@/components/layout/notice";
import { BackLink } from "@/components/payroll/back-link";
import { AddProjectDialog, ProjectRows } from "@/components/projects/project-list";
import { BillingRecords } from "@/components/projects/invoiced";
import { useBackoffice } from "@/lib/data/backoffice-provider";
import { billingBreakdown, CADENCE_LABEL } from "@/lib/domain/billing";
import { formatCents } from "@/lib/domain/money";
import type { BackofficeData, Customer } from "@/lib/domain/types";
import { routes } from "@/lib/routes";
import { CustomerForm } from "./customer-form";

function customerTotals(data: BackofficeData, id: string) {
  const b = billingBreakdown(data).find((c) => c.customer.id === id);
  return {
    projects: data.projects.filter((p) => p.customerId === id),
    uninvoicedCents: b?.knownAmountCents ?? 0,
    complete: b?.complete ?? true,
    invoicedCents: data.billingRecords.filter((r) => r.customerId === id).reduce((s, r) => s + r.amountCents, 0),
  };
}

export function CustomersPage() {
  const { state } = useBackoffice();
  return (
    <>
      <PageHeader title="Customers" description="Customers and their projects. Invoices are created in QuickBooks." actions={<AddCustomerDialog />} />
      {state.status === "loading" ? <LoadingState /> : null}
      {state.status === "error" ? <ErrorState message={state.message} /> : null}
      {state.status === "ready" ? (
        state.data.customers.length === 0 ? (
          <EmptyState title="No customers yet">Add a customer, then add their projects.</EmptyState>
        ) : (
          <Card>
            <ul className="divide-y divide-slate-200">
              {[...state.data.customers]
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((c) => {
                  const t = customerTotals(state.data, c.id);
                  return (
                    <li key={c.id}>
                      <Link href={routes.customer(c.id)} className="flex items-center gap-3 p-4 hover:bg-slate-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue-600">
                        <div className="flex min-w-0 flex-1 flex-col gap-2 lg:flex-row lg:items-center">
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-slate-900">{c.name}</p>
                            <p className="text-sm text-slate-600">
                              {t.projects.length} project{t.projects.length === 1 ? "" : "s"} · {CADENCE_LABEL[c.billingCadence]} billing
                              {c.quickbooksCustomerId ? ` · QuickBooks ${c.quickbooksCustomerId}` : ""}
                            </p>
                          </div>
                          <dl className="grid grid-cols-2 gap-x-4 text-sm lg:w-72 lg:shrink-0">
                            <div>
                              <dt className="text-xs text-slate-500">Uninvoiced</dt>
                              <dd className="tabular font-medium">
                                {formatCents(t.uninvoicedCents)}
                                {!t.complete ? <span className="text-red-700"> + unpriced</span> : null}
                              </dd>
                            </div>
                            <div>
                              <dt className="text-xs text-slate-500">Invoiced</dt>
                              <dd className="tabular font-medium">{formatCents(t.invoicedCents)}</dd>
                            </div>
                          </dl>
                        </div>
                        <ChevronRight className="size-5 shrink-0 text-slate-400" aria-hidden />
                      </Link>
                    </li>
                  );
                })}
            </ul>
          </Card>
        )
      ) : null}
    </>
  );
}

function AddCustomerDialog() {
  const [open, setOpen] = useState(false);
  const { mutate } = useBackoffice();
  const notify = useNotice();
  const router = useRouter();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="size-4" aria-hidden />
          Add customer
        </Button>
      </DialogTrigger>
      {open ? (
        <DialogContent title="Add a customer">
          <CustomerForm
            submitLabel="Add customer"
            onSubmit={async (input) => {
              const c = await mutate((r) => r.addCustomer(input));
              notify(`${c.name} added.`);
              setOpen(false);
              router.push(routes.customer(c.id));
            }}
          />
        </DialogContent>
      ) : null}
    </Dialog>
  );
}

export function CustomerProfileRoute() {
  const id = useSearchParams().get("id") ?? "";
  const { state } = useBackoffice();
  if (state.status === "loading") return <LoadingState />;
  if (state.status === "error") return <ErrorState message={state.message} />;
  const c = state.data.customers.find((x) => x.id === id);
  if (!c) {
    return (
      <>
        <BackLink href={routes.customers} label="Customers" />
        <EmptyState title="Customer not found" />
      </>
    );
  }
  const t = customerTotals(state.data, c.id);
  return (
    <>
      <BackLink href={routes.customers} label="Customers" />
      <PageHeader
        title={c.name}
        description={`${CADENCE_LABEL[c.billingCadence]} billing${c.quickbooksCustomerId ? ` · QuickBooks ${c.quickbooksCustomerId}` : " · Not linked to QuickBooks"}`}
        actions={<EditCustomerDialog customer={c} />}
      />
      {c.notes ? <p className="-mt-3 mb-6 text-sm text-slate-600">{c.notes}</p> : null}
      <section aria-label="Summary" className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Card className="p-4">
          <p className="text-sm text-slate-600">Uninvoiced</p>
          <p className="tabular mt-1 text-2xl font-semibold">{formatCents(t.uninvoicedCents)}</p>
          {!t.complete ? <p className="text-xs text-red-700">Some hours have no billing rate</p> : null}
        </Card>
        <Card className="p-4">
          <p className="text-sm text-slate-600">Invoiced to date</p>
          <p className="tabular mt-1 text-2xl font-semibold">{formatCents(t.invoicedCents)}</p>
        </Card>
        <Card className="col-span-2 flex items-center p-4 lg:col-span-1">
          <Link href={routes.billing} className="inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-slate-300 text-sm font-medium hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-blue-600">
            Go to Ready to invoice
          </Link>
        </Card>
      </section>
      <section aria-labelledby="cust-projects" className="mt-8 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="cust-projects" className="text-sm font-semibold uppercase tracking-wide text-slate-600">Projects ({t.projects.length})</h2>
          <AddProjectDialog data={state.data} customerId={c.id} label="Add project" />
        </div>
        {t.projects.length ? <ProjectRows data={state.data} projects={t.projects} /> : <p className="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-600">No projects yet.</p>}
      </section>
      <section aria-labelledby="cust-invoiced" className="mt-8 space-y-3">
        <h2 id="cust-invoiced" className="text-sm font-semibold uppercase tracking-wide text-slate-600">Invoiced</h2>
        <BillingRecords data={state.data} records={state.data.billingRecords.filter((r) => r.customerId === c.id).sort((a, b) => (a.invoicedOn < b.invoicedOn ? 1 : -1))} />
      </section>
    </>
  );
}

function EditCustomerDialog({ customer }: { customer: Customer }) {
  const [open, setOpen] = useState(false);
  const { mutate } = useBackoffice();
  const notify = useNotice();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary">
          <Pencil className="size-4" aria-hidden />
          Edit customer
        </Button>
      </DialogTrigger>
      {open ? (
        <DialogContent title={`Edit ${customer.name}`}>
          <CustomerForm
            customer={customer}
            submitLabel="Save changes"
            onSubmit={async (input) => {
              await mutate((r) => r.updateCustomer(customer.id, input));
              notify(`${input.name} saved.`);
              setOpen(false);
            }}
          />
        </DialogContent>
      ) : null}
    </Dialog>
  );
}
