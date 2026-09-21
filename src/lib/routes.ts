import { addMonths } from './dates';

// Addresses of the detail pages, and the checks that run on a URL before any
// query does. A malformed id and another person's id end in the same "Not
// found": the first is refused here, the second comes back empty from RLS.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/;

export function isUuid(value: string | undefined): value is string {
  return typeof value === 'string' && UUID.test(value);
}

// "2026-09" in the address, "2026-09-01" everywhere else: every view keys a
// month on its first day.
export function monthFromParam(value: string | undefined): string | null {
  if (!value) return null;
  const match = MONTH.exec(value);
  return match ? `${match[1]}-${match[2]}-01` : null;
}

export function monthParam(monthStart: string): string {
  return monthStart.slice(0, 7);
}

export const accountPath = (id: string) => `/accounts/${id}`;
export const categoryPath = (id: string) => `/categories/${id}`;
export const goalPath = (id: string) => `/goals/${id}`;
export const billPath = (id: string) => `/bills/${id}`;
export const monthPath = (monthStart: string) => `/months/${monthParam(monthStart)}`;
export const budgetMonthPath = (monthStart: string) => `/budgets/${monthParam(monthStart)}`;
export const budgetLinePath = (monthStart: string, categoryId: string) =>
  `/budgets/${monthParam(monthStart)}/${categoryId}`;

// Activity already keeps its filters in the query string, so "See all in
// Activity" is just a link with them filled in.
export function activityPath(filters: {
  accountId?: string;
  categoryId?: string;
  kind?: 'income' | 'expense' | 'transfer';
  from?: string;
  to?: string;
}): string {
  const params = new URLSearchParams();
  if (filters.kind) params.set('kind', filters.kind);
  if (filters.accountId) params.set('accountId', filters.accountId);
  if (filters.categoryId) params.set('categoryId', filters.categoryId);
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);
  const query = params.toString();
  return query ? `/activity?${query}` : '/activity';
}

// The first and last day of a month, for date-range filters.
export function monthRange(monthStart: string): { from: string; to: string; next: string } {
  const next = addMonths(monthStart, 1);
  const last = new Date(`${next}T00:00:00Z`);
  last.setUTCDate(0);
  return { from: monthStart, to: last.toISOString().slice(0, 10), next };
}

// The twelve months ending with `lastMonth`, oldest first.
export function lastTwelveMonths(lastMonth: string): string[] {
  return Array.from({ length: 12 }, (_, i) => addMonths(lastMonth, i - 11));
}
