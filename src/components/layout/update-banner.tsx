"use client";

import { RefreshCw } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { DATA_MODE } from "@/lib/data/backoffice-provider";
import { checkDeployment, NEW_VERSION_EVENT } from "@/lib/data/live-repository";

const CHECK_EVERY_MS = 5 * 60 * 1000;

/**
 * Keeps an open tab from running an old version after a deploy.
 * - Detects a new deploy when the tab regains focus, every few minutes while
 *   visible, and on every data request (server sends its deployment ID).
 * - Shows "Backoffice was updated — Reload" (never reloads mid-form by itself).
 * - On the next page change after that, reloads the page so the new version
 *   loads. The session cookie is unaffected, so you stay signed in.
 */
export function UpdateBanner() {
  const [available, setAvailable] = useState(false);
  const pathname = usePathname();
  const pathAtDetection = useRef<string | null>(null);

  useEffect(() => {
    if (DATA_MODE !== "live" || !process.env.NEXT_PUBLIC_DEPLOYMENT_ID) return;
    const check = () => {
      if (document.visibilityState !== "visible") return;
      fetch(`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/health`, { cache: "no-store" })
        .then(checkDeployment)
        .catch(() => {});
    };
    const onNew = () => setAvailable(true);
    window.addEventListener(NEW_VERSION_EVENT, onNew);
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    const timer = window.setInterval(check, CHECK_EVERY_MS);
    return () => {
      window.removeEventListener(NEW_VERSION_EVENT, onNew);
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("focus", check);
      window.clearInterval(timer);
    };
  }, []);

  // Once a new version is known, the next page change loads it for real.
  useEffect(() => {
    if (!available) return;
    if (pathAtDetection.current === null) pathAtDetection.current = pathname;
    else if (pathname !== pathAtDetection.current) window.location.reload();
  }, [available, pathname]);

  if (!available) return null;
  return (
    <div role="status" className="border-b border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-950">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2">
        <span>Backoffice was updated. Reload to use the latest version — you&rsquo;ll stay signed in.</span>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-blue-900 px-3 text-sm font-medium text-white hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 pointer-fine:min-h-9"
        >
          <RefreshCw className="size-4" aria-hidden />
          Reload
        </button>
      </div>
    </div>
  );
}
