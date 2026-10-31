import * as contractors from "@/lib/domain/contractors";
import { commitImport } from "@/lib/domain/history-import";
import * as domain from "@/lib/domain/payroll";
import type { BackofficeData } from "@/lib/domain/types";
import type { BackofficeRepository } from "./repository";
import { buildSampleData } from "./sample-fixtures";

/** Separate namespace so demo storage can never be mistaken for real data. */
const STORAGE_KEY = "backoffice.sample-data.v2";

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
        if (parsed.schemaVersion === 2) return (this.data = parsed);
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

  async addContractor(input: Parameters<BackofficeRepository["addContractor"]>[0]) {
    const r = contractors.addContractor(await this.load(), input);
    this.commit(r.data);
    return r.contractor;
  }

  async updateContractor(id: string, input: contractors.ContractorInput) {
    const r = contractors.updateContractor(await this.load(), id, input);
    this.commit(r.data);
    return r.contractor;
  }

  async addRate(input: Parameters<BackofficeRepository["addRate"]>[0]) {
    const r = contractors.addRate(await this.load(), input);
    this.commit(r.data);
    return r.rate;
  }

  async importHistoricalHours(input: Parameters<BackofficeRepository["importHistoricalHours"]>[0], today: string) {
    const r = commitImport(await this.load(), input, today);
    this.commit(r.data);
    return r.batch;
  }

  resetDemo = async () => this.commit(buildSampleData());
}
