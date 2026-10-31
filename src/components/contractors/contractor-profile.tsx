"use client";

import { Info, Pencil, Upload } from "lucide-react";
import Link from "next/link";
import { use, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { EmptyState, ErrorState, LoadingState, PageHeader } from "@/components/ui/states";
import { useNotice } from "@/components/layout/notice";
import { BackLink } from "@/components/payroll/back-link";
import { useBackoffice } from "@/lib/data/backoffice-provider";
import { contractorStats, isActive, tenure } from "@/lib/domain/contractors";
import { addDays, formatDate } from "@/lib/domain/dates";
import { formatCents, formatHours } from "@/lib/domain/money";
import { rateHistory } from "@/lib/domain/rates";
import { describeSchedule } from "@/lib/domain/schedule";
import { PAYMENT_METHOD_LABELS, type BackofficeData, type Contractor, type TimeEntry } from "@/lib/domain/types";
import { cn } from "@/lib/utils";
import { AddRateDialog } from "./add-rate-dialog";
import { ContractorForm } from "./contractor-form";

export function ContractorProfileRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <ContractorProfilePage contractorId={id} />;
}

const SOURCE_LABEL: Record<TimeEntry["source"], string> = { wepm: "wepm.app", harvest_import: "Harvest import", workbook_import: "Workbook import" };

function ContractorProfilePage({ contractorId }: { contractorId: string }) {
  const { state, today } = useBackoffice();
  const stats = useMemo(() => (state.status === "ready" ? contractorStats(state.data, contractorId, today) : null), [state, contractorId, today]);

  if (state.status === "loading") return <LoadingState />;
  if (state.status === "error") return <ErrorState message={state.message} />;
  const c = state.data.contractors.find((x) => x.id === contractorId);
  if (!c || !stats) {
    return (
      <>
        <BackLink href="/contractors" label="Contractors" />
        <EmptyState title="Contractor not found" />
      </>
    );
  }
  const active = isActive(c, today);
  const totalMinutes = stats.operationalMinutes + stats.historicalMinutes;
  const paymentGap = stats.totalEarningsCents + stats.reimbursementCents - stats.totalPaidCents - stats.outstandingCents;

  return (
    <>
      <BackLink href="/contractors" label="Contractors" />
      <PageHeader
        title={c.name}
        description={
          <>
            {c.role ? `${c.role} · ` : ""}Started {formatDate(c.startDate)} · {tenure(c, today)}
            {c.endDate ? ` · ${active ? "ends" : "ended"} ${formatDate(c.endDate)}` : ""}
          </>
        }
        actions={<EditContractorDialog contractor={c} />}
      />
      <div className="mb-6 flex flex-wrap gap-1.5">
        {active ? <Badge tone="success">Active</Badge> : <Badge>Inactive</Badge>}
        {stats.currentRateCents === null && active && c.startDate <= today ? <Badge tone="danger">No current rate</Badge> : null}
      </div>

      <section aria-label="Summary" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Stat label="Current rate" value={stats.currentRateCents === null ? "None" : `${formatCents(stats.currentRateCents)}/h`} danger={stats.currentRateCents === null && c.startDate <= today}>
          {stats.upcomingRate ? `${formatCents(stats.upcomingRate.hourlyRateCents)}/h from ${formatDate(stats.upcomingRate.effectiveDate)}` : "Same for every project and task"}
        </Stat>
        <Stat label="Lifetime hours" value={formatHours(totalMinutes)}>
          {formatHours(stats.operationalMinutes)} from wepm.app · {formatHours(stats.historicalMinutes)} imported
        </Stat>
        <Stat label="Lifetime earnings" value={formatCents(stats.totalEarningsCents)}>
          {formatCents(stats.hourlyEarningsCents)} hourly + {formatCents(stats.bonusCents)} bonuses
          {stats.missingRateMinutes > 0 ? (
            <span className="block text-red-700">
              Excludes {formatHours(stats.missingRateMinutes)} with no rate
              {stats.missingRateRange ? ` (${formatDate(stats.missingRateRange.from, { year: true })} – ${formatDate(stats.missingRateRange.to)})` : ""}
            </span>
          ) : null}
        </Stat>
        <Stat label="Reimbursements" value={formatCents(stats.reimbursementCents)}>Not counted as earnings</Stat>
        <Stat label="Total paid" value={formatCents(stats.totalPaidCents)}>
          {stats.firstPaymentDate ? `Recorded payments since ${formatDate(stats.firstPaymentDate)}` : "No payments recorded"}
        </Stat>
        <Stat label="Outstanding" value={formatCents(stats.outstandingCents)}>
          {stats.outstandingCents > 0 ? (
            <Link href="/payroll" className="text-blue-700 underline underline-offset-2">View in Payroll</Link>
          ) : (
            "Nothing owed"
          )}
        </Stat>
      </section>

      {paymentGap > 0 ? (
        <Card className="mt-4 flex gap-3 border-blue-200 bg-blue-50 p-4 text-sm text-blue-950">
          <Info className="size-5 shrink-0 text-blue-700" aria-hidden />
          <p>
            Earnings exceed recorded payments plus what&rsquo;s outstanding by <strong className="tabular">{formatCents(paymentGap)}</strong>. That&rsquo;s expected
            when historical hours are imported without their payment history — those earlier payments simply aren&rsquo;t recorded here. It is not money owed.
          </p>
        </Card>
      ) : null}

      <div className="mt-8 grid gap-8 xl:grid-cols-[1fr_22rem]">
        <div className="min-w-0 space-y-8">
          <RatesSection data={state.data} contractor={c} today={today} />
          <HoursSection data={state.data} contractor={c} />
        </div>
        <div className="space-y-8">
          <DetailsSection contractor={c} />
          <PaymentsSection data={state.data} contractor={c} />
        </div>
      </div>
    </>
  );
}

function Stat({ label, value, danger, children }: { label: string; value: string; danger?: boolean; children?: React.ReactNode }) {
  return (
    <Card className="p-4">
      <p className="text-sm text-slate-600">{label}</p>
      <p className={cn("tabular mt-1 text-2xl font-semibold", danger ? "text-red-700" : "text-slate-900")}>{value}</p>
      {children ? <p className="mt-1 text-xs text-slate-600">{children}</p> : null}
    </Card>
  );
}

function SectionHeader({ id, title, action }: { id: string; title: string; action?: React.ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <h2 id={id} className="text-sm font-semibold uppercase tracking-wide text-slate-600">{title}</h2>
      {action}
    </div>
  );
}

function RatesSection({ data, contractor, today }: { data: BackofficeData; contractor: Contractor; today: string }) {
  const history = rateHistory(data.rates, contractor.id);
  const currentId = history.find((r) => r.effectiveDate <= today)?.id;
  return (
    <section aria-labelledby="rates-heading" id="rates" className="scroll-mt-20">
      <SectionHeader id="rates-heading" title="Rate history" action={<AddRateDialog contractor={contractor} />} />
      {history.length === 0 ? (
        <p className="rounded-xl border border-dashed border-red-300 bg-red-50 p-4 text-sm text-red-900">
          No hourly rate on file. Hours can&rsquo;t be finalized for payroll until a rate covers the dates worked.
        </p>
      ) : (
        <Card>
          <ul className="divide-y divide-slate-200 text-sm">
            {history.map((r, i) => {
              const next = history[i - 1];
              return (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 p-4">
                  <span>
                    <span className="font-medium text-slate-900">{formatDate(r.effectiveDate)}</span>
                    <span className="text-slate-600">{next ? ` – ${formatDate(addDays(next.effectiveDate, -1))}` : " onward"}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    {r.id === currentId ? <Badge tone="success">Current</Badge> : r.effectiveDate > today ? <Badge tone="info">Upcoming</Badge> : null}
                    <span className="tabular font-semibold">{formatCents(r.hourlyRateCents)}/h</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
      {history.length > 0 && history[history.length - 1].effectiveDate > contractor.startDate ? (
        <p className="mt-2 text-xs text-slate-600">
          No rate covers {formatDate(contractor.startDate)} – {formatDate(history[history.length - 1].effectiveDate)}. Hours in that range are shown as missing a rate.
        </p>
      ) : null}
      <p className="mt-2 text-xs text-slate-500">Rates apply by the date worked. Finalized payroll keeps the rates it was calculated with.</p>
    </section>
  );
}

function HoursSection({ data, contractor }: { data: BackofficeData; contractor: Contractor }) {
  const [limit, setLimit] = useState(15);
  const entries = data.timeEntries
    .filter((e) => e.contractorId === contractor.id && (e.source !== "wepm" || e.approvedAt))
    .sort((a, b) => (a.workDate === b.workDate ? 0 : a.workDate < b.workDate ? 1 : -1));
  const projects = new Map(data.projects.map((p) => [p.id, p]));
  const batches = data.importBatches.filter((b) => b.contractorId === contractor.id).sort((a, b) => (a.importedOn < b.importedOn ? 1 : -1));

  return (
    <section aria-labelledby="hours-heading" className="space-y-6">
      <div>
        <SectionHeader
          id="hours-heading"
          title="Hours"
          action={
            <Link
              href={`/contractors/${contractor.id}/import`}
              className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-900 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-blue-600 pointer-fine:min-h-9"
            >
              <Upload className="size-4" aria-hidden />
              Import historical hours
            </Link>
          }
        />
        {entries.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-600">No hours recorded yet.</p>
        ) : (
          <>
            <div role="region" aria-label={`Hours for ${contractor.name}`} tabIndex={0} className="overflow-x-auto rounded-xl border border-slate-200 bg-white focus-visible:outline-2 focus-visible:outline-blue-600">
              <table className="w-full min-w-[36rem] text-left text-sm">
                <caption className="sr-only">Hours for {contractor.name}, newest first</caption>
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
                  <tr>
                    <th scope="col" className="px-4 py-2 font-medium">Date</th>
                    <th scope="col" className="px-4 py-2 font-medium">Project · task</th>
                    <th scope="col" className="px-4 py-2 text-right font-medium">Hours</th>
                    <th scope="col" className="px-4 py-2 font-medium">Source</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {entries.slice(0, limit).map((e) => {
                    const p = e.projectId ? projects.get(e.projectId) : undefined;
                    return (
                      <tr key={e.id}>
                        <td className="whitespace-nowrap px-4 py-2.5">{formatDate(e.workDate)}</td>
                        <td className="px-4 py-2.5">
                          {p?.name ?? e.sourceProject ?? "Unknown project"}
                          {e.sourceClient && !p ? <span className="text-slate-500"> ({e.sourceClient})</span> : null}
                          <span className="text-slate-600"> · {e.task}</span>
                        </td>
                        <td className="tabular px-4 py-2.5 text-right">{formatHours(e.minutes)}</td>
                        <td className="whitespace-nowrap px-4 py-2.5">
                          <Badge tone={e.source === "wepm" ? "neutral" : "sample"}>{SOURCE_LABEL[e.source]}</Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {entries.length > limit ? (
              <Button variant="ghost" className="mt-2" onClick={() => setLimit((l) => l + 50)}>
                Show more ({entries.length - limit} older)
              </Button>
            ) : null}
          </>
        )}
      </div>

      <div>
        <SectionHeader id="imports-heading" title="Historical imports" />
        {batches.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-600">No historical hours imported.</p>
        ) : (
          <Card>
            <ul className="divide-y divide-slate-200 text-sm">
              {batches.map((b) => (
                <li key={b.id} className="p-4">
                  <p className="font-medium text-slate-900 break-all">{b.fileName}</p>
                  <p className="text-slate-600">
                    {b.format === "harvest" ? "Harvest CSV" : "Template CSV"} · imported {formatDate(b.importedOn)} · {b.importedCount} entr{b.importedCount === 1 ? "y" : "ies"},{" "}
                    {formatHours(b.importedMinutes)}
                    {b.firstWorkDate && b.lastWorkDate ? ` · work dates ${formatDate(b.firstWorkDate)} – ${formatDate(b.lastWorkDate)}` : ""}
                  </p>
                  {b.skippedInvalid || b.skippedDuplicates ? (
                    <p className="text-xs text-slate-500">Skipped {b.skippedInvalid} invalid and {b.skippedDuplicates} duplicate row{b.skippedInvalid + b.skippedDuplicates === 1 ? "" : "s"}.</p>
                  ) : null}
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </section>
  );
}

function DetailsSection({ contractor: c }: { contractor: Contractor }) {
  const rows: [string, React.ReactNode][] = [
    ["Pay schedule", describeSchedule(c)],
    ["Payment method", PAYMENT_METHOD_LABELS[c.preferredMethod]],
    ["Payment reference", c.paymentReference ?? "—"],
    ["Email", c.email ? <a href={`mailto:${c.email}`} className="text-blue-700 underline underline-offset-2 break-all">{c.email}</a> : "—"],
    ["wepm.app person ID", c.wepmUserId ? <code className="text-xs">{c.wepmUserId}</code> : <span className="text-amber-800">Not linked — approved hours can&rsquo;t be matched</span>],
    ["Notes", c.notes ?? "—"],
  ];
  return (
    <section aria-labelledby="details-heading">
      <SectionHeader id="details-heading" title="Payment details" />
      <Card className="p-4">
        <dl className="space-y-3 text-sm">
          {rows.map(([k, v]) => (
            <div key={k}>
              <dt className="text-xs text-slate-500">{k}</dt>
              <dd className="text-slate-900">{v}</dd>
            </div>
          ))}
        </dl>
      </Card>
    </section>
  );
}

function PaymentsSection({ data, contractor }: { data: BackofficeData; contractor: Contractor }) {
  const payments = data.payments.filter((p) => p.contractorId === contractor.id).sort((a, b) => (a.paidOn < b.paidOn ? 1 : -1));
  return (
    <section aria-labelledby="payments-heading">
      <SectionHeader id="payments-heading" title="Payments" action={<Link href="/payroll/history" className="text-sm text-blue-700 underline underline-offset-2">All payments</Link>} />
      {payments.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-600">No payments recorded.</p>
      ) : (
        <Card>
          <ul className="divide-y divide-slate-200 text-sm">
            {payments.slice(0, 8).map((p) => (
              <li key={p.id} className="flex justify-between gap-2 p-3">
                <span>
                  {formatDate(p.paidOn)} · {PAYMENT_METHOD_LABELS[p.method]}
                  {p.note ? <span className="block text-xs text-slate-500">{p.note}</span> : null}
                </span>
                <span className="tabular font-medium">{formatCents(p.allocations.reduce((s, a) => s + a.amountCents, 0))}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </section>
  );
}

function EditContractorDialog({ contractor }: { contractor: Contractor }) {
  const [open, setOpen] = useState(false);
  const { mutate } = useBackoffice();
  const notify = useNotice();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary">
          <Pencil className="size-4" aria-hidden />
          Edit profile
        </Button>
      </DialogTrigger>
      {open ? (
        <DialogContent title={`Edit ${contractor.name}`} description="Rates are managed separately in Rate history.">
          <ContractorForm
            contractor={contractor}
            submitLabel="Save changes"
            onSubmit={async (input) => {
              const c = await mutate((r) => r.updateContractor(contractor.id, input));
              notify(`${c.name}'s profile saved.`);
              setOpen(false);
            }}
          />
        </DialogContent>
      ) : null}
    </Dialog>
  );
}
