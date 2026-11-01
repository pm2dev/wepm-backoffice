import { ChevronLeft } from "lucide-react";
import Link from "next/link";

export function BackLink({ href = "/payroll", label = "What’s due" }: { href?: string; label?: string }) {
  return (
    <Link href={href} className="-ml-2 mb-4 inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-sm font-medium text-slate-700 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-blue-600">
      <ChevronLeft className="size-4" aria-hidden />
      {label}
    </Link>
  );
}
