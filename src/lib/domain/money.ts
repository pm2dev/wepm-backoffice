/**
 * Money is stored as integer cents (USD). Never store binary floating-point
 * dollar totals.
 */
export type Cents = number;

export function assertCents(value: number): Cents {
  if (!Number.isSafeInteger(value)) throw new Error(`Money must be integer cents, got ${value}`);
  return value;
}

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export function formatCents(cents: Cents): string {
  return usd.format(cents / 100);
}

/**
 * Parse user-entered dollars ("1,234.5", "$50") into cents without float
 * rounding surprises. Returns null when the input is not a valid amount.
 */
export function parseDollars(input: string): Cents | null {
  const cleaned = input.trim().replace(/[$,\s]/g, "");
  const m = /^(\d+)(?:\.(\d{0,2}))?$/.exec(cleaned);
  if (!m) return null;
  const whole = parseInt(m[1], 10);
  const frac = (m[2] ?? "").padEnd(2, "0");
  return whole * 100 + parseInt(frac || "0", 10);
}

export function centsToInput(cents: Cents): string {
  return (cents / 100).toFixed(2);
}

/**
 * Hours-to-money rounding rule (explicit and shared everywhere):
 * pay = round_half_up(minutes × hourly rate cents ÷ 60), applied once per
 * rate segment of a payroll record — not per individual entry.
 */
export function payForMinutes(minutes: number, hourlyRateCents: Cents): Cents {
  return Math.round((minutes * hourlyRateCents) / 60);
}

export function formatHours(minutes: number): string {
  const hours = minutes / 60;
  return `${hours.toLocaleString("en-US", { maximumFractionDigits: 2 })} h`;
}
