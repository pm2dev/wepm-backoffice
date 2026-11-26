"use client";

import { useState } from "react";
import { BillsTabs } from "@/components/bills/bills-tabs";
import { Field, Select } from "@/components/ui/field";
import { ErrorState, LoadingState, PageHeader } from "@/components/ui/states";
import { useBackoffice } from "@/lib/data/backoffice-provider";
import { compareDates } from "@/lib/domain/dates";
import { assignmentLabel } from "@/lib/domain/labels";
import { AddProjectExpenseDialog, ProjectExpenseList } from "./project-expenses";

const COMPANY = "company";

/** Every one-off expense: company overhead and project costs. */
export function ExpensesPage() {
  const { state } = useBackoffice();
  const [show, setShow] = useState("all");
  return (
    <>
      <PageHeader
        title="Bills & subscriptions"
        description="One-off purchases for a project or the company. Project expenses count toward the project's cost; billable ones go on its invoice at cost."
        actions={state.status === "ready" ? <AddProjectExpenseDialog data={state.data} /> : null}
      />
      <BillsTabs />
      {state.status === "loading" ? <LoadingState /> : null}
      {state.status === "error" ? <ErrorState message={state.message} /> : null}
      {state.status === "ready" ? (
        <div className="space-y-4">
          <div className="max-w-xs">
            <Field label="Show" htmlFor="ex-filter">
              <Select id="ex-filter" value={show} onChange={(e) => setShow(e.target.value)}>
                <option value="all">All expenses</option>
                <option value={COMPANY}>Company (overhead)</option>
                {state.data.projects.map((p) => (
                  <option key={p.id} value={p.id}>{assignmentLabel(state.data, p.id)}</option>
                ))}
              </Select>
            </Field>
          </div>
          <ProjectExpenseList
            data={state.data}
            showProject={show === "all"}
            emptyText="No expenses here yet."
            expenses={state.data.projectExpenses
              .filter((x) => show === "all" || (show === COMPANY ? x.projectId === null : x.projectId === show))
              .sort((a, b) => compareDates(b.date, a.date) || a.vendor.localeCompare(b.vendor))}
          />
        </div>
      ) : null}
    </>
  );
}
