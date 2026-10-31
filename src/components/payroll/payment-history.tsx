"use client";

import { routes } from "@/lib/routes";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Field, Select } from "@/components/ui/field";
import { EmptyState, ErrorState, LoadingState, PageHeader } from "@/components/ui/states";
import { useBackoffice } from "@/lib/data/backoffice-provider";
import { formatDate, formatRange } from "@/lib/domain/dates";
import { formatCents } from "@/lib/domain/money";
import { PAYMENT_METHOD_LABELS, type BackofficeData, type PaymentAllocation } from "@/lib/domain/types";
import { KindBadge } from "./labels";
import { PayrollTabs } from "./payroll-tabs";

function describeAllocation(data: BackofficeData, a: PaymentAllocation) {
  if (a.obligation.kind === "payroll") {
    const p = data.payrolls.find((x) => x.id === a.obligation.id);
    return p ? { text: `${p.lateApproved ? "Late-approved hours" : "Weekly hours"} · ${formatRange(p.periodStart, p.periodEnd)}`, href: routes.payrollRecord(p.id) } : { text: "Payroll record" };
  }
  const adj = data.adjustments.find((x) => x.id === a.obligation.id);
  return { text: adj?.description ?? "Record" };
}

export function PaymentHistoryPage() {
  const { state } = useBackoffice();
  const [contractorId, setContractorId] = useState("");
  const payments = useMemo(() => {
    if (state.status !== "ready") return [];
    return state.data.payments
      .filter((p) => !contractorId || p.contractorId === contractorId)
      .sort((a, b) => (a.paidOn === b.paidOn ? (a.id < b.id ? 1 : -1) : a.paidOn < b.paidOn ? 1 : -1));
  }, [state, contractorId]);

  return (
    <>
      <PageHeader title="Payroll" description="Payments you recorded after paying contractors outside Backoffice." />
      <PayrollTabs />
      {state.status === "loading" ? <LoadingState /> : null}
      {state.status === "error" ? <ErrorState message={state.message} /> : null}
      {state.status === "ready" ? (
        <div className="space-y-4">
          <div className="max-w-xs">
            <Field label="Contractor" htmlFor="hist-contractor">
              <Select id="hist-contractor" value={contractorId} onChange={(e) => setContractorId(e.target.value)}>
                <option value="">All contractors</option>
                {state.data.contractors.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </Select>
            </Field>
          </div>
          {payments.length === 0 ? (
            <EmptyState title="No payments recorded">Payments appear here after you record them from What&rsquo;s due.</EmptyState>
          ) : (
            <Card>
              <ul className="divide-y divide-slate-200">
                {payments.map((p) => {
                  const name = state.data.contractors.find((c) => c.id === p.contractorId)?.name ?? "Unknown contractor";
                  const total = p.allocations.reduce((s, a) => s + a.amountCents, 0);
                  return (
                    <li key={p.id} className="p-4">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <p className="font-medium text-slate-900">
                          {name} <span className="font-normal text-slate-600">· {formatDate(p.paidOn, { weekday: true })} · {PAYMENT_METHOD_LABELS[p.method]}</span>
                        </p>
                        <p className="tabular text-lg font-semibold">{formatCents(total)}</p>
                      </div>
                      {p.note ? <p className="mt-1 text-sm text-slate-600">{p.note}</p> : null}
                      <ul className="mt-2 space-y-1.5 text-sm">
                        {p.allocations.map((a) => {
                          const d = describeAllocation(state.data, a);
                          return (
                            <li key={`${a.obligation.kind}:${a.obligation.id}`} className="flex flex-wrap items-center justify-between gap-2">
                              <span className="flex flex-wrap items-center gap-2">
                                <KindBadge kind={a.obligation.kind} />
                                {d.href ? <Link href={d.href} className="text-blue-700 underline underline-offset-2">{d.text}</Link> : <span>{d.text}</span>}
                              </span>
                              <span className="tabular text-slate-700">{formatCents(a.amountCents)}</span>
                            </li>
                          );
                        })}
                      </ul>
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}
        </div>
      ) : null}
    </>
  );
}
