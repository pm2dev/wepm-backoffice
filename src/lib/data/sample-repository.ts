import type { BackofficeData } from "@/lib/domain/types";
import { SCHEMA_VERSION } from "@/lib/domain/empty";
import { DomainError } from "@/lib/domain/payroll";
import { migrateData, OLDEST_MIGRATABLE_VERSION } from "./migrations";
import { parseOperationArgs } from "./operation-schemas";
import { applyOperation, type OperationArgs, type OperationName, type OperationResult } from "./operations";
import { BackofficeRepository } from "./repository";
import { buildSampleData } from "./sample-fixtures";

/** Separate namespace so demo storage can never be mistaken for real data. */
const storageKey = (version: number) => `backoffice.sample-data.v${version}`;
const STORAGE_KEY = storageKey(SCHEMA_VERSION);

/**
 * Find this browser's saved sample data, upgrading it if it was saved by an
 * older build. Data too old to upgrade, or unreadable, is ignored.
 */
function readSaved(storage: Storage): { data: BackofficeData; fromKey: string } | null {
  for (let v = SCHEMA_VERSION; v >= OLDEST_MIGRATABLE_VERSION; v--) {
    const key = storageKey(v);
    const raw = storage.getItem(key);
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw) as { schemaVersion?: unknown };
      return { data: migrateData(parsed, Number(parsed.schemaVersion)).data, fromKey: key };
    } catch {
      /* unreadable or not upgradable: try older saves, then fresh sample data */
    }
  }
  return null;
}

/**
 * Frontend-prototype repository: sample data persisted in localStorage.
 * localStorage is a demonstration mechanism only — not production storage.
 */
export class SampleRepository extends BackofficeRepository {
  readonly mode = "sample" as const;
  readonly devTools = true;
  private data: BackofficeData | null = null;

  async load(): Promise<BackofficeData> {
    if (this.data) return this.data;
    const saved = typeof window !== "undefined" ? readSaved(window.localStorage) : null;
    if (!saved) return this.commit(buildSampleData());
    if (saved.fromKey === STORAGE_KEY) return (this.data = saved.data);
    this.commit(saved.data);
    window.localStorage.removeItem(saved.fromKey);
    return saved.data;
  }

  private commit(next: BackofficeData): BackofficeData {
    this.data = next;
    if (typeof window !== "undefined") window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    return next;
  }

  protected async run<K extends OperationName>(op: K, args: OperationArgs<K>): Promise<OperationResult<K>> {
    // Same JSON round trip as the live API (drops undefined, copies values),
    // so validation behaves identically in both modes.
    const parsed = parseOperationArgs(op, JSON.parse(JSON.stringify(args ?? {})));
    if (!parsed.ok) throw new DomainError(`Invalid request (${parsed.reason}).`);
    const r = applyOperation(await this.load(), op, parsed.args);
    this.commit(r.data);
    return r.result;
  }
}
