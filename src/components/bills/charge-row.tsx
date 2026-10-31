"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { daysBetween, formatDate } from "@/lib/domain/dates";
import { accountLabel, type ChargeView } from "@/lib/domain/expenses";
import { assignmentLabel } from "@/lib/domain/labels";
import { formatCents } from "@/lib/domain/money";
import type { BackofficeData } from "@/lib/domain/types";
import { cn } from "@/lib/utils";

export function ChargeStatus({ c, today }: { c: ChargeView; today: string }) {
  if (c.paid) return <Badge tone="success">Paid {c.paidOn ? formatDate(c.paidOn, { year: false }) : ""}</Badge>;
  if (c.dueDate < today) return <Badge tone="danger">Unpaid · {daysBetween(c.dueDate, today)}d past due</Badge>;
  return <Badge tone="warning">Unpaid</Badge>;
}

/** One bill/subscription charge. Works as a list row on wide screens and a card on phones. */
export function ChargeRow({
  c,
  data,
  today,
  selectable,
  checked,
  onToggle,
  onEnterAmount,
  onTogglePaid,
}: {
  c: ChargeView;
  data: BackofficeData;
  today: string;
  selectable?: boolean;
  checked?: boolean;
  onToggle?: (on: boolean) => void;
  onEnterAmount?: () => void;
  onTogglePaid?: () => void;
}) {
  const account = data.paymentAccounts.find((a) => a.id === c.accountId);
  const checkId = `chg-${c.key}`;
  return (
    <li className="flex gap-3 p-4">
      <div className="flex w-6 shrink-0 justify-center pt-0.5">
        {selectable && !c.paid ? (
          <>
            <input id={checkId} type="checkbox" className="size-5 accent-slate-900" checked={!!checked} onChange={(e) => onToggle?.(e.target.checked)} />
            <label htmlFor={checkId} className="sr-only">
              Select {c.vendor} due {formatDate(c.dueDate)}
            </label>
          </>
        ) : null}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-3 xl:flex-row xl:items-center">
        <div className="min-w-0 flex-1">
          <p className="font-medium text-slate-900">{c.vendor}</p>
          <p className="text-sm text-slate-600">
            {assignmentLabel(data, c.projectId)} · {account ? accountLabel(account) : "Unknown account"}
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <Badge tone={c.type === "subscription" ? "info" : "neutral"}>{c.type === "subscription" ? "Subscription" : "Bill"}</Badge>
            <ChargeStatus c={c} today={today} />
            {c.autopay ? <Badge>Autopay</Badge> : <Badge>Manual</Badge>}
          </div>
        </div>
        <div className="flex flex-col gap-0.5 xl:w-48 xl:shrink-0 xl:text-right">
          <p className="tabular text-lg font-semibold text-slate-900">
            {formatCents(c.amountCents)}
            {c.isEstimate ? <span className="ml-2 align-middle text-xs font-medium text-amber-800">Estimate</span> : null}
          </p>
          <p className={cn("text-sm", !c.paid && c.dueDate < today ? "font-medium text-red-700" : "text-slate-600")}>Due {formatDate(c.dueDate, { weekday: true })}</p>
        </div>
        {onEnterAmount || onTogglePaid ? (
          <div className="flex flex-wrap gap-2 xl:w-56 xl:shrink-0 xl:justify-end">
            {onEnterAmount ? (
              <Button variant="ghost" size="sm" onClick={onEnterAmount}>
                {c.isEstimate ? "Enter actual" : "Edit amount"}
                <span className="sr-only"> for {c.vendor} due {formatDate(c.dueDate)}</span>
              </Button>
            ) : null}
            {onTogglePaid ? (
              <Button variant="secondary" size="sm" onClick={onTogglePaid}>
                {c.paid ? "Mark unpaid" : "Mark paid"}
                <span className="sr-only"> {c.vendor} due {formatDate(c.dueDate)}</span>
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </li>
  );
}
