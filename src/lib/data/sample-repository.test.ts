import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SCHEMA_VERSION } from "@/lib/domain/empty";
import { buildSampleData } from "./sample-fixtures";
import { SampleRepository } from "./sample-repository";

const KEY = `backoffice.sample-data.v${SCHEMA_VERSION}`;

function fakeStorage(initial: Record<string, string> = {}) {
  const items = new Map(Object.entries(initial));
  return {
    items,
    getItem: (k: string) => items.get(k) ?? null,
    setItem: (k: string, v: string) => void items.set(k, v),
    removeItem: (k: string) => void items.delete(k),
  };
}

describe("SampleRepository storage", () => {
  let storage: ReturnType<typeof fakeStorage>;
  const install = (initial?: Record<string, string>) => {
    storage = fakeStorage(initial);
    vi.stubGlobal("window", { localStorage: storage });
  };
  beforeEach(() => install());
  afterEach(() => vi.unstubAllGlobals());

  it("loads data saved by this build", async () => {
    const saved = { ...buildSampleData(), customers: [] };
    install({ [KEY]: JSON.stringify(saved) });
    expect((await new SampleRepository().load()).customers).toEqual([]);
  });

  it("starts fresh sample data when the save is unreadable", async () => {
    install({ [KEY]: "{not json" });
    const data = await new SampleRepository().load();
    expect(data.customers.length).toBeGreaterThan(0);
    expect(JSON.parse(storage.items.get(KEY)!).schemaVersion).toBe(SCHEMA_VERSION);
  });

  it("upgrades a save from the previous version and moves it to the current key", async () => {
    const old = "backoffice.sample-data.v7";
    install({ [old]: JSON.stringify({ ...buildSampleData(), schemaVersion: 7, projects: [{ id: "p1", name: "Old", active: false }] }) });
    const data = await new SampleRepository().load();
    expect(data.projects).toEqual([{ id: "p1", name: "Old", status: "completed" }]);
    expect(storage.items.has(old)).toBe(false);
    expect(JSON.parse(storage.items.get(KEY)!).schemaVersion).toBe(SCHEMA_VERSION);
  });

  it("removes saves left by older builds once the current one loads", async () => {
    install({ [KEY]: JSON.stringify(buildSampleData()), "backoffice.sample-data.v9": "{}", "backoffice.sample-data.v3": "{}" });
    await new SampleRepository().load();
    expect([...storage.items.keys()]).toEqual([KEY]);
  });

  it("ignores saves older than the oldest upgradable version", async () => {
    install({ "backoffice.sample-data.v6": JSON.stringify({ schemaVersion: 6, customers: [] }) });
    expect((await new SampleRepository().load()).customers.length).toBeGreaterThan(0);
  });

  it("starts fresh when the save claims a newer version than this build", async () => {
    install({ [KEY]: JSON.stringify({ ...buildSampleData(), schemaVersion: SCHEMA_VERSION + 1, customers: [] }) });
    expect((await new SampleRepository().load()).customers.length).toBeGreaterThan(0);
  });
});
