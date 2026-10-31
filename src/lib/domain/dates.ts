/**
 * Date-only helpers. Business dates are plain `YYYY-MM-DD` strings so that
 * work dates, due dates and payment dates never shift with time zones.
 * All arithmetic is done in UTC on those calendar values.
 */
export type ISODate = string;

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isISODate(value: string): value is ISODate {
  const m = ISO_RE.exec(value);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}

function toUTC(date: ISODate): Date {
  const m = ISO_RE.exec(date);
  if (!m) throw new Error(`Invalid date: ${date}`);
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
}

function fromUTC(d: Date): ISODate {
  return d.toISOString().slice(0, 10);
}

export function addDays(date: ISODate, days: number): ISODate {
  const d = toUTC(date);
  d.setUTCDate(d.getUTCDate() + days);
  return fromUTC(d);
}

/** 0 = Monday … 6 = Sunday */
export function isoWeekday(date: ISODate): number {
  return (toUTC(date).getUTCDay() + 6) % 7;
}

/** Monday of the Monday–Sunday week containing `date`. */
export function weekStart(date: ISODate): ISODate {
  return addDays(date, -isoWeekday(date));
}

export function daysBetween(from: ISODate, to: ISODate): number {
  return Math.round((toUTC(to).getTime() - toUTC(from).getTime()) / 86_400_000);
}

export function compareDates(a: ISODate, b: ISODate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function maxDate(a: ISODate, b: ISODate): ISODate {
  return a >= b ? a : b;
}

/** The local calendar date on the device, as an ISODate. */
export function localToday(now: Date = new Date()): ISODate {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function formatDate(date: ISODate, opts: { weekday?: boolean; year?: boolean } = {}): string {
  const d = toUTC(date);
  const base = `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
  const withYear = opts.year === false ? base : `${base}, ${d.getUTCFullYear()}`;
  return opts.weekday ? `${WEEKDAYS[isoWeekday(date)]}, ${withYear}` : withYear;
}

export function formatRange(start: ISODate, end: ISODate): string {
  if (start === end) return formatDate(start);
  const s = toUTC(start);
  const e = toUTC(end);
  if (s.getUTCFullYear() !== e.getUTCFullYear()) {
    return `${formatDate(start)} – ${formatDate(end)}`;
  }
  if (s.getUTCMonth() === e.getUTCMonth()) {
    return `${MONTHS[s.getUTCMonth()]} ${s.getUTCDate()}–${e.getUTCDate()}, ${e.getUTCFullYear()}`;
  }
  return `${formatDate(start, { year: false })} – ${formatDate(end)}`;
}

// ---------------------------------------------------------------------------
// Months
// ---------------------------------------------------------------------------

/** "YYYY-MM" */
export type MonthKey = string;

export function monthKey(date: ISODate): MonthKey {
  return date.slice(0, 7);
}

export function daysInMonth(year: number, month1: number): number {
  return new Date(Date.UTC(year, month1, 0)).getUTCDate();
}

export function monthStart(month: MonthKey): ISODate {
  return `${month}-01`;
}

export function monthEnd(month: MonthKey): ISODate {
  const [y, m] = month.split("-").map(Number);
  return `${month}-${String(daysInMonth(y, m)).padStart(2, "0")}`;
}

export function addMonthsToKey(month: MonthKey, n: number): MonthKey {
  const [y, m] = month.split("-").map(Number);
  const total = y * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

/**
 * The anchor date moved by n months, keeping the anchor's day of month and
 * clamping to the month's last day (Jan 31 → Feb 28 → Mar 31).
 */
export function addMonthsClamped(anchor: ISODate, n: number): ISODate {
  const target = addMonthsToKey(monthKey(anchor), n);
  const [y, m] = target.split("-").map(Number);
  const day = Math.min(Number(anchor.slice(8, 10)), daysInMonth(y, m));
  return `${target}-${String(day).padStart(2, "0")}`;
}

export function formatMonth(month: MonthKey): string {
  const [y, m] = month.split("-").map(Number);
  return `${["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][m - 1]} ${y}`;
}
