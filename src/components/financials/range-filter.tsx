"use client";

import { useState } from "react";
import { Field, Input, Select } from "@/components/ui/field";
import { isISODate, type ISODate } from "@/lib/domain/dates";
import { presetRange, RANGE_PRESET_LABELS, type DateRange, type RangePreset } from "@/lib/domain/financials";

/** Preset or custom date range state, resolved against today. */
export function useDateRange(initial: RangePreset, today: ISODate) {
  const [preset, setPreset] = useState<RangePreset>(initial);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const range: DateRange | undefined =
    preset === "custom" ? { from: isISODate(from) ? from : undefined, to: isISODate(to) ? to : undefined } : presetRange(preset, today);
  return { preset, setPreset, from, setFrom, to, setTo, range };
}

export function RangeFilter({ id, state }: { id: string; state: ReturnType<typeof useDateRange> }) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="w-44">
        <Field label="Period" htmlFor={`${id}-preset`}>
          <Select id={`${id}-preset`} value={state.preset} onChange={(e) => state.setPreset(e.target.value as RangePreset)}>
            {Object.entries(RANGE_PRESET_LABELS).map(([k, l]) => (
              <option key={k} value={k}>{l}</option>
            ))}
          </Select>
        </Field>
      </div>
      {state.preset === "custom" ? (
        <>
          <div className="w-44">
            <Field label="From" htmlFor={`${id}-from`}>
              <Input id={`${id}-from`} type="date" value={state.from} onChange={(e) => state.setFrom(e.target.value)} />
            </Field>
          </div>
          <div className="w-44">
            <Field label="To" htmlFor={`${id}-to`}>
              <Input id={`${id}-to`} type="date" value={state.to} onChange={(e) => state.setTo(e.target.value)} />
            </Field>
          </div>
        </>
      ) : null}
    </div>
  );
}
