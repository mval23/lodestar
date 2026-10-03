import { useSearchParams } from 'react-router';
import { addMonths, formatMonthShort } from '../../lib/dates';
import type { AccountBalance, AccountType } from '../accounts/queries';

// The filters every report shares, kept in the address so a link reopens a
// report exactly as it was seen: ?period=12m&compare=previous&accounts=all.
// A period is made of complete calendar months; the current month is still
// partial, so it never belongs to one.

export type Period = '6m' | '12m' | '24m' | 'ytd';
export type Compare = 'previous' | 'year';
export type Scope = 'all' | 'cash' | 'debt';
export type ReportFilters = { period: Period; compare: Compare; scope: Scope };

export const PERIODS: { value: Period; label: string }[] = [
  { value: '6m', label: 'Last 6 months' },
  { value: '12m', label: 'Last 12 months' },
  { value: '24m', label: 'Last 24 months' },
  { value: 'ytd', label: 'This year so far' },
];

export const COMPARES: { value: Compare; label: string }[] = [
  { value: 'previous', label: 'Previous period' },
  { value: 'year', label: 'A year earlier' },
];

export const SCOPES: { value: Scope; label: string; types: AccountType[] | null }[] = [
  { value: 'all', label: 'All accounts', types: null },
  { value: 'cash', label: 'Cash and savings', types: ['checking', 'cash', 'savings'] },
  { value: 'debt', label: 'Cards and loans', types: ['credit_card', 'loan'] },
];

export const DEFAULT_FILTERS: ReportFilters = { period: '12m', compare: 'previous', scope: 'all' };

function pick<T extends string>(value: string | null, allowed: { value: T }[], fallback: T): T {
  return allowed.some((option) => option.value === value) ? (value as T) : fallback;
}

export function parseFilters(params: URLSearchParams): ReportFilters {
  return {
    period: pick(params.get('period'), PERIODS, DEFAULT_FILTERS.period),
    compare: pick(params.get('compare'), COMPARES, DEFAULT_FILTERS.compare),
    scope: pick(params.get('accounts'), SCOPES, DEFAULT_FILTERS.scope),
  };
}

// The query string for a set of filters, for links between reports.
export function filterSearch(filters: ReportFilters): string {
  return `?period=${filters.period}&compare=${filters.compare}&accounts=${filters.scope}`;
}

export function useReportFilters(): [ReportFilters, (next: Partial<ReportFilters>) => void] {
  const [params, setParams] = useSearchParams();
  const filters = parseFilters(params);
  const set = (next: Partial<ReportFilters>) => {
    const merged = { ...filters, ...next };
    setParams(new URLSearchParams({ period: merged.period, compare: merged.compare, accounts: merged.scope }), {
      replace: true,
    });
  };
  return [filters, set];
}

export function monthsBetween(from: string, to: string): number {
  const [fy, fm] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  return ((ty ?? 0) - (fy ?? 0)) * 12 + ((tm ?? 0) - (fm ?? 0));
}

export type Range = { from: string; to: string };

// The complete months of a period: `to` is the first of the current month,
// exclusive. "This year so far" is the year of the last complete month, so
// in January it is the whole of last year rather than nothing. A range never
// starts before the first month with any activity.
export function periodRange(period: Period, currentMonth: string, firstMonth: string | null): Range {
  const to = currentMonth;
  const lastComplete = addMonths(currentMonth, -1);
  const from =
    period === 'ytd'
      ? `${lastComplete.slice(0, 4)}-01-01`
      : addMonths(currentMonth, -Number(period.replace('m', '')));
  return { from: firstMonth && firstMonth > from ? firstMonth : from, to };
}

// Where the comparison period starts: the same number of months just before,
// or the same months a year earlier.
export function compareStart(range: Range, compare: Compare): string {
  return compare === 'year' ? addMonths(range.from, -12) : addMonths(range.from, -monthsBetween(range.from, range.to));
}

export function rangeLabel(range: Range): string {
  const last = addMonths(range.to, -1);
  return range.from === last ? formatMonthShort(last) : `${formatMonthShort(range.from)} – ${formatMonthShort(last)}`;
}

// The accounts a scope covers, by type, archived ones included so their
// history still counts. Null means every account.
export function scopeAccountIds(scope: Scope, accounts: AccountBalance[]): string[] | null {
  const types = SCOPES.find((option) => option.value === scope)?.types ?? null;
  if (!types) return null;
  return accounts.filter((account) => types.includes(account.type)).map((account) => account.account_id);
}
