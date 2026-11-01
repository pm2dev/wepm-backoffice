"use client";

import * as RadixDialog from "@radix-ui/react-dialog";
import { Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useState, type ReactNode } from "react";
import { LoadingState } from "@/components/ui/states";
import { AccountMenu } from "@/components/auth/account-menu";
import { BackofficeProvider } from "@/lib/data/backoffice-provider";
import { cn } from "@/lib/utils";
import { isActive, NAV_ITEMS } from "./nav-items";
import { NoticeProvider } from "./notice";
import { SampleBanner } from "./sample-banner";

function NavList(props: { onNavigate?: () => void }) {
  // Pathname is request data; keep the shell prerenderable with a non-highlighted fallback.
  return (
    <Suspense fallback={<NavLinks pathname="" {...props} />}>
      <ActiveNavList {...props} />
    </Suspense>
  );
}

function ActiveNavList(props: { onNavigate?: () => void }) {
  return <NavLinks pathname={usePathname()} {...props} />;
}

function NavLinks({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <ul className="space-y-1">
      {NAV_ITEMS.map((item) => {
        const active = isActive(pathname, item.href);
        const Icon = item.icon;
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-blue-600",
                active ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100",
              )}
            >
              <Icon className="size-4 shrink-0" aria-hidden />
              <span className="flex-1">{item.label}</span>
              {!item.ready ? (
                <span className={cn("text-xs font-normal", active ? "text-slate-300" : "text-slate-400")}>Soon</span>
              ) : null}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function Brand() {
  return (
    <Link href="/payroll" className="flex items-baseline gap-2 rounded focus-visible:outline-2 focus-visible:outline-blue-600">
      <span className="text-lg font-semibold tracking-tight text-slate-900">Backoffice</span>
      <span className="text-xs text-slate-500">WEPM Labs</span>
    </Link>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <BackofficeProvider>
      <NoticeProvider>
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2">
          Skip to content
        </a>
        <div className="min-h-dvh lg:grid lg:grid-cols-[16rem_1fr]">
          {/* Desktop / iPad landscape sidebar */}
          <aside className="hidden border-r border-slate-200 bg-white lg:block">
            <div className="sticky top-0 flex h-dvh flex-col gap-6 overflow-y-auto p-4">
              <div className="px-3 pt-2">
                <Brand />
              </div>
              <nav aria-label="Main">
                <NavList />
              </nav>
              <div className="mt-auto">
                <AccountMenu />
              </div>
            </div>
          </aside>

          <div className="min-w-0">
            {/* Compact header (iPhone / iPad portrait) */}
            <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-slate-200 bg-white/95 px-2 pt-[env(safe-area-inset-top)] backdrop-blur lg:hidden">
              <RadixDialog.Root open={open} onOpenChange={setOpen}>
                <RadixDialog.Trigger
                  className="inline-flex size-11 items-center justify-center rounded-lg text-slate-700 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-blue-600"
                  aria-label="Open navigation"
                >
                  <Menu className="size-5" aria-hidden />
                </RadixDialog.Trigger>
                <RadixDialog.Portal>
                  <RadixDialog.Overlay className="fixed inset-0 z-40 bg-slate-900/40" />
                  <RadixDialog.Content className="fixed inset-y-0 left-0 z-50 flex w-[min(18rem,85vw)] flex-col gap-6 overflow-y-auto bg-white p-4 pt-[max(1rem,env(safe-area-inset-top))] shadow-xl focus:outline-none">
                    <div className="flex items-center justify-between px-3">
                      <RadixDialog.Title asChild>
                        <span>
                          <Brand />
                        </span>
                      </RadixDialog.Title>
                      <RadixDialog.Description className="sr-only">Main navigation</RadixDialog.Description>
                      <RadixDialog.Close
                        className="-mr-2 inline-flex size-11 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-blue-600"
                        aria-label="Close navigation"
                      >
                        <X className="size-5" aria-hidden />
                      </RadixDialog.Close>
                    </div>
                    <nav aria-label="Main">
                      <NavList onNavigate={() => setOpen(false)} />
                    </nav>
                    <div className="mt-auto pb-[env(safe-area-inset-bottom)]">
                      <AccountMenu />
                    </div>
                  </RadixDialog.Content>
                </RadixDialog.Portal>
              </RadixDialog.Root>
              <Brand />
            </header>

            <SampleBanner />
            <main id="main" className="mx-auto max-w-6xl px-4 py-6 pb-24 sm:px-6 lg:px-8 lg:py-8">
              <Suspense fallback={<LoadingState />}>{children}</Suspense>
            </main>
          </div>
        </div>
      </NoticeProvider>
    </BackofficeProvider>
  );
}
