"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/payroll", label: "What’s due" },
  { href: "/payroll/history", label: "Payment history" },
];

export function PayrollTabs() {
  return (
    <Suspense fallback={<Tabs pathname="" />}>
      <ActiveTabs />
    </Suspense>
  );
}

function ActiveTabs() {
  return <Tabs pathname={usePathname()} />;
}

function Tabs({ pathname }: { pathname: string }) {
  return (
    <nav aria-label="Payroll" className="mb-6 flex gap-1 border-b border-slate-200">
      {TABS.map((t) => {
        const active = pathname === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "-mb-px inline-flex min-h-11 items-center border-b-2 px-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-blue-600",
              active ? "border-slate-900 text-slate-900" : "border-transparent text-slate-600 hover:text-slate-900",
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
