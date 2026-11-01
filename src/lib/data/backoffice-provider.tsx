"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { isISODate, localToday, type ISODate } from "@/lib/domain/dates";
import type { BackofficeData } from "@/lib/domain/types";
import { LiveRepository } from "./live-repository";
import type { BackofficeRepository } from "./repository";
import { SampleRepository } from "./sample-repository";

/** Build-time configuration (inlined by Next.js). */
export const DATA_MODE = process.env.NEXT_PUBLIC_DATA_MODE === "live" ? "live" : "sample";
export const APP_ENV = process.env.NEXT_PUBLIC_APP_ENV === "production" ? "production" : process.env.NEXT_PUBLIC_APP_ENV === "development" ? "development" : "preview";

function createRepository(): BackofficeRepository {
  if (DATA_MODE === "live") return new LiveRepository(process.env.NEXT_PUBLIC_BASE_PATH ?? "", APP_ENV === "development");
  return new SampleRepository();
}

const CLOCK_KEY = "backoffice.sample-clock";

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: BackofficeData };

type Ctx = {
  state: State;
  repo: BackofficeRepository;
  /** The business date used for live displays and payment defaults. Empty until loaded. */
  today: ISODate;
  /** Non-null when the demo clock is overriding the device date. */
  clockOverride: ISODate | null;
  setClockOverride: (date: ISODate | null) => void;
  /** Run a repository mutation, then reload data. Errors are rethrown to the caller. */
  mutate: <T>(fn: (repo: BackofficeRepository) => Promise<T>) => Promise<T>;
  reload: () => Promise<void>;
};

const BackofficeContext = createContext<Ctx | null>(null);

export function BackofficeProvider({ children }: { children: ReactNode }) {
  const repo = useMemo<BackofficeRepository>(() => createRepository(), []);
  const [state, setState] = useState<State>({ status: "loading" });
  const [clockOverride, setClockState] = useState<ISODate | null>(null);
  // Empty until mounted: the device date is only read in the browser, never during prerender.
  const [deviceToday, setDeviceToday] = useState<ISODate>("");

  const reload = useCallback(async () => {
    try {
      const data = await repo.load();
      setState({ status: "ready", data: { ...data } });
    } catch (e) {
      setState({ status: "error", message: e instanceof Error ? e.message : "Could not load data." });
    }
  }, [repo]);

  useEffect(() => {
    const saved = window.localStorage.getItem(CLOCK_KEY);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reading browser-only storage after mount
    if (saved && isISODate(saved)) setClockState(saved);
    setDeviceToday(localToday());
    void reload();
  }, [reload]);

  const setClockOverride = useCallback((date: ISODate | null) => {
    if (date) window.localStorage.setItem(CLOCK_KEY, date);
    else window.localStorage.removeItem(CLOCK_KEY);
    setClockState(date);
  }, []);

  const mutate = useCallback(
    async <T,>(fn: (r: BackofficeRepository) => Promise<T>) => {
      const result = await fn(repo);
      await reload();
      return result;
    },
    [repo, reload],
  );

  const value: Ctx = {
    state,
    repo,
    today: clockOverride ?? deviceToday,
    clockOverride,
    setClockOverride,
    mutate,
    reload,
  };
  return <BackofficeContext.Provider value={value}>{children}</BackofficeContext.Provider>;
}

export function useBackoffice(): Ctx {
  const ctx = useContext(BackofficeContext);
  if (!ctx) throw new Error("useBackoffice must be used inside BackofficeProvider");
  return ctx;
}
