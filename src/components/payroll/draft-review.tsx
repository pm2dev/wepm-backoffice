"use client";

import { AlertTriangle, Info } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { EmptyState, ErrorState, LoadingState, PageHeader } from "@/components/ui/states";
import { useNotice } from "@/components/layout/notice";
import { useBackoffice } from "@/lib/data/backoffice-provider";
import { formatDate, formatRange } from "@/lib/domain/dates";
import { formatCents, formatHours } from "@/lib/domain/money";
import { computeDraftPayrolls, DomainError } from "@/lib/domain/payroll";
import { BackLink } from "./back-link";
import { EntriesTable } from "./entries-table";
import { dueText } from "./labels";
import { RateLines } from "./rate-lines";

export function DraftReviewPage({ draftKey }: { draftKey: string }) {
  const { state, today, mutate } = useBackoffice();
  const router = useRouter();
  const notify = useNotice();
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const draft = useMemo(
    () => (state.status === "ready" ? computeDraftPayrolls(state.data, today).find((d) => d.key === draftKey) : undefined),
    [state, today, draftKey],
  );

  if (state.status === "loading") return <LoadingState />;
  if (state.status === "error") return <ErrorState message={state.message} />;
  const contractor = draft && state.data.contractors.find((c) => c.id === draft.contractorId);
  if (!draft || !contractor) {
    return (
      <>
        <BackLink />
        <EmptyState title="No unfinalized hours here">
          This payroll record may already be finalized. Check{" "}
          <Link className="text-blue-700 underline" href="/payroll">
            What’s due
          </Link>
          .
        </EmptyState>
      </>
    );
  }

  const blocked = draft.missingRateMinutes > 0;

  async function finalize() {
    setSaving(true);
    setError(null);
    try {
      const payroll = await mutate((r) => r.finalizePayroll(draftKey, today));
      notify(`Finalized ${formatCents(payroll.amountCents)} for ${contractor!.name}. It is ready to pay.`);
      router.replace(`/payroll/records/${payroll.id}`);
    } catch (e) {
      setError(e instanceof DomainError ? e.message : "Could not finalize. Nothing was changed.");
      setSaving(false);
    }
  }

  return (
    <>
      <BackLink />
      <PageHeader
        title={`${contractor.name} · ${formatRange(draft.periodStart, draft.periodEnd)}`}
        description={`${draft.lateApproved ? "Late-approved hours" : "Weekly hours"} · ${dueText(draft.dueDate, today)}`}
      />
      <div className="mb-6 flex flex-wrap gap-1.5">
        <Badge tone="neutral">Payroll</Badge>
        {blocked ? <Badge tone="danger">Missing rate</Badge> : <Badge tone="warning">Needs finalization</Badge>}
        {draft.dueDate < today ? <Badge tone="danger">Overdue</Badge> : null}
      </div>

      {draft.lateApproved ? (
        <Card className="mb-6 flex gap-3 border-blue-200 bg-blue-50 p-4 text-sm text-blue-950">
          <Info className="size-5 shrink-0 text-blue-700" aria-hidden />
          <p>
            These hours were approved after this week was already finalized. The earlier payroll record is unchanged; these hours are paid as a separate record on the next payday, at the rates in effect on the dates worked.
            <span className="mt-1 block text-xs text-blue-800">Assumption pending confirmation (PRD §8, late-approved hours).</span>
          </p>
        </Card>
      ) : null}

      {blocked ? (
        <Card className="mb-6 flex gap-3 border-red-200 bg-red-50 p-4 text-sm text-red-950" role="alert">
          <AlertTriangle className="size-5 shrink-0 text-red-700" aria-hidden />
          <p>
            {formatHours(draft.missingRateMinutes)} worked on {draft.missingRateDates.map((d) => formatDate(d, { year: false })).join(", ")} have no hourly rate on file for {contractor.name}. Add a rate effective on or before those dates before finalizing. Missing rates are never treated as $0.
            <Link href={`/contractors/${contractor.id}#rates`} className="mt-2 inline-flex min-h-11 items-center font-medium text-red-900 underline underline-offset-2 pointer-fine:min-h-0">
              Add a rate for {contractor.name}
            </Link>
          </p>
        </Card>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="min-w-0 space-y-3 lg:order-1">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">Approved hours ({formatHours(draft.totalMinutes)})</h2>
          <EntriesTable data={state.data} entries={draft.entries} contractorId={contractor.id} caption={`Approved hours for ${contractor.name}`} />
        </div>
        <div className="space-y-4 lg:order-2">
          <RateLines lines={draft.lines} total={draft.knownAmountCents} missingRateMinutes={draft.missingRateMinutes} />
          <Dialog>
            <DialogTrigger asChild>
              <Button className="w-full" disabled={blocked}>
                Finalize payroll
              </Button>
            </DialogTrigger>
            <DialogContent title="Finalize this payroll?" description={`${contractor.name} · ${formatRange(draft.periodStart, draft.periodEnd)}`}>
              <div className="space-y-4 text-sm text-slate-700">
                <p>
                  This locks in <strong className="text-slate-900">{formatCents(draft.knownAmountCents)}</strong> for {formatHours(draft.totalMinutes)}. Later rate changes or newly approved hours won&rsquo;t change it.
                </p>
                <p>Finalizing does not send money and does not mark anything paid. Record the payment after you pay {contractor.name}.</p>
                {error ? <p className="rounded-lg bg-red-50 p-3 text-red-800" role="alert">{error}</p> : null}
                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <DialogClose asChild>
                    <Button variant="secondary">Cancel</Button>
                  </DialogClose>
                  <Button onClick={finalize} disabled={saving}>
                    {saving ? "Finalizing…" : "Finalize"}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
          {blocked ? <p className="text-xs text-slate-600">Finalizing is unavailable until every hour has a rate.</p> : null}
        </div>
      </div>
    </>
  );
}

export function DraftReviewRoute({ params }: { params: Promise<{ key: string }> }) {
  const { key } = use(params);
  return <DraftReviewPage draftKey={decodeURIComponent(key)} />;
}
