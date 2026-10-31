"use client";

import { CreditCard, Landmark, Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/field";
import { EmptyState, ErrorState, LoadingState, PageHeader } from "@/components/ui/states";
import { useNotice } from "@/components/layout/notice";
import { useBackoffice } from "@/lib/data/backoffice-provider";
import { monthKey } from "@/lib/domain/dates";
import { accountLabel, ExpenseValidationError, monthReview, nextChargeDate } from "@/lib/domain/expenses";
import { formatCents } from "@/lib/domain/money";
import type { PaymentAccount } from "@/lib/domain/types";
import { BillsTabs } from "./bills-tabs";

export function AccountsPage() {
  const { state, today } = useBackoffice();
  return (
    <>
      <PageHeader title="Bills & subscriptions" description="Cards and bank accounts that bills are paid from. Only a nickname and, for cards, the last four digits." actions={<AddAccountDialog />} />
      <BillsTabs />
      {state.status === "loading" ? <LoadingState /> : null}
      {state.status === "error" ? <ErrorState message={state.message} /> : null}
      {state.status === "ready" ? (
        state.data.paymentAccounts.length === 0 ? (
          <EmptyState title="No cards or accounts yet" />
        ) : (
          <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {state.data.paymentAccounts.map((a) => {
              const review = monthReview(state.data, monthKey(today), a.id);
              const active = state.data.expenses.filter((e) => e.accountId === a.id && nextChargeDate(e, today)).length;
              const Icon = a.kind === "card" ? CreditCard : Landmark;
              return (
                <li key={a.id}>
                  <Card className="flex h-full flex-col gap-3 p-4">
                    <div className="flex items-center gap-3">
                      <Icon className="size-5 text-slate-500" aria-hidden />
                      <div>
                        <p className="font-medium text-slate-900">{accountLabel(a)}</p>
                        <p className="text-xs text-slate-600">{a.kind === "card" ? "Card" : "Bank account"} · {active} active bill{active === 1 ? "" : "s"}/subscription{active === 1 ? "" : "s"}</p>
                      </div>
                    </div>
                    <dl className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <dt className="text-xs text-slate-500">This month</dt>
                        <dd className="tabular font-medium">{formatCents(review.totalCents)}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-slate-500">Unpaid (incl. carryover)</dt>
                        <dd className={`tabular font-medium ${review.unpaidCents ? "text-amber-800" : ""}`}>{formatCents(review.unpaidCents)}</dd>
                      </div>
                    </dl>
                    <Link
                      href={`/bills?account=${a.id}`}
                      className="mt-auto inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-300 px-3 text-sm font-medium hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-blue-600"
                    >
                      Review this month<span className="sr-only"> for {accountLabel(a)}</span>
                    </Link>
                  </Card>
                </li>
              );
            })}
          </ul>
        )
      ) : null}
    </>
  );
}

function AddAccountDialog() {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="size-4" aria-hidden />
          Add card or account
        </Button>
      </DialogTrigger>
      {open ? (
        <DialogContent title="Add a card or account" description="Never enter a full card number.">
          <AccountForm onDone={() => setOpen(false)} />
        </DialogContent>
      ) : null}
    </Dialog>
  );
}

function AccountForm({ onDone }: { onDone: () => void }) {
  const { mutate } = useBackoffice();
  const notify = useNotice();
  const [kind, setKind] = useState<PaymentAccount["kind"]>("card");
  const [nickname, setNickname] = useState("");
  const [last4, setLast4] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          const a = await mutate((r) => r.addPaymentAccount({ kind, nickname, last4 }));
          notify(`${accountLabel(a)} added.`);
          onDone();
        } catch (err) {
          setErrors(err instanceof ExpenseValidationError ? (err.fields as Record<string, string>) : { form: "Could not save." });
        }
      }}
    >
      <fieldset>
        <legend className="mb-1.5 text-sm font-medium text-slate-800">Type</legend>
        <div className="flex gap-2">
          {(["card", "bank"] as const).map((k) => (
            <label key={k} className="flex min-h-11 flex-1 cursor-pointer items-center gap-2 rounded-lg border border-slate-300 px-3 text-sm has-checked:border-slate-900 has-checked:bg-slate-50">
              <input type="radio" name="acct-kind" checked={kind === k} onChange={() => setKind(k)} className="size-4 accent-slate-900" />
              {k === "card" ? "Card" : "Bank account"}
            </label>
          ))}
        </div>
      </fieldset>
      <Field label="Nickname" htmlFor="acct-nick" error={errors.nickname}>
        <Input id="acct-nick" value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder={kind === "card" ? "e.g. Chase business card" : "e.g. Business checking"} aria-invalid={!!errors.nickname} />
      </Field>
      {kind === "card" ? (
        <Field label="Last four digits (optional)" htmlFor="acct-last4" error={errors.last4}>
          <Input
            id="acct-last4"
            inputMode="numeric"
            autoComplete="off"
            value={last4}
            // Keep digits only, and only the last four — a pasted full number is never kept.
            onChange={(e) => setLast4(e.target.value.replace(/\D/g, "").slice(-4))}
            className="max-w-28"
            aria-invalid={!!errors.last4}
          />
        </Field>
      ) : null}
      {errors.form ? <p className="text-sm text-red-700" role="alert">{errors.form}</p> : null}
      <div className="flex justify-end border-t border-slate-200 pt-4">
        <Button type="submit">Add</Button>
      </div>
    </form>
  );
}
