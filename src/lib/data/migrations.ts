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
