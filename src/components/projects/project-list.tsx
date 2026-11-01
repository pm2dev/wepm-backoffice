"use client";

import { ChevronRight, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { EmptyState, ErrorState, LoadingState, PageHeader } from "@/components/ui/states";
import { useNotice } from "@/components/layout/notice";
import { useBackoffice } from "@/lib/data/backoffice-provider";
import { projectSummary } from "@/lib/domain/billing";
import { formatCents, formatHours } from "@/lib/domain/money";
import type { BackofficeData, Project } from "@/lib/domain/types";
import { routes } from "@/lib/routes";
import { ProjectForm } from "./project-form";
import { ProjectsTabs } from "./projects-tabs";

export function billingLabel(p: Project) {
  if (!p.customerId) return "Internal";
  if (!p.billable) return "Nonbillable";
  if (p.billingMethod === "hourly") return p.hourlyRateCents ? `${formatCents(p.hourlyRateCents)}/h` : "No hourly rate";
  const n = Object.keys(p.taskRates).length;
  return `Rates by task (${n})`;
}

export function ProjectRows({ data, projects }: { data: BackofficeData; projects: Project[] }) {
  return (
    <Card>
      <ul className="divide-y divide-slate-200">
        {projects.map((p) => {
          const s = projectSummary(data, p.id);
          const customer = data.customers.find((c) => c.id === p.customerId);
          return (
            <li key={p.id}>
              <Link href={routes.project(p.id)} className="flex items-center gap-3 p-4 hover:bg-slate-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue-600">
                <div className="flex min-w-0 flex-1 flex-col gap-2 lg:flex-row lg:items-center">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-slate-900">{p.name}</p>
                    <p className="text-sm text-slate-600">{customer?.name ?? "WEPM Labs (internal)"}</p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      <Badge tone={p.billable && p.customerId ? "info" : "neutral"}>{billingLabel(p)}</Badge>
                      {p.active ? null : <Badge>Inactive</Badge>}
                      {p.wepmProjectId ? null : <Badge tone="warning">No wepm.app ID</Badge>}
                    </div>
                  </div>
                  <dl className="grid grid-cols-2 gap-x-4 text-sm lg:w-80 lg:shrink-0">
                    <div>
                      <dt className="text-xs text-slate-500">Approved hours</dt>
                      <dd className="tabular font-medium">{formatHours(s.approvedMinutes)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-500">Uninvoiced</dt>
                      <dd className="tabular font-medium">
                        {p.billable && p.customerId ? formatCents(s.uninvoicedAmountCents) : "—"}
                        {!s.uninvoicedComplete ? <span className="text-red-700"> + unpriced</span> : null}
                      </dd>
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
  );
}

export function AddProjectDialog({ data, customerId, label = "Add project" }: { data: BackofficeData; customerId?: string; label?: string }) {
  const [open, setOpen] = useState(false);
  const { today, mutate } = useBackoffice();
  const notify = useNotice();
  const router = useRouter();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={customerId ? "secondary" : "primary"}>
          <Plus className="size-4" aria-hidden />
          {label}
        </Button>
      </DialogTrigger>
      {open ? (
        <DialogContent title="Add a project">
          <ProjectForm
            data={data}
            defaultCustomerId={customerId}
            submitLabel="Add project"
            onSubmit={async (input) => {
              const before = data.timeExceptions.length;
              const p = await mutate((r) => r.addProject(input, today));
              notify(`${p.name} added.${before ? " Held-back time entries were re-checked." : ""}`);
              setOpen(false);
              router.push(routes.project(p.id));
            }}
          />
        </DialogContent>
      ) : null}
    </Dialog>
  );
}

export function ProjectListPage() {
  const { state } = useBackoffice();
  const [showInactive, setShowInactive] = useState(false);
  return (
    <>
      <PageHeader title="Projects & billing" description="Customer and internal projects, billability, and billing rates." actions={state.status === "ready" ? <AddProjectDialog data={state.data} /> : null} />
      <ProjectsTabs />
      {state.status === "loading" ? <LoadingState /> : null}
      {state.status === "error" ? <ErrorState message={state.message} /> : null}
      {state.status === "ready" ? (
        state.data.projects.length === 0 ? (
          <EmptyState title="No projects yet" />
        ) : (
          <div className="space-y-4">
            {state.data.projects.some((p) => !p.active) ? (
              <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" className="size-5 accent-slate-900" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
                Show inactive
              </label>
            ) : null}
            <ProjectRows
              data={state.data}
              projects={state.data.projects
                .filter((p) => p.active || showInactive)
                .sort((a, b) => Number(!a.customerId) - Number(!b.customerId) || a.name.localeCompare(b.name))}
            />
          </div>
        )
      ) : null}
    </>
  );
}
