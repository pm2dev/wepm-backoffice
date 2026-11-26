import type { BackofficeData } from "./types";

export const SCHEMA_VERSION = 11 as const;

/** A brand-new workspace with no records. */
export function emptyData(): BackofficeData {
  return {
    schemaVersion: SCHEMA_VERSION,
    contractors: [],
    rates: [],
    projects: [],
    billingRates: [],
    timeEntries: [],
    timeExceptions: [],
    payrolls: [],
    adjustments: [],
    payments: [],
    importBatches: [],
    paymentAccounts: [],
    expenses: [],
    expenseCharges: [],
    projectExpenses: [],
    customers: [],
    invoiceDrafts: [],
    invoiceReceipts: [],
    quickbooksInvoices: [],
    integrations: {},
  };
}
