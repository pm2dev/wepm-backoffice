"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/field";
import { useNotice } from "@/components/layout/notice";
import { useBackoffice } from "@/lib/data/backoffice-provider";
import { billingRateHistory, currentBillingRate, FormError, projectTasks } from "@/lib/domain/billing";
import { formatDate, type ISODate } from "@/lib/domain/dates";
import { formatCents, parseDollars } from "@/lib/domain/money";
import { DomainError } from "@/lib/domain/payroll";
import type { BackofficeData, BillingRate, Project } from "@/lib/domain/types";

/** Short label for a project's billing: its current rate, or how many task rates it has. */
export function billingLabel(data: BackofficeData, p: Project, today: ISODate) {
  if (!p.customerId) return "Internal";
  if (!p.billable) return "Nonbillable";
  if (p.billingMethod === "hourly") {
    const rate = currentBillingRate(data, p, null, today);
    return rate ? `${formatCents(rate)}/h` : "No hourly rate";
  }
  const tasks = new Set(data.billingRates.filter((r) => r.projectId === p.id && r.task !== null).map((r) => r.task));
  return `Rates by task (${tasks.size})`;
}

/** Current billing rates and their history, newest first, for one project. */
export function BillingRatesCard({ data, project: p }: { data: BackofficeData; project: Project }) {
  const { today, mutate } = useBackoffice();
  const notify = useNotice();
  const history = billingRateHistory(data, p.id);
  const groups: { task: string | null; rates: BillingRate[] }[] =
    p.billingMethod === "hourly"
      ? [{ task: null, rates: history }]
      : projectTasks(data, p.id).map((task) => ({ task, rates: history.filter((r) => r.task === task) }));

  async function remove(r: BillingRate) {
    try {
      await mutate((repo) => repo.removeBillingRate(r.id));
      notify(`Removed the ${formatCents(r.rateCents)}/h rate from ${formatDate(r.effectiveDate)}.`);
    } catch (err) {
      notify(err instanceof DomainError ? err.message : "Could not remove the rate. Nothing was changed.");
    }
  }

  if (!p.billable || !p.customerId) {
    return (
      <Card className="p-4 text-sm">
        <p className="text-slate-600">Not billed.</p>
      </Card>
    );
  }

  return (
    <Card className="p-4 text-sm">
      {groups.length === 0 ? <p className="text-slate-600">No tasks yet. Add a rate for a task, or wait for hours from wepm.app.</p> : null}
      <ul className="divide-y divide-slate-200">
        {groups.map(({ task, rates }) => {
          const current = currentBillingRate(data, p, task, today);
          return (
            <li key={task ?? "hourly"} className="py-2 first:pt-0 last:pb-0">
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-medium text-slate-900">{task ?? "Every task"}</span>
                <span className="tabular font-semibold">{current ? `${formatCents(current)}/h` : <span className="text-red-700">{rates.length ? "Not yet in effect" : "No rate"}</span>}</span>
              </div>
              {rates.length ? (
                <ul className="mt-1 space-y-0.5" aria-label={`${task ?? "Hourly"} rate history`}>
                  {rates.map((r) => (
                    <li key={r.id} className="flex items-center justify-between gap-2 text-xs text-slate-600">
                      <span>
                        <span className="tabular">{formatCents(r.rateCents)}/h</span> from {formatDate(r.effectiveDate, { year: true })}
                        {r.effectiveDate > today ? " (upcoming)" : ""}
                      </span>
                      <Button variant="ghost" size="sm" aria-label={`Remove ${formatCents(r.rateCents)}/h from ${formatDate(r.effectiveDate, { year: true })}`} onClick={() => remove(r)}>
                        <Trash2 className="size-4" aria-hidden />
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          );
        })}
      </ul>
      <div className="mt-3 border-t border-slate-200 pt-3">
        <AddBillingRateDialog data={data} project={p} />
      </div>
      <p className="mt-3 text-xs text-slate-500">Hours use the rate in effect on the day they were worked. Invoiced amounts keep the rate they were billed at. Independent of contractor pay.</p>
    </Card>
  );
}

function AddBillingRateDialog({ data, project }: { data: BackofficeData; project: Project }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary" size="sm">
          <Plus className="size-4" aria-hidden />
          Add rate change
        </Button>
      </DialogTrigger>
      {open ? (
        <DialogContent title="Add a billing rate" description={`What ${project.name} bills per hour from a date.`}>
          <RateForm data={data} project={project} onDone={() => setOpen(false)} />
        </DialogContent>
      ) : null}
    </Dialog>
  );
}

const NEW_TASK = "\u0000new";

function RateForm({ data, project, onDone }: { data: BackofficeData; project: Project; onDone: () => void }) {
  const { today, mutate } = useBackoffice();
  const notify = useNotice();
  const tasks = projectTasks(data, project.id);
  const byTask = project.billingMethod === "task";
  const [task, setTask] = useState(tasks[0] ?? NEW_TASK);
  const [newTask, setNewTask] = useState("");
  const [effectiveDate, setEffectiveDate] = useState(today);
  const [rate, setRate] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const cents = parseDollars(rate);
    if (cents === null || cents <= 0) return setErrors({ rateCents: "Enter a rate greater than $0." });
    const taskName = byTask ? (task === NEW_TASK ? newTask : task) : null;
    setSaving(true);
    try {
      await mutate((r) => r.addBillingRate({ projectId: project.id, task: taskName, effectiveDate, rateCents: cents }));
      notify(`${taskName ?? project.name} bills ${formatCents(cents)}/h from ${formatDate(effectiveDate)}.`);
      onDone();
    } catch (err) {
      setErrors(err instanceof FormError ? err.fields : { form: err instanceof DomainError ? err.message : "Could not save. Nothing was changed." });
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      {byTask ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Task" htmlFor="br-task" error={task === NEW_TASK ? undefined : errors.task}>
            <Select id="br-task" value={task} onChange={(e) => setTask(e.target.value)}>
              {tasks.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
              <option value={NEW_TASK}>Another task…</option>
            </Select>
          </Field>
          {task === NEW_TASK ? (
            <Field label="Task name" htmlFor="br-new-task" error={errors.task} hint="Must match the task name in wepm.app.">
              <Input id="br-new-task" value={newTask} onChange={(e) => setNewTask(e.target.value)} autoComplete="off" aria-invalid={!!errors.task} />
            </Field>
          ) : null}
        </div>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Effective date" htmlFor="br-date" error={errors.effectiveDate} hint="Applies to hours worked on or after this date.">
          <Input id="br-date" type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} aria-invalid={!!errors.effectiveDate} />
        </Field>
        <Field label="Hourly billing rate" htmlFor="br-rate" error={errors.rateCents}>
          <Input id="br-rate" inputMode="decimal" autoComplete="off" placeholder="0.00" value={rate} onChange={(e) => setRate(e.target.value)} aria-invalid={!!errors.rateCents} />
        </Field>
      </div>
      <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700">Hours not yet invoiced from this date are recalculated. Invoiced amounts don&apos;t change.</p>
      {errors.form ? <p className="rounded-lg bg-red-50 p-3 text-sm text-red-800" role="alert">{errors.form}</p> : null}
      <div className="flex justify-end border-t border-slate-200 pt-4">
        <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Add rate"}</Button>
      </div>
    </form>
  );
}
