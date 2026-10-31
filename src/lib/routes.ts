/**
 * App URLs. Detail pages use query strings (not dynamic path segments) so the
 * app can be exported as a static site: records created in the browser have
 * IDs that don't exist at build time.
 */
const q = (path: string, params: Record<string, string>) => `${path}?${new URLSearchParams(params).toString()}`;

export const routes = {
  payroll: "/payroll",
  payrollHistory: "/payroll/history",
  payrollReview: (draftKey: string) => q("/payroll/review", { key: draftKey }),
  payrollRecord: (id: string) => q("/payroll/record", { id }),
  contractors: "/contractors",
  contractor: (id: string, hash?: string) => q("/contractors/profile", { id }) + (hash ? `#${hash}` : ""),
  contractorImport: (id: string) => q("/contractors/import", { id }),
};
