"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";
import { cn } from "@/lib/utils";

export type SectionTab = { href: string; label: string };

/** Sub-navigation within a module. Scrolls horizontally on narrow screens. */
export function SectionTabs({ label, tabs }: { label: string; tabs: SectionTab[] }) {
  return (
    <Suspense fallback={<Tabs label={label} tabs={tabs} pathname="" />}>
      <ActiveTabs label={label} tabs={tabs} />
    </Suspense>
  );
}

function ActiveTabs(props: { label: string; tabs: SectionTab[] }) {
  return <Tabs {...props} pathname={usePathname()} />;
}

function Tabs({ label, tabs, pathname }: { label: string; tabs: SectionTab[]; pathname: string }) {
  const norm = (p: string) => p.replace(/\/$/, "") || "/";
  return (
    <nav aria-label={label} className="-mx-4 mb-6 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <div className="flex min-w-max gap-1 border-b border-slate-200">
        {tabs.map((t) => {
          const active = norm(pathname) === norm(t.href);
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "-mb-px inline-flex min-h-11 items-center whitespace-nowrap border-b-2 px-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-blue-600",
                active ? "border-slate-900 text-slate-900" : "border-transparent text-slate-600 hover:text-slate-900",
              )}
            >
              {t.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
