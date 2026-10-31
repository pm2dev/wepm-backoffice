import * as billing from "@/lib/domain/billing";
import * as contractors from "@/lib/domain/contractors";
import * as expenses from "@/lib/domain/expenses";
import { commitImport } from "@/lib/domain/history-import";
import * as domain from "@/lib/domain/payroll";
import type { BackofficeData } from "@/lib/domain/types";
import type { BackofficeRepository } from "./repository";
import { buildSampleData } from "./sample-fixtures";

/** Separate namespace so demo storage can never be mistaken for real data. */
const STORAGE_KEY = "backoffice.sample-data.v4";

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
        if (parsed.schemaVersion === 4) return (this.data = parsed);
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

  // Adding a wepm.app person ID can resolve held-back time entries.
  async addContractor(input: Parameters<BackofficeRepository["addContractor"]>[0], today: string) {
    const r = contractors.addContractor(await this.load(), input);
    this.commit(billing.reprocessExceptions(r.data, today).data);
    return r.contractor;
  }

  async updateContractor(id: string, input: contractors.ContractorInput, today: string) {
    const r = contractors.updateContractor(await this.load(), id, input);
    this.commit(billing.reprocessExceptions(r.data, today).data);
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

  async addPaymentAccount(input: Parameters<BackofficeRepository["addPaymentAccount"]>[0]) {
    const r = expenses.addPaymentAccount(await this.load(), input);
    this.commit(r.data);
    return r.account;
  }

  async addExpense(input: expenses.ExpenseInput, today: string) {
    const r = expenses.addExpense(await this.load(), input, today);
    this.commit(r.data);
    return r.expense;
  }

  async updateExpense(id: string, input: expenses.ExpenseInput, today: string) {
    const r = expenses.updateExpense(await this.load(), id, input, today);
    this.commit(r.data);
    return r.expense;
  }

  async stopExpense(id: string, endDate: string | null) {
    this.commit(expenses.stopExpense(await this.load(), id, endDate));
  }

  async setChargesPaid(keys: string[], paidOn: string | null) {
    this.commit(expenses.setChargesPaid(await this.load(), keys, paidOn));
  }

  async setChargeAmount(key: string, amountCents: number) {
    this.commit(expenses.setChargeAmount(await this.load(), key, amountCents));
  }

  async addCustomer(input: billing.CustomerInput) {
    const r = billing.addCustomer(await this.load(), input);
    this.commit(r.data);
    return r.customer;
  }

  async updateCustomer(id: string, input: billing.CustomerInput) {
    const r = billing.updateCustomer(await this.load(), id, input);
    this.commit(r.data);
    return r.customer;
  }

  async addProject(input: billing.ProjectInput, today: string) {
    const r = billing.addProject(await this.load(), input, today);
    this.commit(r.data);
    return r.project;
  }

  async updateProject(id: string, input: billing.ProjectInput, today: string) {
    const r = billing.updateProject(await this.load(), id, input, today);
    this.commit(r.data);
    return r.project;
  }

  async markInvoiced(input: Parameters<BackofficeRepository["markInvoiced"]>[0]) {
    const r = billing.markInvoiced(await this.load(), input);
    this.commit(r.data);
    return r.record;
  }

  async removeBillingRecord(id: string) {
    this.commit(billing.removeBillingRecord(await this.load(), id));
  }

  resetDemo = async () => this.commit(buildSampleData());
}
