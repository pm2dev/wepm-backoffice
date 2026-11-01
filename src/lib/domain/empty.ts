import type { BackofficeData } from "./types";

export const SCHEMA_VERSION = 7 as const;

/** A brand-new workspace with no records. */
export function emptyData(): BackofficeData {
  return {
    schemaVersion: SCHEMA_VERSION,
    contractors: [],
    rates: [],
    projects: [],
    timeEntries: [],
    timeExceptions: [],
    payrolls: [],
    adjustments: [],
    payments: [],
    importBatches: [],
    paymentAccounts: [],
    expenses: [],
    expenseCharges: [],
    customers: [],
    billingRecords: [],
    invoiceReceipts: [],
    quickbooksInvoices: [],
    integrations: {},
  };
}
