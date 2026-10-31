import { isISODate, type ISODate } from "./dates";
import { DomainError, randomId, type IdFactory } from "./payroll";
import { rateOn } from "./rates";
import type { BackofficeData, ImportBatch, TimeEntry } from "./types";

/**
 * Historical hours import (PRD §6). Accepts a Harvest "detailed time" CSV
 * export or the Backoffice template. Imported hours are recorded history:
 * they never create amounts owed.
 */

export const TEMPLATE_HEADERS = ["date", "hours", "project", "task", "client", "notes", "source_id"] as const;
export const TEMPLATE_CSV = `${TEMPLATE_HEADERS.join(",")}\n2025-03-04,6.5,Member portal,Development,Acme Corp,,\n2025-03-05,1.25,Member portal,Meetings,Acme Corp,Weekly sync,\n`;

/** RFC 4180-style CSV parsing (quoted fields, escaped quotes, CRLF). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

type ColumnKey = "date" | "hours" | "project" | "task" | "client" | "notes" | "sourceId";

const ALIASES: Record<ColumnKey, string[]> = {
  date: ["date", "spent date", "work date"],
  hours: ["hours"],
  project: ["project"],
  task: ["task"],
  client: ["client", "customer"],
  notes: ["notes", "note", "description"],
  sourceId: ["source_id", "source id", "id", "time entry id", "entry id"],
};

const REQUIRED: ColumnKey[] = ["date", "hours", "project", "task"];

export type ImportRowStatus = "ok" | "invalid" | "duplicate";

export type ImportRow = {
  line: number;
  status: ImportRowStatus;
  problems: string[];
  workDate?: ISODate;
  hoursText?: string;
  minutes?: number;
  project?: string;
  task?: string;
  client?: string;
  notes?: string;
  sourceId?: string;
  duplicateOf?: "existing" | number;
  rateCents?: number | null;
};

export type ImportPreview = {
  format: "harvest" | "template";
  rows: ImportRow[];
  missingColumns: string[];
  counts: { total: number; ok: number; invalid: number; duplicate: number };
  okMinutes: number;
  missingRateMinutes: number;
  firstWorkDate?: ISODate;
  lastWorkDate?: ISODate;
  /** Harvest exports with more than one person in them (First/Last name columns). */
  people: string[];
};

/** Accepts YYYY-MM-DD and M/D/YYYY (Excel-style US dates). */
export function parseImportDate(raw: string): ISODate | null {
  const v = raw.trim();
  if (isISODate(v)) return v;
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(v);
  if (m) {
    const iso = `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
    return isISODate(iso) ? iso : null;
  }
  return null;
}

/**
 * Decimal hours → minutes, exactly (up to 4 decimal places; no float drift
 * beyond what minutes themselves require). Also accepts "h:mm".
 */
export function parseHours(raw: string): number | null {
  const v = raw.trim();
  const hm = /^(\d+):([0-5]\d)$/.exec(v);
  if (hm) return parseInt(hm[1], 10) * 60 + parseInt(hm[2], 10);
  const m = /^(\d+)(?:\.(\d{1,4}))?$/.exec(v);
  if (!m) return null;
  const frac = (m[2] ?? "").padEnd(4, "0");
  const tenThousandths = parseInt(m[1], 10) * 10000 + parseInt(frac, 10);
  return (tenThousandths * 60) / 10000;
}

function fingerprint(p: { workDate?: string; minutes?: number; project?: string; task?: string; notes?: string }) {
  return [p.workDate, p.minutes, (p.project ?? "").toLowerCase(), (p.task ?? "").toLowerCase(), (p.notes ?? "").trim().toLowerCase()].join("|");
}

export function previewImport(data: BackofficeData, contractorId: string, csvText: string): ImportPreview {
  const table = parseCsv(csvText);
  const header = (table[0] ?? []).map((h) => h.trim().toLowerCase());
  const index = {} as Record<ColumnKey, number>;
  for (const key of Object.keys(ALIASES) as ColumnKey[]) {
    index[key] = header.findIndex((h) => ALIASES[key].includes(h));
  }
  const format: ImportPreview["format"] = header.includes("first name") || header.includes("hours rounded") ? "harvest" : "template";
  const missingColumns = REQUIRED.filter((k) => index[k] < 0);
  const firstName = header.indexOf("first name");
  const lastName = header.indexOf("last name");

  const empty: ImportPreview = { format, rows: [], missingColumns, counts: { total: 0, ok: 0, invalid: 0, duplicate: 0 }, okMinutes: 0, missingRateMinutes: 0, people: [] };
  if (table.length === 0 || missingColumns.length) return empty;

  const existingSourceIds = new Set(
    data.timeEntries.filter((e) => e.contractorId === contractorId && e.source !== "wepm").map((e) => e.sourceEntryId),
  );
  const existingPrints = new Set(
    data.timeEntries.filter((e) => e.contractorId === contractorId).map((e) => fingerprint({ ...e, project: e.sourceProject ?? projectName(data, e.projectId) })),
  );
  const seenPrints = new Map<string, number>();
  const seenIds = new Map<string, number>();
  const people = new Set<string>();

  const cell = (r: string[], k: ColumnKey) => (index[k] >= 0 ? (r[index[k]] ?? "").trim() : "");
  const rows: ImportRow[] = table.slice(1).map((r, i) => {
    const line = i + 2;
    const problems: string[] = [];
    const workDate = parseImportDate(cell(r, "date")) ?? undefined;
    if (!workDate) problems.push(cell(r, "date") ? `Unrecognized date “${cell(r, "date")}”` : "Missing date");
    const hoursText = cell(r, "hours");
    const minutes = parseHours(hoursText) ?? undefined;
    if (minutes === undefined) problems.push(hoursText ? `Unrecognized hours “${hoursText}”` : "Missing hours");
    else if (minutes <= 0) problems.push("Hours must be more than 0");
    else if (minutes > 24 * 60) problems.push("More than 24 hours in one entry");
    const project = cell(r, "project");
    const task = cell(r, "task");
    if (!project) problems.push("Missing project");
    if (!task) problems.push("Missing task");
    if (firstName >= 0) people.add(`${(r[firstName] ?? "").trim()} ${lastName >= 0 ? (r[lastName] ?? "").trim() : ""}`.trim());

    const row: ImportRow = {
      line,
      status: problems.length ? "invalid" : "ok",
      problems,
      workDate,
      hoursText,
      minutes,
      project: project || undefined,
      task: task || undefined,
      client: cell(r, "client") || undefined,
      notes: cell(r, "notes") || undefined,
      sourceId: cell(r, "sourceId") || undefined,
    };
    if (row.status === "ok") {
      const fp = fingerprint(row);
      if (row.sourceId && existingSourceIds.has(sourceKey(format, row.sourceId))) row.duplicateOf = "existing";
      else if (row.sourceId && seenIds.has(row.sourceId)) row.duplicateOf = seenIds.get(row.sourceId);
      else if (existingPrints.has(fp)) row.duplicateOf = "existing";
      else if (seenPrints.has(fp)) row.duplicateOf = seenPrints.get(fp);
      if (row.duplicateOf !== undefined) row.status = "duplicate";
      if (!seenPrints.has(fp)) seenPrints.set(fp, line);
      if (row.sourceId && !seenIds.has(row.sourceId)) seenIds.set(row.sourceId, line);
      row.rateCents = rateOn(data.rates, contractorId, row.workDate!);
    }
    return row;
  });

  const ok = rows.filter((r) => r.status === "ok");
  const dates = ok.map((r) => r.workDate!).sort();
  return {
    format,
    rows,
    missingColumns,
    counts: {
      total: rows.length,
      ok: ok.length,
      invalid: rows.filter((r) => r.status === "invalid").length,
      duplicate: rows.filter((r) => r.status === "duplicate").length,
    },
    okMinutes: ok.reduce((s, r) => s + r.minutes!, 0),
    missingRateMinutes: ok.filter((r) => r.rateCents === null).reduce((s, r) => s + r.minutes!, 0),
    firstWorkDate: dates[0],
    lastWorkDate: dates[dates.length - 1],
    people: [...people].filter(Boolean),
  };
}

function projectName(data: BackofficeData, id: string | null) {
  return id ? data.projects.find((p) => p.id === id)?.name : undefined;
}

function sourceKey(format: ImportPreview["format"], id: string) {
  return `${format}:${id}`;
}

/**
 * Save the valid rows of a preview (plus any likely duplicates the owner
 * explicitly chose to keep). Creates recorded hours only — no obligations.
 */
export function commitImport(
  data: BackofficeData,
  input: { contractorId: string; fileName: string; csvText: string; includeDuplicateLines?: number[] },
  today: ISODate,
  newId: IdFactory = randomId,
): { data: BackofficeData; batch: ImportBatch } {
  if (!data.contractors.some((c) => c.id === input.contractorId)) throw new DomainError("Contractor not found.");
  const preview = previewImport(data, input.contractorId, input.csvText);
  if (preview.missingColumns.length) throw new DomainError(`Missing columns: ${preview.missingColumns.join(", ")}`);
  const include = new Set(input.includeDuplicateLines ?? []);
  const rows = preview.rows.filter((r) => r.status === "ok" || (r.status === "duplicate" && include.has(r.line)));
  if (rows.length === 0) throw new DomainError("There are no valid rows to import.");

  const batchId = newId("imp");
  const source: TimeEntry["source"] = preview.format === "harvest" ? "harvest_import" : "workbook_import";
  const entries: TimeEntry[] = rows.map((r) => ({
    id: newId("te"),
    contractorId: input.contractorId,
    projectId: null,
    task: r.task!,
    workDate: r.workDate!,
    minutes: r.minutes!,
    source,
    sourceEntryId: r.sourceId ? sourceKey(preview.format, r.sourceId) : `${batchId}:line${r.line}`,
    importBatchId: batchId,
    sourceProject: r.project,
    sourceClient: r.client,
    sourceHours: r.hoursText,
    notes: r.notes,
  }));
  const dates = entries.map((e) => e.workDate).sort();
  const batch: ImportBatch = {
    id: batchId,
    contractorId: input.contractorId,
    fileName: input.fileName,
    format: preview.format,
    importedOn: today,
    rowCount: preview.counts.total,
    importedCount: entries.length,
    skippedInvalid: preview.counts.invalid,
    skippedDuplicates: preview.counts.duplicate - rows.filter((r) => r.status === "duplicate").length,
    importedMinutes: entries.reduce((s, e) => s + e.minutes, 0),
    firstWorkDate: dates[0],
    lastWorkDate: dates[dates.length - 1],
  };
  return {
    data: { ...data, timeEntries: [...data.timeEntries, ...entries], importBatches: [...data.importBatches, batch] },
    batch,
  };
}
