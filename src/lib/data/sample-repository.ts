import type { BackofficeData } from "@/lib/domain/types";
import { SCHEMA_VERSION } from "@/lib/domain/empty";
import { DomainError } from "@/lib/domain/payroll";
import { parseOperationArgs } from "./operation-schemas";
import { applyOperation, type OperationArgs, type OperationName, type OperationResult } from "./operations";
import { BackofficeRepository } from "./repository";
import { buildSampleData } from "./sample-fixtures";

/** Separate namespace so demo storage can never be mistaken for real data. */
const STORAGE_KEY = `backoffice.sample-data.v${SCHEMA_VERSION}`;

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
    const raw = typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) : null;
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as BackofficeData;
        if (parsed.schemaVersion === SCHEMA_VERSION) return (this.data = parsed);
      } catch {
        /* fall through to fresh sample data */
      }
    }
    return this.commit(buildSampleData());
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
