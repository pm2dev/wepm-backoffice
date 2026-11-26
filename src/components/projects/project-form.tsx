"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { CADENCE_LABEL, FormError, projectTasks, type NewProjectInput } from "@/lib/domain/billing";
import { centsToInput, parseDollars } from "@/lib/domain/money";
import { DomainError } from "@/lib/domain/payroll";
import { PROJECT_STATUS_LABELS, type BackofficeData, type BillingCadence, type Project, type ProjectStatus } from "@/lib/domain/types";

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
  /** New projects can include starting billing rates; edits never change rates (they're dated, managed on the project page). */
  onSubmit: (input: NewProjectInput) => Promise<void>;
}) {
  const [name, setName] = useState(project?.name ?? "");
  const [customerId, setCustomerId] = useState(project ? (project.customerId ?? "") : (defaultCustomerId ?? ""));
  const [billable, setBillable] = useState(project?.billable ?? true);
  const [method, setMethod] = useState<Project["billingMethod"]>(project?.billingMethod ?? "hourly");
  const [hourly, setHourly] = useState("");
  const [ratesFrom, setRatesFrom] = useState("");
  const [cadence, setCadence] = useState<BillingCadence | "">(project?.billingCadence ?? "");
  const [wepmProjectId, setWepm] = useState(project?.wepmProjectId ?? "");
  const [status, setStatus] = useState<ProjectStatus>(project?.status ?? "active");
  const [startDate, setStartDate] = useState(project?.startDate ?? "");
  const [endDate, setEndDate] = useState(project?.endDate ?? "");
  const [budget, setBudget] = useState(project?.budgetCents ? centsToInput(project.budgetCents) : "");
  const [budgetHours, setBudgetHours] = useState(project?.budgetMinutes ? String(project.budgetMinutes / 60) : "");
  const [costBudget, setCostBudget] = useState(project?.costBudgetCents ? centsToInput(project.costBudgetCents) : "");
  const [rows, setRows] = useState<RateRow[]>(() => {
    const tasks = project ? projectTasks(data, project.id) : [];
    const rows = tasks.map((t) => ({ task: t, rate: "" }));
    return rows.length ? rows : [{ task: "Development", rate: "" }, { task: "Meetings", rate: "" }];
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const internal = !customerId;
  const isBillable = billable && !internal;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const local: Record<string, string> = {};
    const initialRates: { task: string | null; rateCents: number }[] = [];
    if (!project && isBillable && method === "hourly" && hourly.trim()) {
      const c = parseDollars(hourly);
      if (c === null || c <= 0) local.hourlyRateCents = "Enter an hourly billing rate greater than $0.";
      else initialRates.push({ task: null, rateCents: c });
    }
    if (!project && isBillable && method === "task") {
      for (const r of rows) {
        if (!r.rate.trim()) continue; // a task without a rate stays visible as "missing" in billing
        const c = parseDollars(r.rate);
        if (c === null || c <= 0) local.rates = `Enter a rate greater than $0 for “${r.task || "task"}”, or leave it blank.`;
        else if (!r.task.trim()) local.rates = "Every rate needs a task name.";
        else initialRates.push({ task: r.task.trim(), rateCents: c });
      }
    }
    const money = (raw: string, key: string, message: string) => {
      if (!raw.trim()) return undefined;
      const c = parseDollars(raw);
      if (c === null || c <= 0) local[key] = message;
      return c ?? undefined;
    };
    const budgetCents = internal ? undefined : money(budget, "budgetCents", "Enter a budget greater than $0, or leave it blank.");
    const costBudgetCents = internal ? money(costBudget, "costBudgetCents", "Enter a cost budget greater than $0, or leave it blank.") : undefined;
    let budgetMinutes: number | undefined;
    if (!internal && budgetHours.trim()) {
      const h = Number(budgetHours);
      if (!Number.isFinite(h) || h <= 0) local.budgetMinutes = "Enter budget hours greater than 0, or leave it blank.";
      else budgetMinutes = Math.round(h * 60);
    }
    if (Object.keys(local).length) return setErrors(local);
    setSaving(true);
    try {
      await onSubmit({
        name,
        customerId: customerId || null,
        billable: isBillable,
        billingMethod: method,
        ...(project ? {} : { initialRates, ratesFrom: ratesFrom || undefined }),
        billingCadence: cadence || undefined,
        wepmProjectId,
        status,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        budgetCents,
        budgetMinutes,
        costBudgetCents,
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
            {project ? (
              <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
                Billing rates have start dates. Add or change them under <strong>Billing rates</strong> on the project page.
                {project.billingMethod !== method ? " Switching the method uses the rates set for the new method; add them there if there are none yet." : ""}
              </p>
            ) : method === "hourly" ? (
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
                {errors.rates ? <p className="text-sm text-red-700" role="alert">{errors.rates}</p> : null}
              </div>
            )}
            {project ? null : (
              <Field label="Rates start (optional)" htmlFor="pf-rates-from" error={errors.ratesFrom} hint="Hours worked on or after this date use these rates. Blank uses the start date, or today.">
                <Input id="pf-rates-from" type="date" value={ratesFrom} onChange={(e) => setRatesFrom(e.target.value)} className="max-w-48" aria-invalid={!!errors.ratesFrom} />
              </Field>
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

      <fieldset className="space-y-4 border-t border-slate-200 pt-4">
        <legend className="text-sm font-semibold text-slate-900">Status and dates</legend>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Status" htmlFor="pf-status" error={errors.status}>
            <Select id="pf-status" value={status} onChange={(e) => setStatus(e.target.value as ProjectStatus)}>
              {Object.entries(PROJECT_STATUS_LABELS).map(([k, l]) => (
                <option key={k} value={k}>{l}</option>
              ))}
            </Select>
          </Field>
          <Field label="Start date (optional)" htmlFor="pf-start" error={errors.startDate}>
            <Input id="pf-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} aria-invalid={!!errors.startDate} />
          </Field>
          <Field label="End date (optional)" htmlFor="pf-end" error={errors.endDate}>
            <Input id="pf-end" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} aria-invalid={!!errors.endDate} />
          </Field>
        </div>
      </fieldset>

      <fieldset className="space-y-4 border-t border-slate-200 pt-4">
        <legend className="text-sm font-semibold text-slate-900">Budget (optional)</legend>
        {internal ? (
          <Field label="Cost budget" htmlFor="pf-cost-budget" error={errors.costBudgetCents} hint="The most you plan to spend on this project over its life: contractor time and expenses.">
            <Input id="pf-cost-budget" inputMode="decimal" autoComplete="off" placeholder="0.00" value={costBudget} onChange={(e) => setCostBudget(e.target.value)} className="max-w-40" aria-invalid={!!errors.costBudgetCents} />
          </Field>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Budget" htmlFor="pf-budget" error={errors.budgetCents} hint="Billable value over the project's life: billable hours × rate, plus billable expenses.">
              <Input id="pf-budget" inputMode="decimal" autoComplete="off" placeholder="0.00" value={budget} onChange={(e) => setBudget(e.target.value)} className="max-w-40" aria-invalid={!!errors.budgetCents} />
            </Field>
            <Field label="Budget hours" htmlFor="pf-budget-hours" error={errors.budgetMinutes} hint="Billable hours over the project's life.">
              <Input id="pf-budget-hours" inputMode="decimal" autoComplete="off" placeholder="0" value={budgetHours} onChange={(e) => setBudgetHours(e.target.value)} className="max-w-40" aria-invalid={!!errors.budgetMinutes} />
            </Field>
          </div>
        )}
      </fieldset>
      {errors.form ? <p className="rounded-lg bg-red-50 p-3 text-sm text-red-800" role="alert">{errors.form}</p> : null}
      <div className="flex justify-end border-t border-slate-200 pt-4">
        <Button type="submit" disabled={saving}>{saving ? "Saving…" : submitLabel}</Button>
      </div>
    </form>
  );
}
