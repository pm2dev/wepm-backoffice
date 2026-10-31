"use client";

import { AlertTriangle, Download, FileUp } from "lucide-react";
import { useRouter } from "next/navigation";
import { use, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, ErrorState, LoadingState, PageHeader } from "@/components/ui/states";
import { useNotice } from "@/components/layout/notice";
import { BackLink } from "@/components/payroll/back-link";
import { useBackoffice } from "@/lib/data/backoffice-provider";
import { formatDate } from "@/lib/domain/dates";
import { previewImport, TEMPLATE_CSV, TEMPLATE_HEADERS, type ImportRow } from "@/lib/domain/history-import";
import { formatCents, formatHours } from "@/lib/domain/money";
import { DomainError } from "@/lib/domain/payroll";
import type { Contractor } from "@/lib/domain/types";

const MAX_BYTES = 5 * 1024 * 1024;

export function ImportHoursRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <ImportHoursPage contractorId={id} />;
}

function ImportHoursPage({ contractorId }: { contractorId: string }) {
  const { state } = useBackoffice();
  if (state.status === "loading") return <LoadingState />;
  if (state.status === "error") return <ErrorState message={state.message} />;
  const c = state.data.contractors.find((x) => x.id === contractorId);
  if (!c) {
    return (
      <>
        <BackLink href="/contractors" label="Contractors" />
        <EmptyState title="Contractor not found" />
      </>
    );
  }
  return <ImportFlow contractor={c} />;
}

function downloadTemplate() {
  const url = URL.createObjectURL(new Blob([TEMPLATE_CSV], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = "backoffice-hours-template.csv";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function ImportFlow({ contractor }: { contractor: Contractor }) {
  const { state, today, mutate } = useBackoffice();
  const notify = useNotice();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<{ name: string; text: string } | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [keepDuplicates, setKeepDuplicates] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const preview = useMemo(
    () => (file && state.status === "ready" ? previewImport(state.data, contractor.id, file.text) : null),
    [file, state, contractor.id],
  );

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    setFileError(null);
    setKeepDuplicates([]);
    setSaveError(null);
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > MAX_BYTES) {
      setFileError("That file is larger than 5 MB. Split it into smaller files.");
      return;
    }
    if (!/\.csv$/i.test(f.name) && f.type !== "text/csv") {
      setFileError("Choose a .csv file. In Excel or Numbers, export the sheet as CSV first.");
      return;
    }
    setFile({ name: f.name, text: await f.text() });
  }

  async function save() {
    if (!file || !preview) return;
    setSaving(true);
    setSaveError(null);
    try {
      const batch = await mutate((r) =>
        r.importHistoricalHours({ contractorId: contractor.id, fileName: file.name, csvText: file.text, includeDuplicateLines: keepDuplicates }, today),
      );
      notify(`Imported ${batch.importedCount} entries (${formatHours(batch.importedMinutes)}) for ${contractor.name}. Nothing new is owed.`);
      router.push(`/contractors/${contractor.id}`);
    } catch (err) {
      setSaveError(err instanceof DomainError ? err.message : "The import could not be saved. Nothing was changed.");
      setSaving(false);
    }
  }

  const importCount = preview ? preview.counts.ok + keepDuplicates.length : 0;
  const otherPeople = preview?.people.filter((p) => p.toLowerCase() !== contractor.name.toLowerCase()) ?? [];

  return (
    <>
      <BackLink href={`/contractors/${contractor.id}`} label={contractor.name} />
      <PageHeader
        title="Import historical hours"
        description={`Add past hours to ${contractor.name}'s record. Imported hours count toward lifetime hours and earnings but never create amounts owed.`}
      />

      <div className="space-y-6">
        <Card className="space-y-4 p-4 sm:p-5">
          <div>
            <h2 className="font-semibold text-slate-900">1. Choose a CSV file</h2>
            <p className="mt-1 text-sm text-slate-600">
              Use a Harvest <em>detailed time</em> export as-is, or reformat a workbook to the template columns:{" "}
              <code className="text-xs">{TEMPLATE_HEADERS.join(", ")}</code>. Required: date, hours, project, task. Dates as YYYY-MM-DD or M/D/YYYY; hours as decimals (1.5) or h:mm.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <input ref={fileRef} id="import-file" type="file" accept=".csv,text/csv" className="sr-only" onChange={onFile} />
            <Button onClick={() => fileRef.current?.click()}>
              <FileUp className="size-4" aria-hidden />
              {file ? "Choose a different file" : "Choose CSV file"}
            </Button>
            <Button variant="secondary" onClick={downloadTemplate}>
              <Download className="size-4" aria-hidden />
              Download template
            </Button>
          </div>
          {file ? <p className="text-sm text-slate-700">Selected: <strong className="break-all">{file.name}</strong></p> : null}
          {fileError ? <p className="text-sm text-red-700" role="alert">{fileError}</p> : null}
        </Card>

        {preview ? (
          preview.missingColumns.length ? (
            <Card className="border-red-200 bg-red-50 p-4 text-sm text-red-900" role="alert">
              This file is missing required column{preview.missingColumns.length === 1 ? "" : "s"}: <strong>{preview.missingColumns.join(", ")}</strong>. Rename or add the columns and choose the file again.
            </Card>
          ) : (
            <>
              <section aria-labelledby="preview-heading" className="space-y-4">
                <h2 id="preview-heading" className="font-semibold text-slate-900">2. Review before saving</h2>
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  <Mini label="Ready to import" value={String(preview.counts.ok)} sub={formatHours(preview.okMinutes)} />
                  <Mini label="Likely duplicates" value={String(preview.counts.duplicate)} sub="Skipped unless you keep them" />
                  <Mini label="Invalid rows" value={String(preview.counts.invalid)} sub="Will be skipped" tone={preview.counts.invalid ? "danger" : undefined} />
                  <Mini
                    label="Work dates"
                    value={preview.firstWorkDate ? `${formatDate(preview.firstWorkDate, { year: false })} – ${formatDate(preview.lastWorkDate!, { year: false })}` : "—"}
                    sub={
                      preview.firstWorkDate
                        ? preview.firstWorkDate.slice(0, 4) === preview.lastWorkDate!.slice(0, 4)
                          ? preview.firstWorkDate.slice(0, 4)
                          : `${preview.firstWorkDate.slice(0, 4)}–${preview.lastWorkDate!.slice(0, 4)}`
                        : ""
                    }
                  />
                </div>
                {preview.missingRateMinutes > 0 ? (
                  <Card className="flex gap-3 border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
                    <AlertTriangle className="size-5 shrink-0 text-amber-700" aria-hidden />
                    <p>
                      {formatHours(preview.missingRateMinutes)} fall on dates with no hourly rate on file. They&rsquo;ll be imported, and earnings for them will show as missing a rate
                      until you add a rate covering those dates — they are never counted as $0 or at today&rsquo;s rate.
                    </p>
                  </Card>
                ) : null}
                {otherPeople.length ? (
                  <Card className="flex gap-3 border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
                    <AlertTriangle className="size-5 shrink-0 text-amber-700" aria-hidden />
                    <p>
                      This Harvest export includes hours for <strong>{otherPeople.join(", ")}</strong>. Every row will be imported into {contractor.name}&rsquo;s record. Filter the export to one person
                      if that&rsquo;s not intended.
                    </p>
                  </Card>
                ) : null}
                <PreviewTable rows={preview.rows} keep={keepDuplicates} setKeep={setKeepDuplicates} />
              </section>

              <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-slate-700">
                  {importCount > 0 ? (
                    <>
                      Save <strong>{importCount}</strong> entr{importCount === 1 ? "y" : "ies"} to {contractor.name}&rsquo;s history. Outstanding payroll stays the same.
                    </>
                  ) : (
                    "There are no rows to import."
                  )}
                </p>
                <Button onClick={save} disabled={saving || importCount === 0}>
                  {saving ? "Importing…" : "Import hours"}
                </Button>
              </Card>
              {saveError ? <p className="rounded-lg bg-red-50 p-3 text-sm text-red-800" role="alert">{saveError}</p> : null}
            </>
          )
        ) : null}
      </div>
    </>
  );
}

function Mini({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "danger" }) {
  return (
    <Card className="p-4">
      <p className="text-sm text-slate-600">{label}</p>
      <p className={`tabular mt-1 text-xl font-semibold ${tone === "danger" ? "text-red-700" : "text-slate-900"}`}>{value}</p>
      {sub ? <p className="text-xs text-slate-600">{sub}</p> : null}
    </Card>
  );
}

const STATUS_BADGE: Record<ImportRow["status"], { label: string; tone: "success" | "danger" | "warning" }> = {
  ok: { label: "Ready", tone: "success" },
  invalid: { label: "Invalid", tone: "danger" },
  duplicate: { label: "Likely duplicate", tone: "warning" },
};

function PreviewTable({ rows, keep, setKeep }: { rows: ImportRow[]; keep: number[]; setKeep: (f: (k: number[]) => number[]) => void }) {
  const [filter, setFilter] = useState<"all" | "problems">(rows.some((r) => r.status !== "ok") ? "problems" : "all");
  const shown = filter === "all" ? rows : rows.filter((r) => r.status !== "ok");
  return (
    <div className="space-y-2">
      <div role="group" aria-label="Rows to show" className="flex gap-1">
        {(["problems", "all"] as const).map((f) => (
          <Button key={f} size="sm" variant={filter === f ? "primary" : "ghost"} aria-pressed={filter === f} onClick={() => setFilter(f)}>
            {f === "all" ? `All rows (${rows.length})` : `Needs attention (${rows.filter((r) => r.status !== "ok").length})`}
          </Button>
        ))}
      </div>
      {shown.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-600">Every row is ready to import.</p>
      ) : (
        <div role="region" aria-label="Import preview" tabIndex={0} className="max-h-[32rem] overflow-auto rounded-xl border border-slate-200 bg-white focus-visible:outline-2 focus-visible:outline-blue-600">
          <table className="w-full min-w-[44rem] text-left text-sm">
            <caption className="sr-only">Import preview</caption>
            <thead className="sticky top-0 bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">Line</th>
                <th scope="col" className="px-3 py-2 font-medium">Status</th>
                <th scope="col" className="px-3 py-2 font-medium">Date</th>
                <th scope="col" className="px-3 py-2 font-medium">Project · task</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Hours</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Rate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {shown.map((r) => (
                <tr key={r.line} className={r.status === "invalid" ? "bg-red-50/50" : undefined}>
                  <td className="tabular px-3 py-2 text-slate-500">{r.line}</td>
                  <td className="px-3 py-2">
                    <Badge tone={STATUS_BADGE[r.status].tone}>{STATUS_BADGE[r.status].label}</Badge>
                    {r.problems.length ? <span className="mt-1 block text-xs text-red-800">{r.problems.join(" · ")}</span> : null}
                    {r.status === "duplicate" ? (
                      <label className="mt-1 flex min-h-11 items-center gap-2 text-xs text-slate-700 pointer-fine:min-h-0">
                        <input
                          type="checkbox"
                          className="size-4 accent-slate-900"
                          checked={keep.includes(r.line)}
                          onChange={(e) => setKeep((k) => (e.target.checked ? [...k, r.line] : k.filter((x) => x !== r.line)))}
                        />
                        Import anyway ({r.duplicateOf === "existing" ? "matches recorded hours" : `same as line ${r.duplicateOf}`})
                      </label>
                    ) : null}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">{r.workDate ? formatDate(r.workDate) : "—"}</td>
                  <td className="px-3 py-2">
                    {r.project ?? "—"}
                    {r.client ? <span className="text-slate-500"> ({r.client})</span> : null}
                    {r.task ? <span className="text-slate-600"> · {r.task}</span> : null}
                    {r.notes ? <span className="block text-xs text-slate-500">{r.notes}</span> : null}
                  </td>
                  <td className="tabular px-3 py-2 text-right">{r.minutes !== undefined && r.minutes > 0 ? formatHours(r.minutes) : r.hoursText || "—"}</td>
                  <td className="tabular whitespace-nowrap px-3 py-2 text-right">
                    {r.rateCents === undefined ? "—" : r.rateCents === null ? <span className="text-amber-800">No rate</span> : `${formatCents(r.rateCents)}/h`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
