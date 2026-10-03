// Date arithmetic for the date picker, on ISO dates ("2026-10-17") read as
// calendar days in UTC, so no time zone or daylight saving shift can move a
// day. "Today" is decided elsewhere, from the profile's time zone.

const parse = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1));
};
const iso = (date: Date) => date.toISOString().slice(0, 10);

export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = parse(value);
  return !Number.isNaN(date.getTime()) && iso(date) === value;
}

export function addDays(day: string, n: number): string {
  const date = parse(day);
  date.setUTCDate(date.getUTCDate() + n);
  return iso(date);
}

// The same day n months on, clamped to the end of a shorter month:
// Jan 31 plus one month is Feb 28 (or 29).
export function addMonthsClamped(day: string, n: number): string {
  const date = parse(day);
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + n, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(date.getUTCDate(), last));
  return iso(target);
}

export const firstOfMonth = (day: string) => `${day.slice(0, 7)}-01`;

// Six weeks of days, Sunday first, covering the month of `day`: the grid a
// calendar draws, with the days of the months either side filling it out.
export function monthGrid(day: string): string[][] {
  const first = parse(firstOfMonth(day));
  const start = addDays(iso(first), -first.getUTCDay());
  return Array.from({ length: 6 }, (_, week) => Array.from({ length: 7 }, (_, d) => addDays(start, week * 7 + d)));
}

export const startOfWeek = (day: string) => addDays(day, -parse(day).getUTCDay());
export const endOfWeek = (day: string) => addDays(day, 6 - parse(day).getUTCDay());

// Keeps a day inside optional bounds.
export function clampDay(day: string, min?: string, max?: string): string {
  if (min && day < min) return min;
  if (max && day > max) return max;
  return day;
}
