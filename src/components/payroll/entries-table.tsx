import { formatDate } from "@/lib/domain/dates";
import { formatCents, formatHours } from "@/lib/domain/money";
import { rateOn } from "@/lib/domain/rates";
import type { BackofficeData, TimeEntry } from "@/lib/domain/types";

/** Approved time entries contributing to a payroll record. Scrolls horizontally inside its own region on narrow screens. */
export function EntriesTable({ data, entries, contractorId, caption }: { data: BackofficeData; entries: TimeEntry[]; contractorId: string; caption: string }) {
  const projects = new Map(data.projects.map((p) => [p.id, p]));
  return (
    <div role="region" aria-label={caption} tabIndex={0} className="overflow-x-auto rounded-xl border border-slate-200 bg-white focus-visible:outline-2 focus-visible:outline-blue-600">
      <table className="w-full min-w-[40rem] text-left text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
          <tr>
            <th scope="col" className="px-4 py-2 font-medium">Work date</th>
            <th scope="col" className="px-4 py-2 font-medium">Project · task</th>
            <th scope="col" className="px-4 py-2 text-right font-medium">Hours</th>
            <th scope="col" className="px-4 py-2 text-right font-medium">Cost rate</th>
            <th scope="col" className="px-4 py-2 font-medium">Approved</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {entries.map((e) => {
            const p = e.projectId ? projects.get(e.projectId) : undefined;
            const rate = rateOn(data.rates, contractorId, e.workDate);
            return (
              <tr key={e.id}>
                <td className="whitespace-nowrap px-4 py-2.5">{formatDate(e.workDate, { weekday: true, year: false })}</td>
                <td className="px-4 py-2.5">
                  {p ? p.name : (e.sourceProject ?? "Unknown project")}
                  {p?.customerName ? <span className="text-slate-500"> ({p.customerName})</span> : null}
                  {p && !p.billable ? <span className="text-slate-500"> · nonbillable</span> : null}
                  <span className="text-slate-600"> · {e.task}</span>
                </td>
                <td className="tabular px-4 py-2.5 text-right">{formatHours(e.minutes)}</td>
                <td className="tabular whitespace-nowrap px-4 py-2.5 text-right">
                  {rate === null ? <span className="font-medium text-red-700">No rate</span> : `${formatCents(rate)}/h`}
                </td>
                <td className="whitespace-nowrap px-4 py-2.5 text-slate-600">
                  {e.approvedAt ? formatDate(e.approvedAt, { year: false }) : "—"}
                  {e.sourceTimesheetId ? <span className="block text-xs text-slate-500">{e.sourceTimesheetId}</span> : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
