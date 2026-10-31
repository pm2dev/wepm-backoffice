"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { CADENCE_LABEL, FormError, projectTasks, type ProjectInput } from "@/lib/domain/billing";
import { centsToInput, parseDollars } from "@/lib/domain/money";
import { DomainError } from "@/lib/domain/payroll";
import type { BackofficeData, BillingCadence, Project } from "@/lib/domain/types";

type RateRow = { task: string; rate: string };

export function ProjectForm({
  data,
  project,
  defaultCustomerId,
  submitLabel,
  onSubmit,
}: {
  data: BackofficeData;
  project?: Project;
  defaultCustomerId?: string;
  submitLabel: string;
  onSubmit: (input: ProjectInput) => Promise<void>;
}) {
  const [name, setName] = useState(project?.name ?? "");
  const [customerId, setCustomerId] = useState(project ? (project.customerId ?? "") : (defaultCustomerId ?? ""));
  const [billable, setBillable] = useState(project?.billable ?? true);
  const [method, setMethod] = useState<Project["billingMethod"]>(project?.billingMethod ?? "hourly");
  const [hourly, setHourly] = useState(project?.hourlyRateCents ? centsToInput(project.hourlyRateCents) : "");
  const [cadence, setCadence] = useState<BillingCadence | "">(project?.billingCadence ?? "");
  const [wepmProjectId, setWepm] = useState(project?.wepmProjectId ?? "");
  const [active, setActive] = useState(project?.active ?? true);
  const [rows, setRows] = useState<RateRow[]>(() => {
    const tasks = project ? projectTasks(data, project.id) : [];
    const rows = tasks.map((t) => ({ task: t, rate: project?.taskRates[t] ? centsToInput(project.taskRates[t]) : "" }));
    return rows.length ? rows : [{ task: "Development", rate: "" }, { task: "Meetings", rate: "" }];
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const internal = !customerId;
  const isBillable = billable && !internal;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const local: Record<string, string> = {};
    let hourlyRateCents: number | undefined;
    if (isBillable && method === "hourly" && hourly.trim()) {
      const c = parseDollars(hourly);
      if (c === null || c <= 0) local.hourlyRateCents = "Enter an hourly billing rate greater than $0.";
      else hourlyRateCents = c;
    }
    const taskRates: Record<string, number> = {};
    if (isBillable && method === "task") {
      for (const r of rows) {
        if (!r.task.trim() && !r.rate.trim()) continue;
        if (!r.rate.trim()) continue; // a task without a rate stays visible as "missing" in billing
        const c = parseDollars(r.rate);
        if (c === null || c <= 0) local.taskRates = `Enter a rate greater than $0 for “${r.task || "task"}”, or leave it blank.`;
        else if (!r.task.trim()) local.taskRates = "Every rate needs a task name.";
        else taskRates[r.task.trim()] = c;
      }
    }
    if (Object.keys(local).length) return setErrors(local);
    setSaving(true);
    try {
      await onSubmit({
        name,
        customerId: customerId || null,
        billable: isBillable,
        billingMethod: method,
        hourlyRateCents: isBillable && method === "hourly" ? hourlyRateCents : project?.hourlyRateCents,
        taskRates: isBillable && method === "task" ? taskRates : (project?.taskRates ?? {}),
        billingCadence: cadence || undefined,
        wepmProjectId,
        active,
      });
    } catch (err) {
      setErrors(err instanceof FormError ? err.fields : { form: err instanceof DomainError ? err.message : "Could not save. Nothing was changed." });
      setSaving(false);
    }
  }

  const customer = data.customers.find((c) => c.id === customerId);

  return (
    <form noValidate onSubmit={submit} className="space-y-5">
      <Field label="Project name" htmlFor="pf-name" error={errors.name}>
        <Input id="pf-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" aria-invalid={!!errors.name} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Customer" htmlFor="pf-customer" error={errors.customerId}>
          <Select id="pf-customer" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
            <option value="">Internal (no customer)</option>
            {data.customers.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
        </Field>
        <Field label="wepm.app project ID (optional)" htmlFor="pf-wepm" error={errors.wepmProjectId} hint="Approved hours are matched by this ID, never by name.">
          <Input id="pf-wepm" value={wepmProjectId} onChange={(e) => setWepm(e.target.value)} autoComplete="off" spellCheck={false} aria-invalid={!!errors.wepmProjectId} />
        </Field>
      </div>

      <fieldset className="space-y-4 border-t border-slate-200 pt-4">
        <legend className="text-sm font-semibold text-slate-900">Billing</legend>
        <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm">
          <input type="checkbox" className="mt-0.5 size-5 accent-slate-900 disabled:opacity-40" checked={isBillable} disabled={internal} onChange={(e) => setBillable(e.target.checked)} />
          <span>
            <span className="font-medium text-slate-900">Billable to the customer</span>
            <span className="block text-slate-600">{internal ? "Internal projects are never billed." : "Nonbillable time is still paid to contractors."}</span>
          </span>
        </label>
        {errors.billable ? <p className="text-sm text-red-700" role="alert">{errors.billable}</p> : null}

        {isBillable ? (
          <>
            <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Billing method">
              {(
                [
                  ["hourly", "One hourly rate", "Every task bills the same"],
                  ["task", "Rates by task", "e.g. meetings vs. development"],
                ] as const
              ).map(([k, label, help]) => (
                <label key={k} className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border border-slate-300 p-3 text-sm has-checked:border-slate-900 has-checked:bg-slate-50">
                  <input type="radio" name="pf-method" checked={method === k} onChange={() => setMethod(k)} className="mt-0.5 size-4 accent-slate-900" />
                  <span>
                    <span className="block font-medium text-slate-900">{label}</span>
                    <span className="text-slate-600">{help}</span>
                  </span>
                </label>
              ))}
            </div>
            {method === "hourly" ? (
              <Field label="Hourly billing rate" htmlFor="pf-hourly" error={errors.hourlyRateCents} hint="Independent of what contractors are paid.">
                <Input id="pf-hourly" inputMode="decimal" autoComplete="off" placeholder="0.00" value={hourly} onChange={(e) => setHourly(e.target.value)} className="max-w-40" aria-invalid={!!errors.hourlyRateCents} />
              </Field>
            ) : (
              <div className="space-y-2">
                <p className="text-sm font-medium text-slate-800">Task billing rates</p>
                <p className="text-xs text-slate-600">Task names must match wepm.app tasks. A task left without a rate shows as missing in billing.</p>
                <ul className="space-y-2">
                  {rows.map((r, i) => (
                    <li key={i} className="flex items-end gap-2">
                      <div className="flex-1">
                        <label htmlFor={`pf-task-${i}`} className="sr-only">Task {i + 1}</label>
                        <Input id={`pf-task-${i}`} value={r.task} placeholder="Task" onChange={(e) => setRows((x) => x.map((y, j) => (j === i ? { ...y, task: e.target.value } : y)))} />
                      </div>
                      <div className="w-28">
                        <label htmlFor={`pf-rate-${i}`} className="sr-only">Rate for {r.task || `task ${i + 1}`}</label>
                        <Input id={`pf-rate-${i}`} inputMode="decimal" autoComplete="off" placeholder="$/h" value={r.rate} onChange={(e) => setRows((x) => x.map((y, j) => (j === i ? { ...y, rate: e.target.value } : y)))} />
                      </div>
                      <Button variant="ghost" size="sm" aria-label={`Remove ${r.task || `task ${i + 1}`}`} onClick={() => setRows((x) => x.filter((_, j) => j !== i))}>
                        <Trash2 className="size-4" aria-hidden />
                      </Button>
                    </li>
                  ))}
                </ul>
                <Button variant="ghost" size="sm" onClick={() => setRows((x) => [...x, { task: "", rate: "" }])}>
                  <Plus className="size-4" aria-hidden /> Add task
                </Button>
                {errors.taskRates ? <p className="text-sm text-red-700" role="alert">{errors.taskRates}</p> : null}
              </div>
            )}
            <Field label="Billing cadence" htmlFor="pf-cadence" hint={customer ? `Blank uses ${customer.name}'s default (${CADENCE_LABEL[customer.billingCadence].toLowerCase()}).` : undefined}>
              <Select id="pf-cadence" value={cadence} onChange={(e) => setCadence(e.target.value as BillingCadence | "")}>
                <option value="">Customer default</option>
                {Object.entries(CADENCE_LABEL).map(([k, l]) => (
                  <option key={k} value={k}>{l}</option>
                ))}
              </Select>
            </Field>
          </>
        ) : null}
      </fieldset>

      {project ? (
        <label className="flex min-h-11 cursor-pointer items-center gap-3 border-t border-slate-200 pt-4 text-sm">
          <input type="checkbox" className="size-5 accent-slate-900" checked={active} onChange={(e) => setActive(e.target.checked)} />
          Active project
        </label>
      ) : null}
      {errors.form ? <p className="rounded-lg bg-red-50 p-3 text-sm text-red-800" role="alert">{errors.form}</p> : null}
      <div className="flex justify-end border-t border-slate-200 pt-4">
        <Button type="submit" disabled={saving}>{saving ? "Saving…" : submitLabel}</Button>
      </div>
    </form>
  );
}
