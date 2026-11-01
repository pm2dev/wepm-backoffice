"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import { EmptyState, ErrorState, LoadingState, PageHeader } from "@/components/ui/states";
import { useBackoffice } from "@/lib/data/backoffice-provider";
import { billingBreakdown, CADENCE_LABEL } from "@/lib/domain/billing";
import { isISODate } from "@/lib/domain/dates";
import { formatCents } from "@/lib/domain/money";
import { routes } from "@/lib/routes";
import { BreakdownCard } from "./breakdown-card";
import { ProjectsTabs } from "./projects-tabs";

export function ReadyToInvoicePage() {
  const { state, today } = useBackoffice();
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const through = isISODate(params.get("through") ?? "") ? params.get("through")! : "";
  const breakdown = useMemo(() => (state.status === "ready" ? billingBreakdown(state.data, through || undefined) : []), [state, through]);
  const total = breakdown.reduce((s, c) => s + c.knownAmountCents, 0);
  const incomplete = breakdown.some((c) => !c.complete);

  return (
    <>
      <PageHeader title="Projects & billing" description="Approved, billable hours not yet invoiced — what to bill each customer in QuickBooks." />
      <ProjectsTabs />
      {state.status === "loading" ? <LoadingState /> : null}
      {state.status === "error" ? <ErrorState message={state.message} /> : null}
      {state.status === "ready" ? (
        <div className="space-y-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <Card className="p-4 sm:min-w-64">
              <p className="text-sm text-slate-600">Uninvoiced{through ? " through the selected date" : ""}</p>
              <p className="tabular mt-1 text-2xl font-semibold">{formatCents(total)}</p>
              {incomplete ? <p className="text-xs text-red-700">Some hours have no billing rate yet</p> : <p className="text-xs text-slate-600">All hours priced</p>}
            </Card>
            <div className="sm:w-56">
              <Field label="Work through (optional)" htmlFor="through" hint="Limit to hours worked on or before a date.">
                <Input
                  id="through"
                  type="date"
                  value={through}
                  max={today}
                  onChange={(e) => {
                    const q = new URLSearchParams(params.toString());
                    if (e.target.value) q.set("through", e.target.value);
                    else q.delete("through");
                    router.replace(`${pathname}?${q.toString()}`, { scroll: false });
                  }}
                />
              </Field>
            </div>
          </div>

          {breakdown.length === 0 ? (
            <EmptyState title="Nothing to invoice">New approved billable hours will appear here.</EmptyState>
          ) : (
            breakdown.map((c) => (
              <section key={c.customer.id} aria-labelledby={`cust-${c.customer.id}`} className="space-y-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 id={`cust-${c.customer.id}`} className="text-lg font-semibold text-slate-900">
                    <Link href={routes.customer(c.customer.id)} className="underline-offset-2 hover:underline">{c.customer.name}</Link>
                  </h2>
                  <p className="text-sm text-slate-600">
                    {CADENCE_LABEL[c.customer.billingCadence]} billing{c.customer.quickbooksCustomerId ? ` · QuickBooks ${c.customer.quickbooksCustomerId}` : ""} ·{" "}
                    <strong className="tabular text-slate-900">{formatCents(c.knownAmountCents)}</strong>
                  </p>
                </div>
                {c.projects.map((b) => (
                  <BreakdownCard key={b.project.id} b={b} through={through || undefined} />
                ))}
              </section>
            ))
          )}
          <p className="text-xs text-slate-500">Internal and nonbillable projects never appear here; their hours are still paid to contractors. Billing rates are independent of contractor pay.</p>
        </div>
      ) : null}
    </>
  );
}
