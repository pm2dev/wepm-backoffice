"use client";

import { Pencil } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { EmptyState, ErrorState, LoadingState, PageHeader } from "@/components/ui/states";
import { useNotice } from "@/components/layout/notice";
import { BackLink } from "@/components/payroll/back-link";
import { useBackoffice } from "@/lib/data/backoffice-provider";
import { billingBreakdown, CADENCE_LABEL, projectSummary } from "@/lib/domain/billing";
import { formatCents, formatHours } from "@/lib/domain/money";
import { PROJECT_STATUS_LABELS, type BackofficeData, type Project } from "@/lib/domain/types";
import { formatDate } from "@/lib/domain/dates";
import { routes } from "@/lib/routes";
import { AddProjectExpenseDialog, ProjectExpenseList } from "@/components/expenses/project-expenses";
import { expensesFor } from "@/lib/domain/project-expenses";
import { BreakdownCard } from "./breakdown-card";
import { BillingRecords } from "./invoiced";
import { billingLabel, BillingRatesCard } from "./billing-rates";
import { ProjectForm } from "./project-form";

export function ProjectProfileRoute() {
  const id = useSearchParams().get("id") ?? "";
  const { state } = useBackoffice();
  if (state.status === "loading") return <LoadingState />;
  if (state.status === "error") return <ErrorState message={state.message} />;
  const p = state.data.projects.find((x) => x.id === id);
  if (!p) {
    return (
      <>
        <BackLink href={routes.projectList} label="All projects" />
        <EmptyState title="Project not found" />
      </>
    );
  }
  return <ProjectProfile data={state.data} project={p} />;
}

function ProjectProfile({ data, project: p }: { data: BackofficeData; project: Project }) {
  const { today } = useBackoffice();
  const customer = data.customers.find((c) => c.id === p.customerId);
  const s = projectSummary(data, p.id);
  const breakdown = billingBreakdown(data).flatMap((c) => c.projects).find((b) => b.project.id === p.id);
  const cadence = p.billingCadence ?? customer?.billingCadence;
  return (
    <>
      <BackLink href={customer ? routes.customer(customer.id) : routes.projectList} label={customer?.name ?? "All projects"} />
      <PageHeader
        title={p.name}
        description={customer ? <Link href={routes.customer(customer.id)} className="underline-offset-2 hover:underline">{customer.name}</Link> : "Internal project · WEPM Labs"}
        actions={<EditProjectDialog data={data} project={p} />}
      />
      <div className="mb-6 flex flex-wrap gap-1.5">
        <Badge tone={p.billable && p.customerId ? "info" : "neutral"}>{billingLabel(data, p, today)}</Badge>
        <Badge tone={p.status === "active" ? "success" : p.status === "on_hold" ? "warning" : "neutral"}>{PROJECT_STATUS_LABELS[p.status]}</Badge>
        {p.startDate || p.endDate ? <Badge>{p.startDate ? formatDate(p.startDate, { year: true }) : "No start date"} – {p.endDate ? formatDate(p.endDate, { year: true }) : "ongoing"}</Badge> : null}
        {cadence && p.billable ? <Badge>{CADENCE_LABEL[cadence]} billing</Badge> : null}
      </div>

      <section aria-label="Summary" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Approved hours" value={formatHours(s.approvedMinutes)} />
        <Stat label="Uninvoiced" value={p.billable && p.customerId ? formatCents(s.uninvoicedAmountCents) : "Not billed"} sub={s.uninvoicedMinutes ? formatHours(s.uninvoicedMinutes) : undefined} />
        <Stat label="Invoiced to date" value={formatCents(s.invoicedAmountCents)} />
        <Stat label="wepm.app project ID" value={p.wepmProjectId ?? "Not linked"} small />
        {budgetText(p) ? <Stat label={p.customerId ? "Budget" : "Cost budget"} value={budgetText(p)!} small /> : null}
      </section>

      <div className="mt-8 grid gap-8 xl:grid-cols-[1fr_22rem]">
        <div className="min-w-0 space-y-8">
          {p.billable && p.customerId ? (
            <section aria-labelledby="uninvoiced-heading" className="space-y-3">
              <h2 id="uninvoiced-heading" className="text-sm font-semibold uppercase tracking-wide text-slate-600">Ready to invoice</h2>
              {breakdown ? <BreakdownCard b={breakdown} showProjectLink={false} /> : <p className="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-600">No uninvoiced billable hours.</p>}
            </section>
          ) : (
            <Card className="p-4 text-sm text-slate-700">
              {p.customerId ? "This project is nonbillable." : "Internal project."} Approved hours are paid to contractors but never appear in customer billing.
            </Card>
          )}
          <section aria-labelledby="history-heading" className="space-y-3">
            <h2 id="history-heading" className="text-sm font-semibold uppercase tracking-wide text-slate-600">Invoiced</h2>
            <BillingRecords data={data} records={s.records} showProject={false} />
          </section>
          <section aria-labelledby="expenses-heading" className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="expenses-heading" className="text-sm font-semibold uppercase tracking-wide text-slate-600">Expenses</h2>
              <AddProjectExpenseDialog data={data} projectId={p.id} />
            </div>
            <ProjectExpenseList data={data} expenses={expensesFor(data, p.id)} showProject={false} emptyText="No expenses on this project yet." />
          </section>
        </div>
        <section aria-labelledby="rates-heading">
          <h2 id="rates-heading" className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-600">Billing rates</h2>
          <BillingRatesCard data={data} project={p} />
        </section>
      </div>
    </>
  );
}

function Stat({ label, value, sub, small }: { label: string; value: string; sub?: string; small?: boolean }) {
  return (
    <Card className="p-4">
      <p className="text-sm text-slate-600">{label}</p>
      <p className={`tabular mt-1 font-semibold break-all ${small ? "text-sm" : "text-xl sm:text-2xl"}`}>{value}</p>
      {sub ? <p className="text-xs text-slate-600">{sub}</p> : null}
    </Card>
  );
}

function EditProjectDialog({ data, project }: { data: BackofficeData; project: Project }) {
  const [open, setOpen] = useState(false);
  const { today, mutate } = useBackoffice();
  const notify = useNotice();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary">
          <Pencil className="size-4" aria-hidden />
          Edit project
        </Button>
      </DialogTrigger>
      {open ? (
        <DialogContent title={`Edit ${project.name}`}>
          <ProjectForm
            data={data}
            project={project}
            submitLabel="Save changes"
            onSubmit={async (input) => {
              const before = data.timeExceptions.length;
              await mutate((r) => r.updateProject(project.id, input, today));
              notify(`${input.name} saved.${before ? " Held-back time entries were re-checked." : ""}`);
              setOpen(false);
            }}
          />
        </DialogContent>
      ) : null}
    </Dialog>
  );
}

function budgetText(p: Project): string | null {
  if (!p.customerId) return p.costBudgetCents ? formatCents(p.costBudgetCents) : null;
  const parts = [p.budgetCents ? formatCents(p.budgetCents) : null, p.budgetMinutes ? formatHours(p.budgetMinutes) : null].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}
