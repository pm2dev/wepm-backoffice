"use client";

import { LogOut, UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import { DATA_MODE } from "@/lib/data/backoffice-provider";

/** Signed-in user and Sign out — hosted (live) app only. */
export function AccountMenu() {
  const [username, setUsername] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

  useEffect(() => {
    if (DATA_MODE !== "live") return;
    let cancelled = false;
    fetch(`${basePath}/api/auth/session`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((b: { username?: string } | null) => {
        if (!cancelled) setUsername(b?.username ?? null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [basePath]);

  if (DATA_MODE !== "live") return null;

  return (
    <div className="border-t border-slate-200 px-3 pt-4">
      {username ? (
        <p className="flex items-center gap-2 truncate text-sm text-slate-600">
          <UserRound className="size-4 shrink-0" aria-hidden />
          <span className="truncate">Signed in as <strong className="text-slate-900">{username}</strong></span>
        </p>
      ) : null}
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          await fetch(`${basePath}/api/auth/logout`, { method: "POST" }).catch(() => {});
          // Full reload on purpose: drops any business data held in memory.
          // eslint-disable-next-line @next/next/no-location-assign-relative-destination
          window.location.assign(`${basePath}/login`);
        }}
        className="mt-2 flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium text-slate-700 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-blue-600 -mx-3 disabled:opacity-60"
      >
        <LogOut className="size-4" aria-hidden />
        {busy ? "Signing out…" : "Sign out"}
      </button>
    </div>
  );
}
