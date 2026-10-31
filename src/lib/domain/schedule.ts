import { addDays, isoWeekday, weekStart, type ISODate } from "./dates";
import type { Contractor } from "./types";

export type PayPeriod = { start: ISODate; end: ISODate; dueDate: ISODate };

/** Pay period containing the work date (weekly: Monday–Sunday). */
export function payPeriodFor(contractor: Contractor, workDate: ISODate): PayPeriod {
  const start = weekStart(workDate);
  const end = addDays(start, 6);
  return { start, end, dueDate: addDays(end, contractor.schedule.payDelayDays) };
}

/** First contractor payday on or after `date`. */
export function nextPayday(contractor: Contractor, date: ISODate): ISODate {
  // Paydays fall on (period Sunday + delay); in a weekly schedule that is a fixed weekday.
  const paydayWeekday = (6 + contractor.schedule.payDelayDays) % 7;
  const offset = (paydayWeekday - isoWeekday(date) + 7) % 7;
  return addDays(date, offset);
}

export function describeSchedule(contractor: Contractor): string {
  const names = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const delay = contractor.schedule.payDelayDays;
  const weekday = names[(6 + delay) % 7];
  if (delay >= 1 && delay <= 7) return `Weekly · paid the following ${weekday}`;
  return `Weekly · paid ${delay} days after the week ends (${weekday})`;
}
