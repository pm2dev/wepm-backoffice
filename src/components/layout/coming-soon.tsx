import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/states";
import Link from "next/link";

export function ComingSoon({ title, summary }: { title: string; summary: string }) {
  return (
    <>
      <PageHeader title={title} />
      <Card className="p-8">
        <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">Coming soon</p>
        <p className="mt-2 max-w-prose text-slate-700">{summary}</p>
        <p className="mt-4 text-sm">
          <Link href="/payroll" className="font-medium text-blue-700 underline underline-offset-2">
            Go to Payroll
          </Link>
        </p>
      </Card>
    </>
  );
}
