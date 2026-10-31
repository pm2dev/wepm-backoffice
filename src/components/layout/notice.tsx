"use client";

import { CheckCircle2, X } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

const NoticeContext = createContext<(message: string) => void>(() => {});

/** Success confirmations, announced politely to screen readers. */
export function NoticeProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const notify = useCallback((m: string) => {
    setMessage(m);
    setNonce((n) => n + 1);
  }, []);
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(null), 6000);
    return () => clearTimeout(t);
  }, [message, nonce]);

  return (
    <NoticeContext.Provider value={notify}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4 pb-[env(safe-area-inset-bottom)]">
        {message ? (
          <div className="pointer-events-auto flex max-w-md items-center gap-3 rounded-xl bg-slate-900 px-4 py-3 text-sm text-white shadow-lg">
            <CheckCircle2 className="size-5 shrink-0 text-emerald-400" aria-hidden />
            <span>{message}</span>
            <button type="button" onClick={() => setMessage(null)} className="-m-2 inline-flex size-11 items-center justify-center rounded-lg hover:bg-slate-800" aria-label="Dismiss">
              <X className="size-4" aria-hidden />
            </button>
          </div>
        ) : null}
      </div>
    </NoticeContext.Provider>
  );
}

export const useNotice = () => useContext(NoticeContext);
