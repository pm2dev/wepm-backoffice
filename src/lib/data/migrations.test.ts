import { describe, expect, it } from "vitest";
import { SCHEMA_VERSION } from "@/lib/domain/empty";
import { checkMigrationChain, MIGRATIONS, migrateData, MigrationError, OLDEST_MIGRATABLE_VERSION, type Migration } from "./migrations";
import { buildSampleData } from "./sample-fixtures";

const chain: Migration[] = [
  { from: 1, description: "rename a → b", up: ({ a, ...rest }) => ({ ...rest, b: a }) },
  { from: 2, description: "add c", up: (d) => ({ ...d, c: [] }) },
];
const opts = { migrations: chain, oldest: 1, target: 3 };

describe("migrations", () => {
  it("the real migration list reaches the current schema version", () => {
    expect(() => checkMigrationChain(MIGRATIONS, OLDEST_MIGRATABLE_VERSION, SCHEMA_VERSION)).not.toThrow();
  });

  it("v7 → v8: a project's active flag becomes a status", () => {
    const v7 = { schemaVersion: 7, projects: [{ id: "a", active: true }, { id: "b", active: false }] };
    const { data } = migrateData(v7, 7, { migrations: MIGRATIONS.slice(0, 1), target: 8 });
    expect(data.schemaVersion).toBe(8);
    expect(data.projects).toEqual([{ id: "a", status: "active" }, { id: "b", status: "completed" }]);
  });

  it("upgrades the sample data as stored by version 7", () => {
    const v7 = buildSampleData() as unknown as Record<string, unknown> & { projects: Record<string, unknown>[] };
    const stored = { ...v7, schemaVersion: 7, projects: v7.projects.map(({ status, ...p }) => ({ ...p, active: status !== "completed" })) };
    const { data } = migrateData(stored, 7);
    expect(data.projects.every((p) => p.status === "active" || p.status === "completed")).toBe(true);
    expect(data.projects.some((p) => "active" in p)).toBe(false);
  });

  it("v8 → v9: project rates become dated rows from the earliest of start date and first hours", () => {
    const v8 = {
      schemaVersion: 8,
      projects: [
        { id: "h", billingMethod: "hourly", hourlyRateCents: 14000, taskRates: {}, startDate: "2026-09-14" },
        { id: "t", billingMethod: "task", taskRates: { Development: 12500, Meetings: 7500 } },
        { id: "none", billingMethod: "hourly", taskRates: {} },
        { id: "fresh", billingMethod: "hourly", hourlyRateCents: 9000, taskRates: {} },
      ],
      timeEntries: [
        { projectId: "h", workDate: "2026-09-01" },
        { projectId: "t", workDate: "2026-10-05" },
        { projectId: "t", workDate: "2026-08-03" },
      ],
    };
    const { data } = migrateData(v8, 8, { migrations: MIGRATIONS.slice(0, 2), oldest: 7, target: 9 });
    expect(data.projects.every((p) => !("hourlyRateCents" in p) && !("taskRates" in p))).toBe(true);
    expect(data.billingRates).toEqual([
      { id: "brate_h_1", projectId: "h", task: null, effectiveDate: "2026-09-01", rateCents: 14000 },
      { id: "brate_t_1", projectId: "t", task: "Development", effectiveDate: "2026-08-03", rateCents: 12500 },
      { id: "brate_t_2", projectId: "t", task: "Meetings", effectiveDate: "2026-08-03", rateCents: 7500 },
      { id: "brate_fresh_1", projectId: "fresh", task: null, effectiveDate: "2000-01-01", rateCents: 9000 },
    ]);
  });

  it("v9 → v10: adds an empty project expense list", () => {
    const { data } = migrateData({ schemaVersion: 9, projects: [] }, 9, { migrations: MIGRATIONS.slice(0, 3), oldest: 7, target: 10 });
    expect(data.projectExpenses).toEqual([]);
  });

  it("v10 → v11: billing records become invoiced drafts, linked when the QuickBooks number matches", () => {
    const v10 = {
      schemaVersion: 10,
      timeEntries: [
        { id: "e1", task: "Development", workDate: "2026-10-05" },
        { id: "e2", task: "Meetings", workDate: "2026-10-06" },
        { id: "e3", task: "Development", workDate: "2026-10-07" },
      ],
      quickbooksInvoices: [{ qbInvoiceId: "1031", docNumber: "INV-31", customerId: "c1" }],
      billingRecords: [
        {
          id: "bill_1", projectId: "p1", customerId: "c1", entryIds: ["e1", "e2", "e3"], firstWorkDate: "2026-10-05", lastWorkDate: "2026-10-07",
          lines: [{ task: "Development", minutes: 120, rateCents: 10000, amountCents: 20000 }, { task: "Meetings", minutes: 60, rateCents: 5000, amountCents: 5000 }],
          amountCents: 25000, invoicedOn: "2026-10-12", quickbooksInvoiceRef: "INV-31",
        },
        { id: "bill_2", projectId: "p1", customerId: "c1", entryIds: [], firstWorkDate: "2026-09-01", lastWorkDate: "2026-09-02", lines: [], amountCents: 0, invoicedOn: "2026-09-03" },
      ],
    };
    const { data } = migrateData(v10, 10, { migrations: MIGRATIONS.slice(0, 4), oldest: 7, target: 11 });
    expect("billingRecords" in data).toBe(false);
    expect(data.invoiceDrafts[0]).toMatchObject({ id: "bill_1", status: "linked", qbInvoiceId: "1031", invoicedOn: "2026-10-12", amountCents: 25000, expenseLines: [] });
    expect(data.invoiceDrafts[0].laborLines.map((l) => [l.task, l.entryIds, l.firstWorkDate, l.lastWorkDate])).toEqual([
      ["Development", ["e1", "e3"], "2026-10-05", "2026-10-07"],
      ["Meetings", ["e2"], "2026-10-06", "2026-10-06"],
    ]);
    expect(data.invoiceDrafts[1].status).toBe("invoiced");
    expect(data.invoiceDrafts[1].qbInvoiceId).toBeUndefined();
  });

  it("leaves current data unchanged", () => {
    const data = buildSampleData();
    const r = migrateData(data, SCHEMA_VERSION);
    expect(r).toMatchObject({ migrated: false, from: SCHEMA_VERSION, to: SCHEMA_VERSION });
    expect(r.data).toEqual(data);
  });

  it("runs every step from the stored version and sets the new version", () => {
    const r = migrateData({ schemaVersion: 1, a: 5 }, 1, opts);
    expect(r).toMatchObject({ migrated: true, from: 1, to: 3 });
    expect(r.data).toEqual({ schemaVersion: 3, b: 5, c: [] });
  });

  it("starts from the stored version, not the oldest", () => {
    expect(migrateData({ schemaVersion: 2, b: 5 }, 2, opts).data).toEqual({ schemaVersion: 3, b: 5, c: [] });
  });

  it("never changes the stored value", () => {
    const stored = { schemaVersion: 1, a: { nested: true } };
    const before = structuredClone(stored);
    migrateData(stored, 1, opts);
    expect(stored).toEqual(before);
  });

  it("rejects data newer than the build", () => {
    expect(() => migrateData({}, 4, opts)).toThrow(/newer than this build/);
  });

  it("rejects data older than the oldest migratable version", () => {
    expect(() => migrateData({}, 0, opts)).toThrow(/too old/);
  });

  it("rejects a broken chain", () => {
    expect(() => migrateData({}, 1, { ...opts, migrations: [chain[0]] })).toThrow(MigrationError);
    expect(() => migrateData({}, 1, { ...opts, migrations: [chain[1], chain[0]] })).toThrow(/expected 1/);
  });

  it("rejects stored values that aren't documents", () => {
    expect(() => migrateData(null, 1, opts)).toThrow(/not a document/);
    expect(() => migrateData([], 1, opts)).toThrow(/not a document/);
  });
});
