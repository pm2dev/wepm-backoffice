import { Badge } from "@/components/ui/badge";
import { daysBetween, formatDate, formatRange, type ISODate } from "@/lib/domain/dates";
import type { Obligation, ObligationStatus } from "@/lib/domain/payroll";
import type { ObligationKind } from "@/lib/domain/types";

export const KIND_LABEL: Record<ObligationKind, string> = { payroll: "Payroll", bonus: "Bonus", reimbursement: "Reimbursement" };

export function KindBadge({ kind }: { kind: ObligationKind }) {
  return <Badge tone={kind === "payroll" ? "neutral" : kind === "bonus" ? "info" : "sample"}>{KIND_LABEL[kind]}</Badge>;
}

const STATUS: Record<ObligationStatus, { label: string; tone: "info" | "danger" | "success" | "warning" | "neutral" }> = {
  needs_finalization: { label: "Needs finalization", tone: "warning" },
  missing_rate: { label: "Missing rate", tone: "danger" },
  ready: { label: "Ready to pay", tone: "success" },
  partially_paid: { label: "Partially paid", tone: "warning" },
  paid: { label: "Paid", tone: "neutral" },
};

export function StatusBadge({ status }: { status: ObligationStatus }) {
  const s = STATUS[status];
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

export function obligationDescription(o: Obligation): string {
  if (o.kind === "payroll" && o.periodStart && o.periodEnd) return `${o.title} · ${formatRange(o.periodStart, o.periodEnd)}`;
  return o.title;
}

export function dueText(dueDate: ISODate, today: ISODate, settled = false): string {
  const base = `Due ${formatDate(dueDate, { weekday: true })}`;
  if (settled) return base;
  const diff = daysBetween(today, dueDate);
  if (diff < 0) return `${base} · ${-diff} day${diff === -1 ? "" : "s"} overdue`;
  if (diff === 0) return `${base} · today`;
  return `${base} · in ${diff} day${diff === 1 ? "" : "s"}`;
}
