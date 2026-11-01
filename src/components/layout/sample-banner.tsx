"use client";

import { FlaskConical } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/field";
import { useBackoffice } from "@/lib/data/backoffice-provider";
import { SAMPLE_BUSINESS_DATE } from "@/lib/data/sample-fixtures";
import { formatDate, isISODate, localToday } from "@/lib/domain/dates";
import { useNotice } from "./notice";

/**
 * Always-visible label that the app is showing sample data with
 * disconnected integrations, plus demo-only controls (clock, reset).
 */
export function SampleBanner() {
  const { repo, today, clockOverride, setClockOverride, mutate } = useBackoffice();
  const notify = useNotice();
  const [draftDate, setDraftDate] = useState(clockOverride ?? today);
  if (repo.mode !== "sample" || !today) return null;

  return (
    <div className="border-b border-violet-200 bg-violet-50 px-4 py-2 text-sm text-violet-900">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-1">
        <span className="inline-flex items-center gap-1.5 font-medium">
          <FlaskConical className="size-4" aria-hidden />
          Prototype · sample data
        </span>
        <span className="text-violet-800">wepm.app and QuickBooks are not connected.</span>
        <span className="text-violet-800">
          Business date: <strong>{formatDate(today, { weekday: true })}</strong>
          {clockOverride ? " (demo clock)" : ""}
        </span>
        <Dialog onOpenChange={(open) => open && setDraftDate(clockOverride ?? today)}>
          <DialogTrigger asChild>
            <Button variant="ghost" size="sm" className="-my-1 text-violet-900 underline underline-offset-2 hover:bg-violet-100">
              Demo controls
            </Button>
          </DialogTrigger>
          <DialogContent title="Demo controls" description="These controls only affect the sample data stored in this browser.">
            <div className="space-y-6">
              <form
                className="space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!isISODate(draftDate)) return;
                  setClockOverride(draftDate === localToday() ? null : draftDate);
                  notify(`Business date set to ${formatDate(draftDate)}.`);
                }}
              >
                <Field label="Business date" htmlFor="demo-date" hint="Used for due/overdue status and payment defaults.">
                  <Input id="demo-date" type="date" value={draftDate} onChange={(e) => setDraftDate(e.target.value)} required />
                </Field>
                <div className="flex flex-wrap gap-2">
                  <Button type="submit">Set date</Button>
                  <Button variant="secondary" onClick={() => setDraftDate(SAMPLE_BUSINESS_DATE)}>
                    Use sample date ({formatDate(SAMPLE_BUSINESS_DATE, { year: false })})
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setClockOverride(null);
                      setDraftDate(localToday());
                      notify("Using the device date.");
                    }}
                  >
                    Use device date
                  </Button>
                </div>
              </form>
              <div className="space-y-2 border-t border-slate-200 pt-4">
                <p className="text-sm font-medium text-slate-900">Reset sample data</p>
                <p className="text-sm text-slate-600">
                  Discards finalizations, payments, and bonuses you added in this browser and restores the original sample set. Real data is never stored here.
                </p>
                <DialogClose asChild>
                  <Button
                    variant="danger"
                    onClick={async () => {
                      await mutate((r) => r.resetDemo!());
                      notify("Sample data reset.");
                    }}
                  >
                    Reset sample data
                  </Button>
                </DialogClose>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
