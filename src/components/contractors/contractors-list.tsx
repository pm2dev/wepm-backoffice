"use client";

import { routes } from "@/lib/routes";
import { ChevronRight, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { EmptyState, ErrorState, LoadingState, PageHeader } from "@/components/ui/states";
import { useNotice } from "@/components/layout/notice";
import { useBackoffice } from "@/lib/data/backoffice-provider";
import { contractorStats, isActive, tenure } from "@/lib/domain/contractors";
import { formatDate } from "@/lib/domain/dates";
import { formatCents, formatHours } from "@/lib/domain/money";
import { describeSchedule } from "@/lib/domain/schedule";
import { ContractorForm } from "./contractor-form";

export function ContractorsListPage() {
  const { state, today, reload } = useBackoffice();
  const [showInactive, setShowInactive] = useState(false);

  const rows = useMemo(() => {
    if (state.status !== "ready") return [];
    return state.data.contractors
      .map((c) => ({ c, active: isActive(c, today), stats: contractorStats(state.data, c.id, today) }))
      .sort((a, b) => Number(b.active) - Number(a.active) || a.c.name.localeCompare(b.c.name));
  }, [state, today]);
  const inactiveCount = rows.filter((r) => !r.active).length;
  const visible = rows.filter((r) => r.active || showInactive);

  return (
    <>
      <PageHeader title="Contractors" description="Profiles, rates, schedules, hours and earnings." actions={state.status === "ready" ? <AddContractorDialog /> : null} />
      {state.status === "loading" ? <LoadingState /> : null}
      {state.status === "error" ? <ErrorState message={state.message} action={<Button variant="secondary" onClick={() => void reload()}>Try again</Button>} /> : null}
      {state.status === "ready" ? (
        <div className="space-y-4">
          {inactiveCount > 0 ? (
            <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" className="size-5 accent-slate-900" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
              Show inactive ({inactiveCount})
            </label>
          ) : null}
          {visible.length === 0 ? (
            <EmptyState title="No contractors yet">Add a contractor to start tracking rates and pay.</EmptyState>
          ) : (
            <Card>
              <ul className="divide-y divide-slate-200">
                {visible.map(({ c, active, stats }) => (
                  <li key={c.id}>
                    <Link
                      href={routes.contractor(c.id)}
                      className="flex items-center gap-3 p-4 hover:bg-slate-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue-600"
                    >
                      <div className="flex min-w-0 flex-1 flex-col gap-3 lg:flex-row lg:items-center">
                        <div className="min-w-0 flex-1">
                          <p className="flex flex-wrap items-center gap-2 font-medium text-slate-900">
                            {c.name}
                            {active ? null : <Badge>Inactive</Badge>}
                            {stats.currentRateCents === null && active && c.startDate <= today ? <Badge tone="danger">No current rate</Badge> : null}
                          </p>
                          <p className="text-sm text-slate-600">
                            {[c.role, `Since ${formatDate(c.startDate)} · ${tenure(c, today)}`].filter(Boolean).join(" · ")}
                          </p>
                          <p className="text-sm text-slate-600">{describeSchedule(c)}</p>
                        </div>
                        <dl className="grid grid-cols-3 gap-x-4 gap-y-1 text-sm lg:w-[26rem] lg:shrink-0">
                          <div>
                            <dt className="text-xs text-slate-500">Rate</dt>
                            <dd className="tabular font-medium text-slate-900">{stats.currentRateCents === null ? "—" : `${formatCents(stats.currentRateCents)}/h`}</dd>
                          </div>
                          <div>
                            <dt className="text-xs text-slate-500">Lifetime hours</dt>
                            <dd className="tabular font-medium text-slate-900">{formatHours(stats.operationalMinutes + stats.historicalMinutes)}</dd>
                          </div>
                          <div>
                            <dt className="text-xs text-slate-500">Outstanding</dt>
                            <dd className={`tabular font-medium ${stats.outstandingCents > 0 ? "text-slate-900" : "text-slate-500"}`}>{formatCents(stats.outstandingCents)}</dd>
                          </div>
                        </dl>
                      </div>
                      <ChevronRight className="size-5 shrink-0 text-slate-400" aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      ) : null}
    </>
  );
}

function AddContractorDialog() {
  const [open, setOpen] = useState(false);
  const { mutate, today } = useBackoffice();
  const notify = useNotice();
  const router = useRouter();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="size-4" aria-hidden />
          Add contractor
        </Button>
      </DialogTrigger>
      {open ? (
        <DialogContent title="Add a contractor">
          <ContractorForm
            submitLabel="Add contractor"
            onSubmit={async (input) => {
              const c = await mutate((r) => r.addContractor(input, today));
              notify(`${c.name} added.`);
              setOpen(false);
              router.push(routes.contractor(c.id));
            }}
          />
        </DialogContent>
      ) : null}
    </Dialog>
  );
}
