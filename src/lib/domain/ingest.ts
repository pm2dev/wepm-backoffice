import type { ISODate } from "./dates";
import { isISODate } from "./dates";
import { randomId, type IdFactory } from "./payroll";
import type { BackofficeData, IncomingTimeRecord, TimeEntry, TimeException } from "./types";

export type IngestResult = {
  data: BackofficeData;
  added: number;
  duplicates: number;
  /** Same source ID re-delivered with different content — not applied (PRD §19.2). */
  conflicts: number;
  exceptions: number;
};

function sameContent(e: TimeEntry, r: IncomingTimeRecord): boolean {
  return e.workDate === r.workDate && e.minutes === r.minutes && e.task === r.task;
}

/**
 * Accept approved time records from wepm.app (via Slashbin). Re-delivery of the
 * same source entry never duplicates hours. Contractors and projects are matched
 * by explicit source IDs only; anything unmapped or incomplete becomes a visible
 * exception and does not enter payroll or billing.
 */
export function ingestApprovedTime(
  data: BackofficeData,
  records: IncomingTimeRecord[],
  today: ISODate,
  newId: IdFactory = randomId,
): IngestResult {
  const existing = new Map(data.timeEntries.filter((e) => e.source === "wepm").map((e) => [e.sourceEntryId, e]));
  const excepted = new Set(data.timeExceptions.map((x) => x.record.sourceEntryId));
  const contractorBySource = new Map(data.contractors.filter((c) => c.wepmUserId).map((c) => [c.wepmUserId!, c]));
  const projectBySource = new Map(data.projects.filter((p) => p.wepmProjectId).map((p) => [p.wepmProjectId!, p]));

  const entries: TimeEntry[] = [];
  const exceptions: TimeException[] = [];
  let duplicates = 0;
  let conflicts = 0;

  for (const r of records) {
    const prior = existing.get(r.sourceEntryId);
    if (prior) {
      if (sameContent(prior, r)) duplicates++;
      else conflicts++;
      continue;
    }
    if (excepted.has(r.sourceEntryId)) {
      duplicates++;
      continue;
    }
    const reasons: string[] = [];
    const contractor = contractorBySource.get(r.wepmUserId);
    const project = projectBySource.get(r.wepmProjectId);
    if (!contractor) reasons.push(`Unknown wepm.app person “${r.wepmUserId}”`);
    if (!project) reasons.push(`Unknown wepm.app project “${r.wepmProjectId}”`);
    if (!r.approvedAt) reasons.push("Missing approval");
    if (!isISODate(r.workDate)) reasons.push("Invalid work date");
    if (!Number.isInteger(r.minutes) || r.minutes <= 0) reasons.push("Invalid duration");
    if (reasons.length || !contractor || !project) {
      exceptions.push({ id: newId("exc"), record: r, reason: reasons.join(" · "), receivedOn: today });
      excepted.add(r.sourceEntryId);
      continue;
    }
    const entry: TimeEntry = {
      id: newId("te"),
      contractorId: contractor.id,
      projectId: project.id,
      task: r.task,
      workDate: r.workDate,
      minutes: r.minutes,
      source: "wepm",
      sourceEntryId: r.sourceEntryId,
      sourceTimesheetId: r.sourceTimesheetId,
      approvedAt: r.approvedAt,
      approvedBy: r.approvedBy,
    };
    entries.push(entry);
    existing.set(r.sourceEntryId, entry);
  }

  return {
    data: {
      ...data,
      timeEntries: [...data.timeEntries, ...entries],
      timeExceptions: [...data.timeExceptions, ...exceptions],
    },
    added: entries.length,
    duplicates,
    conflicts,
    exceptions: exceptions.length,
  };
}
