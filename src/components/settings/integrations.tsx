"use client";

import { Check, Copy, PlugZap } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/field";
import { ErrorState, LoadingState, PageHeader } from "@/components/ui/states";
import { useNotice } from "@/components/layout/notice";
import { useBackoffice } from "@/lib/data/backoffice-provider";
import { formatDate } from "@/lib/domain/dates";
import { DomainError } from "@/lib/domain/payroll";
import type { BackofficeData } from "@/lib/domain/types";
import { parseQboWebhook, planQboFetches, QboWebhookError, type QboFetchPlan } from "@/lib/integrations/quickbooks-webhooks";
import { routes } from "@/lib/routes";

/** Planned production endpoints (Phase 5) that Slashbin forwards to. */
const PRODUCTION_ORIGIN = "https://wepmlabs.com";
const DESTINATIONS = [
  { source: "QuickBooks Online", what: "Invoice and payment change notices", path: "/api/integrations/quickbooks" },
  { source: "wepm.app", what: "Approved timesheets", path: "/api/integrations/wepm" },
];

export function IntegrationsPage() {
  const { state } = useBackoffice();
  return (
    <>
      <PageHeader title="Settings" description="Business and integration configuration." />
      {state.status === "loading" ? <LoadingState /> : null}
      {state.status === "error" ? <ErrorState message={state.message} /> : null}
      {state.status === "ready" ? <Integrations data={state.data} /> : null}
    </>
  );
}

function Status({ connected }: { connected: boolean }) {
  return connected ? <Badge tone="success">Connected</Badge> : <Badge tone="warning">Not connected</Badge>;
}

function Integrations({ data }: { data: BackofficeData }) {
  const lastQb = data.quickbooksInvoices.map((i) => i.lastSyncedOn).sort().at(-1);
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Integrations</h2>
        <p className="mt-1 text-sm text-slate-600">
          Data comes in through Slashbin, a webhook gateway: wepm.app and QuickBooks send webhooks to Slashbin, and Slashbin forwards them to Backoffice.
        </p>
      </div>

      <Card className="flex gap-3 border-violet-200 bg-violet-50 p-4 text-sm text-violet-950">
        <PlugZap className="size-5 shrink-0 text-violet-700" aria-hidden />
        <p>
          This preview has no server, so nothing can actually connect yet. Connections go live when Backoffice is deployed to production with its webhook endpoints and a sign-in.
          Secrets (signing keys, QuickBooks tokens) will be stored on the server and never shown on this page.
        </p>
      </Card>

      <Card className="p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="font-semibold text-slate-900">Slashbin</h3>
            <p className="text-sm text-slate-600">Webhook gateway — receives, retries and forwards webhooks.</p>
          </div>
          <Status connected={false} />
        </div>
        <p className="mt-4 text-sm font-medium text-slate-800">Destinations to add in Slashbin</p>
        <ul className="mt-2 divide-y divide-slate-200 rounded-lg border border-slate-200">
          {DESTINATIONS.map((d) => (
            <li key={d.path} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-900">{d.source}</p>
                <p className="text-xs text-slate-600">{d.what}</p>
                <code className="mt-1 block break-all text-xs text-slate-800">{PRODUCTION_ORIGIN + d.path}</code>
              </div>
              <CopyButton value={PRODUCTION_ORIGIN + d.path} label={`${d.source} destination URL`} />
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-slate-500">Planned addresses — they start accepting deliveries after production setup. Forward the original body and headers unchanged so the QuickBooks signature can be checked.</p>
      </Card>

      <QuickBooksCard data={data} lastSynced={lastQb} />

      <Card className="p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="font-semibold text-slate-900">wepm.app</h3>
            <p className="text-sm text-slate-600">Approved timesheets for payroll and billing, via Slashbin.</p>
          </div>
          <Status connected={false} />
        </div>
        <p className="mt-3 text-sm text-slate-700">
          Contractors and projects are matched by their wepm.app IDs, set on each{" "}
          <Link href={routes.contractors} className="text-blue-700 underline underline-offset-2">contractor</Link> and{" "}
          <Link href={routes.projectList} className="text-blue-700 underline underline-offset-2">project</Link>.
          {data.timeExceptions.length ? (
            <>
              {" "}
              <Link href={routes.payroll} className="font-medium text-amber-800 underline underline-offset-2">
                {data.timeExceptions.length} held-back entr{data.timeExceptions.length === 1 ? "y needs" : "ies need"} mapping
              </Link>
              .
            </>
          ) : null}
        </p>
      </Card>

      <WebhookTester realmId={data.integrations.quickbooksRealmId} />
    </div>
  );
}

function QuickBooksCard({ data, lastSynced }: { data: BackofficeData; lastSynced?: string }) {
  const { mutate } = useBackoffice();
  const notify = useNotice();
  const [realmId, setRealmId] = useState(data.integrations.quickbooksRealmId ?? "");
  const [error, setError] = useState<string | null>(null);
  return (
    <Card className="p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold text-slate-900">QuickBooks Online</h3>
          <p className="text-sm text-slate-600">Source of truth for invoices and customer payments.</p>
        </div>
        <Status connected={false} />
      </div>
      <p className="mt-3 text-sm text-slate-700">
        QuickBooks webhooks only say <em>which</em> invoice or payment changed. Backoffice then needs read-only access to look up the details.
      </p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <Button disabled aria-describedby="qb-connect-why">Connect QuickBooks (read-only)</Button>
        <p id="qb-connect-why" className="text-xs text-slate-500">Available once the production server is set up.</p>
      </div>
      <form
        noValidate
        className="mt-5 flex flex-col gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:items-end"
        onSubmit={async (e) => {
          e.preventDefault();
          setError(null);
          try {
            await mutate((r) => r.setQuickBooksRealmId(realmId));
            notify(realmId.trim() ? "QuickBooks company ID saved." : "QuickBooks company ID cleared.");
          } catch (err) {
            setError(err instanceof DomainError ? err.message : "Could not save.");
          }
        }}
      >
        <div className="sm:w-80">
          <Field label="QuickBooks company ID (realm ID)" htmlFor="qb-realm" error={error ?? undefined} hint="Webhooks for any other QuickBooks company are ignored.">
            <Input id="qb-realm" inputMode="numeric" autoComplete="off" value={realmId} onChange={(e) => setRealmId(e.target.value)} aria-invalid={!!error} />
          </Field>
        </div>
        <Button type="submit" variant="secondary">Save</Button>
      </form>
      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-xs text-slate-500">Records used</dt>
          <dd>Invoices, payments</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">Last data received</dt>
          <dd>{lastSynced ? `${formatDate(lastSynced)} (sample)` : "Never"}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">Invoices / payments</dt>
          <dd>
            <Link href={routes.invoices} className="text-blue-700 underline underline-offset-2">{data.quickbooksInvoices.length} / {data.invoiceReceipts.length}</Link>
          </dd>
        </div>
      </dl>
    </Card>
  );
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="secondary"
      size="sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          window.prompt("Copy this address:", value);
        }
      }}
    >
      {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
      <span aria-live="polite">{copied ? "Copied" : "Copy"}</span>
      <span className="sr-only"> {label}</span>
    </Button>
  );
}

const EXAMPLE = (realmId: string) =>
  JSON.stringify(
    {
      eventNotifications: [
        {
          realmId,
          dataChangeEvent: {
            entities: [
              { name: "Payment", id: "5540", operation: "Create", lastUpdated: "2026-10-31T15:04:05.000Z" },
              { name: "Invoice", id: "1031", operation: "Update", lastUpdated: "2026-10-31T15:04:06.000Z" },
              { name: "Invoice", id: "1031", operation: "Update", lastUpdated: "2026-10-31T15:04:06.000Z" },
              { name: "Customer", id: "58", operation: "Update", lastUpdated: "2026-10-31T15:04:07.000Z" },
            ],
          },
        },
      ],
    },
    null,
    2,
  );

function WebhookTester({ realmId }: { realmId?: string }) {
  const [text, setText] = useState("");
  const [result, setResult] = useState<{ plan: QboFetchPlan; total: number } | { error: string } | null>(null);
  const effectiveRealm = realmId ?? "9130350000000000";

  function check() {
    try {
      const events = parseQboWebhook(JSON.parse(text));
      setResult({ plan: planQboFetches(events, effectiveRealm), total: events.length });
    } catch (e) {
      setResult({ error: e instanceof QboWebhookError ? e.message : e instanceof SyntaxError ? "That isn't valid JSON." : "Couldn't read that webhook." });
    }
  }

  return (
    <Card className="p-4 sm:p-5">
      <h3 className="font-semibold text-slate-900">Test a QuickBooks webhook</h3>
      <p className="mt-1 text-sm text-slate-600">
        Paste a webhook body (for example from Slashbin&rsquo;s delivery log) to see what Backoffice would do with it. Nothing is saved or fetched.
        {realmId ? null : " No company ID is saved, so the example company ID is used."}
      </p>
      <div className="mt-3 space-y-3">
        <Field label="Webhook body (JSON)" htmlFor="wh-body">
          <Textarea id="wh-body" rows={8} spellCheck={false} className="font-mono text-xs sm:text-xs" value={text} onChange={(e) => setText(e.target.value)} />
        </Field>
        <div className="flex flex-wrap gap-2">
          <Button onClick={check} disabled={!text.trim()}>Check webhook</Button>
          <Button variant="ghost" onClick={() => { setText(EXAMPLE(effectiveRealm)); setResult(null); }}>Insert example</Button>
        </div>
        <div aria-live="polite">
          {result && "error" in result ? <p className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{result.error}</p> : null}
          {result && "plan" in result ? (
            <div className="space-y-3 rounded-lg bg-slate-50 p-3 text-sm">
              <p>
                <strong>{result.total}</strong> change notice{result.total === 1 ? "" : "s"} →{" "}
                <strong>{result.plan.fetch.length}</strong> lookup{result.plan.fetch.length === 1 ? "" : "s"}, <strong>{result.plan.deleted.length}</strong> deletion{result.plan.deleted.length === 1 ? "" : "s"},{" "}
                <strong>{result.plan.ignored.length}</strong> ignored. Duplicates collapse to one lookup.
              </p>
              {result.plan.fetch.length ? (
                <div>
                  <p className="font-medium">Would look up in QuickBooks</p>
                  <ul className="list-disc pl-5">
                    {result.plan.fetch.map((f) => (
                      <li key={`${f.entity}${f.id}`}>{f.entity} {f.id} <span className="text-slate-500">(changed {f.lastUpdated})</span></li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {result.plan.deleted.length ? (
                <div>
                  <p className="font-medium">Would remove</p>
                  <ul className="list-disc pl-5">{result.plan.deleted.map((d) => <li key={`${d.entity}${d.id}`}>{d.entity} {d.id}</li>)}</ul>
                </div>
              ) : null}
              {result.plan.ignored.length ? (
                <div>
                  <p className="font-medium">Ignored</p>
                  <ul className="list-disc pl-5">
                    {result.plan.ignored.map((e, i) => (
                      <li key={i}>
                        {e.entity} {e.id} — {e.realmId !== effectiveRealm ? "a different QuickBooks company" : "not used by Backoffice"}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
