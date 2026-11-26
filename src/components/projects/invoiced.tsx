"use client";

import { EmptyState, ErrorState, LoadingState, PageHeader } from "@/components/ui/states";
import { useBackoffice } from "@/lib/data/backoffice-provider";
import { byNewest, InvoiceDraftList } from "./invoice-draft-card";
import { ProjectsTabs } from "./projects-tabs";

/** Drafts marked invoiced (and linked to QuickBooks), newest first. */
export function InvoicedPage() {
  const { state } = useBackoffice();
  return (
    <>
      <PageHeader title="Projects & billing" description="Invoice drafts you marked invoiced after creating them in QuickBooks. Payment status comes from QuickBooks once linked." />
      <ProjectsTabs />
      {state.status === "loading" ? <LoadingState /> : null}
      {state.status === "error" ? <ErrorState message={state.message} /> : null}
      {state.status === "ready" ? (
        state.data.invoiceDrafts.some((d) => d.status !== "draft") ? (
          <InvoiceDraftList data={state.data} drafts={state.data.invoiceDrafts.filter((d) => d.status !== "draft").sort(byNewest)} emptyText="" />
        ) : (
          <EmptyState title="Nothing marked invoiced yet" />
        )
      ) : null}
    </>
  );
}
