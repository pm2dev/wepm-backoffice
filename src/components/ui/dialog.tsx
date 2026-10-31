"use client";

import * as RadixDialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export const Dialog = RadixDialog.Root;
export const DialogTrigger = RadixDialog.Trigger;
export const DialogClose = RadixDialog.Close;

/**
 * Modal dialog: traps focus, closes on Escape, and returns focus to the
 * control that opened it (Radix behavior). Scrolls internally so forms stay
 * usable with the iOS keyboard open.
 */
export function DialogContent({
  title,
  description,
  children,
  className,
  returnFocusTo,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
  /**
   * For dialogs opened programmatically (no DialogTrigger): the element to
   * focus on close. Falls back to the page's main heading if it is gone.
   */
  returnFocusTo?: HTMLElement | null;
}) {
  return (
    <RadixDialog.Portal>
      <RadixDialog.Overlay className="fixed inset-0 z-40 bg-slate-900/40" />
      <RadixDialog.Content
        onCloseAutoFocus={
          returnFocusTo !== undefined
            ? (e) => {
                e.preventDefault();
                const target = returnFocusTo?.isConnected ? returnFocusTo : document.querySelector<HTMLElement>("main h1");
                if (target && !target.hasAttribute("tabindex") && target.tagName === "H1") target.setAttribute("tabindex", "-1");
                target?.focus();
              }
            : undefined
        }
        className={cn(
          "fixed z-50 flex flex-col bg-white shadow-xl focus:outline-none",
          "inset-x-0 bottom-0 max-h-[92dvh] rounded-t-2xl",
          "sm:inset-auto sm:top-1/2 sm:left-1/2 sm:max-h-[85dvh] sm:w-[min(36rem,calc(100vw-2rem))] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl",
          className,
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div>
            <RadixDialog.Title className="text-lg font-semibold text-slate-900">{title}</RadixDialog.Title>
            {description ? (
              <RadixDialog.Description className="mt-1 text-sm text-slate-600">{description}</RadixDialog.Description>
            ) : (
              <RadixDialog.Description className="sr-only">{title}</RadixDialog.Description>
            )}
          </div>
          <RadixDialog.Close
            className="-m-2 inline-flex size-11 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-blue-600"
            aria-label="Close"
          >
            <X className="size-5" aria-hidden />
          </RadixDialog.Close>
        </div>
        <div className="overflow-y-auto overscroll-contain px-5 py-4">{children}</div>
      </RadixDialog.Content>
    </RadixDialog.Portal>
  );
}

/**
 * For dialogs mounted when opened from code: remembers the control that had
 * focus (Safari doesn't focus buttons on tap, so this may be null) so focus
 * can return to it on close.
 */
export function useOpenerElement(): HTMLElement | null {
  const [opener] = useState<HTMLElement | null>(() => {
    if (typeof document === "undefined") return null;
    const el = document.activeElement as HTMLElement | null;
    return el && el !== document.body ? el : null;
  });
  return opener;
}
