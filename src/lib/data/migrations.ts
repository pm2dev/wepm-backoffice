import { SCHEMA_VERSION } from "@/lib/domain/empty";
import type { BackofficeData } from "@/lib/domain/types";

/**
 * Stored business data is one JSON document tagged with `schemaVersion`.
 * When a change alters its shape, bump SCHEMA_VERSION and add a migration
 * that turns the previous version into the new one. Migrations are pure:
 * they get a copy of the stored document and return the upgraded one,
 * without the `schemaVersion` tag (`migrateData` sets it).
 */
export type StoredDocument = Record<string, unknown>;

export type Migration = {
  /** Version this migration upgrades from; it produces `from + 1`. */
  from: number;
  description: string;
  up: (data: StoredDocument) => StoredDocument;
};

/** Oldest stored version that can still be upgraded. Earlier data predates migrations. */
export const OLDEST_MIGRATABLE_VERSION = 7;

/** In order, one per version bump after OLDEST_MIGRATABLE_VERSION. */
export const MIGRATIONS: Migration[] = [
  {
    from: 7,
    description: "Projects: `active` flag becomes a status (active → Active, inactive → Completed).",
    up: (d) => ({
      ...d,
      projects: ((d.projects as StoredDocument[] | undefined) ?? []).map(({ active, ...p }) => ({ ...p, status: active === false ? "completed" : "active" })),
    }),
  },
  {
    from: 8,
    description: "Billing rates become dated rows (`billingRates`), each effective from the project's start or earliest time entry.",
    up: (d) => {
      const entries = ((d.timeEntries as StoredDocument[] | undefined) ?? []) as { projectId?: string | null; workDate?: string }[];
      const earliest = new Map<string, string>();
      for (const e of entries) {
        if (!e.projectId || !e.workDate) continue;
        const cur = earliest.get(e.projectId);
        if (!cur || e.workDate < cur) earliest.set(e.projectId, e.workDate);
      }
      const billingRates: StoredDocument[] = [];
      const projects = ((d.projects as StoredDocument[] | undefined) ?? []).map(({ hourlyRateCents, taskRates, ...p }) => {
        const id = String(p.id);
        const candidates = [earliest.get(id), typeof p.startDate === "string" ? p.startDate : undefined].filter((x): x is string => !!x).sort();
        // No start date and no hours: the rate has always applied, as it did before.
        const effectiveDate = candidates[0] ?? "2000-01-01";
        let n = 0;
        const add = (task: string | null, rateCents: unknown) => {
          if (typeof rateCents === "number" && rateCents > 0) billingRates.push({ id: `brate_${id}_${++n}`, projectId: id, task, effectiveDate, rateCents });
        };
        add(null, hourlyRateCents);
        for (const [task, cents] of Object.entries((taskRates as Record<string, unknown> | undefined) ?? {})) add(task, cents);
        return p;
      });
      return { ...d, projects, billingRates };
    },
  },
  {
    from: 9,
    description: "Adds project expenses (one-off costs on a project or the company).",
    up: (d) => ({ ...d, projectExpenses: [] }),
  },
  {
    from: 10,
    description: "Billing records become invoice drafts marked Invoiced (Linked when their QuickBooks number matches a synced invoice).",
    up: (d) => {
      const entries = new Map(((d.timeEntries as StoredDocument[] | undefined) ?? []).map((e) => [String(e.id), e as { task?: string; workDate?: string }]));
      const qbInvoices = ((d.quickbooksInvoices as StoredDocument[] | undefined) ?? []) as { qbInvoiceId?: string; docNumber?: string; customerId?: string | null }[];
      const used = new Set<string>();
      const invoiceDrafts = ((d.billingRecords as StoredDocument[] | undefined) ?? []).map((r) => {
        const rec = r as { id: string; projectId: string; customerId: string; entryIds: string[]; firstWorkDate: string; lastWorkDate: string; lines: { task: string; minutes: number; rateCents: number; amountCents: number }[]; amountCents: number; invoicedOn: string; quickbooksInvoiceRef?: string };
        const laborLines = rec.lines.map((l, i) => {
          const ids = rec.entryIds.filter((id) => entries.get(id)?.task === l.task);
          const dates = ids.map((id) => entries.get(id)?.workDate).filter((x): x is string => !!x).sort();
          return { id: `${rec.id}_l${i + 1}`, task: l.task, minutes: l.minutes, rateCents: l.rateCents, amountCents: l.amountCents, firstWorkDate: dates[0] ?? rec.firstWorkDate, lastWorkDate: dates[dates.length - 1] ?? rec.lastWorkDate, entryIds: ids };
        });
        const match = rec.quickbooksInvoiceRef ? qbInvoices.find((q) => q.docNumber === rec.quickbooksInvoiceRef && q.customerId === rec.customerId && q.qbInvoiceId && !used.has(q.qbInvoiceId)) : undefined;
        if (match?.qbInvoiceId) used.add(match.qbInvoiceId);
        return {
          id: rec.id,
          projectId: rec.projectId,
          customerId: rec.customerId,
          throughDate: rec.lastWorkDate,
          status: match ? "linked" : "invoiced",
          createdOn: rec.invoicedOn,
          laborLines,
          expenseLines: [],
          amountCents: rec.amountCents,
          invoicedOn: rec.invoicedOn,
          ...(rec.quickbooksInvoiceRef ? { quickbooksInvoiceRef: rec.quickbooksInvoiceRef } : {}),
          ...(match ? { qbInvoiceId: match.qbInvoiceId } : {}),
        };
      });
      const next: StoredDocument = { ...d, invoiceDrafts };
      delete next.billingRecords;
      return next;
    },
  },
];

export class MigrationError extends Error {}

export type MigrationResult = {
  data: BackofficeData;
  from: number;
  to: number;
  /** True when at least one migration ran. */
  migrated: boolean;
};

/** Throws if the list doesn't form an unbroken chain from `oldest` to `target`. */
export function checkMigrationChain(migrations: Migration[], oldest: number, target: number) {
  if (migrations.length !== target - oldest) {
    throw new MigrationError(`Expected ${target - oldest} migration(s) from version ${oldest} to ${target}, found ${migrations.length}.`);
  }
  migrations.forEach((m, i) => {
    if (m.from !== oldest + i) throw new MigrationError(`Migration ${i + 1} upgrades from version ${m.from}; expected ${oldest + i}.`);
  });
}

/** Upgrade a stored document from `storedVersion` to `target`. */
export function migrateData(
  stored: unknown,
  storedVersion: number,
  { migrations = MIGRATIONS, oldest = OLDEST_MIGRATABLE_VERSION, target = SCHEMA_VERSION }: { migrations?: Migration[]; oldest?: number; target?: number } = {},
): MigrationResult {
  if (!Number.isInteger(storedVersion)) throw new MigrationError(`Stored data has an invalid schema version (${String(storedVersion)}).`);
  if (storedVersion > target) {
    throw new MigrationError(`Stored data is schema version ${storedVersion}, which is newer than this build (version ${target}). Deploy a newer build.`);
  }
  if (storedVersion < oldest) {
    throw new MigrationError(`Stored data is schema version ${storedVersion}, which is too old to upgrade (oldest supported: ${oldest}).`);
  }
  if (typeof stored !== "object" || stored === null || Array.isArray(stored)) {
    throw new MigrationError("Stored data is not a document.");
  }
  checkMigrationChain(migrations, oldest, target);

  // Work on a copy so a failed upgrade never leaves the caller's value half-changed.
  let doc = structuredClone(stored) as StoredDocument;
  for (const m of migrations.slice(storedVersion - oldest)) {
    doc = { ...m.up(doc) };
    delete doc.schemaVersion;
  }
  return {
    data: { ...doc, schemaVersion: target } as unknown as BackofficeData,
    from: storedVersion,
    to: target,
    migrated: storedVersion < target,
  };
}
