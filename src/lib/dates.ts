import { TZDate } from '@date-fns/tz';
import { format, parseISO } from 'date-fns';

// "Today" and "this month" come from the profile's time zone, not the
// browser's clock, so a trip abroad never moves a transaction to another day.
// The database computes the same way (see check_occurred_on_upper_bound).
export function todayInZone(timeZone?: string): string {
  const zone = timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC';
  try {
    return format(new TZDate(new Date(), zone), 'yyyy-MM-dd');
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

export function monthStartInZone(timeZone?: string): string {
  return todayInZone(timeZone).slice(0, 8) + '01';
}

// Dates are stored as a plain date, so they are formatted without a zone:
// "2026-09-19" is Sep 19 wherever you read it.
export function formatDate(isoDate: string): string {
  try {
    return format(parseISO(isoDate), 'MMM d, yyyy');
  } catch {
    return isoDate;
  }
}

export function formatDateShort(isoDate: string): string {
  try {
    return format(parseISO(isoDate), 'MMM d');
  } catch {
    return isoDate;
  }
}
