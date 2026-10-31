import * as domain from "@/lib/domain/payroll";
import type { BackofficeData } from "@/lib/domain/types";
import type { BackofficeRepository } from "./repository";
import { buildSampleData } from "./sample-fixtures";

/** Separate namespace so demo storage can never be mistaken for real data. */
const STORAGE_KEY = "backoffice.sample-data.v1";

/**
 * Frontend-prototype repository: sample data persisted in localStorage.
 * localStorage is a demonstration mechanism only — not production storage.
 */
export class SampleRepository implements BackofficeRepository {
  readonly mode = "sample" as const;
  private data: BackofficeData | null = null;

  async load(): Promise<BackofficeData> {
    if (this.data) return this.data;
    const raw = typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) : null;
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as BackofficeData;
        if (parsed.schemaVersion === 1) return (this.data = parsed);
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

  async finalizePayroll(key: string, today: string) {
    const r = domain.finalizePayroll(await this.load(), key, today);
    this.commit(r.data);
    return r.payroll;
  }

  async recordPayment(input: domain.RecordPaymentInput, today: string) {
    const r = domain.recordPayment(await this.load(), input, today);
    this.commit(r.data);
    return r.payment;
  }

  async addAdjustment(input: Parameters<BackofficeRepository["addAdjustment"]>[0], today: string) {
    const r = domain.addAdjustment(await this.load(), input, today);
    this.commit(r.data);
    return r.adjustment;
  }

  resetDemo = async () => this.commit(buildSampleData());
}
