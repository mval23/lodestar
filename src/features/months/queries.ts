import { useQuery } from '@tanstack/react-query';
import { db } from '../../lib/supabase';
import { transactionsKey } from '../transactions/queries';
import { normalizeAccountMonth, type AccountMonth } from '../accounts/queries';

// One calendar month. Every figure is a view; keys sit under transactionsKey
// so a change to the ledger refreshes the page.

export type MonthSummary = {
  month: string;
  income_minor: number;
  income_count: number;
  expense_minor: number;
  expense_count: number;
  transfer_minor: number;
  transfer_count: number;
  to_goals_minor: number;
  net_minor: number;
};

function emptyMonth(month: string): MonthSummary {
  return {
    month,
    income_minor: 0,
    income_count: 0,
    expense_minor: 0,
    expense_count: 0,
    transfer_minor: 0,
    transfer_count: 0,
    to_goals_minor: 0,
    net_minor: 0,
  };
}

// A month with no transactions has no row; it reads as zeros, not an error.
export function useMonthSummary(month: string) {
  return useQuery({
    queryKey: [...transactionsKey, 'month-summary', month],
    queryFn: async (): Promise<MonthSummary> => {
      const { data, error } = await db().from('month_summary').select('*').eq('month', month).maybeSingle();
      if (error) throw error;
      if (!data) return emptyMonth(month);
      return {
        month,
        income_minor: data.income_minor ?? 0,
        income_count: data.income_count ?? 0,
        expense_minor: data.expense_minor ?? 0,
        expense_count: data.expense_count ?? 0,
        transfer_minor: data.transfer_minor ?? 0,
        transfer_count: data.transfer_count ?? 0,
        to_goals_minor: data.to_goals_minor ?? 0,
        net_minor: data.net_minor ?? 0,
      };
    },
  });
}

// What each account took in and paid out that month.
export function useMonthAccounts(month: string) {
  return useQuery({
    queryKey: [...transactionsKey, 'month-accounts', month],
    queryFn: async (): Promise<(AccountMonth & { account_id: string })[]> => {
      const { data, error } = await db().from('account_month_flow').select('*').eq('month', month);
      if (error) throw error;
      return data.map((row) => ({ ...normalizeAccountMonth(row), account_id: row.account_id ?? '' }));
    },
  });
}

export type SpendingDay = {
  day: string;
  day_of_month: number;
  spent_minor: number;
  running_minor: number;
  typical_running_minor: number;
  typical_months: number;
  after_today: boolean;
};

// Spending day by day and its running total, against a typical month's
// running total (daily_spending). With a category, only that category.
export function useDailySpending(month: string, categoryId?: string) {
  return useQuery({
    queryKey: [...transactionsKey, 'daily-spending', month, categoryId ?? null],
    queryFn: async (): Promise<SpendingDay[]> => {
      const { data, error } = await db().rpc('daily_spending', {
        p_month: month,
        ...(categoryId ? { p_category_id: categoryId } : {}),
      });
      if (error) throw error;
      return (data ?? []).map((row) => ({ ...row, day: row.day.slice(0, 10) }));
    },
  });
}

export type MonthCategory = {
  // null for spending with no category.
  category_id: string | null;
  spent_minor: number;
  typical_minor: number;
  typical_months: number;
};

// Each category's spending this month so far, against a typical month cut at
// the same day (month_categories). Largest first.
export function useMonthCategories(month: string) {
  return useQuery({
    queryKey: [...transactionsKey, 'month-categories', month],
    queryFn: async (): Promise<MonthCategory[]> => {
      const { data, error } = await db().rpc('month_categories', { p_month: month });
      if (error) throw error;
      return (data ?? []).map((row) => ({ ...row, category_id: (row.category_id as string | null) ?? null }));
    },
  });
}

export type BillPayment = { recurring_item_id: string; paid_minor: number; last_paid_on: string };

// What each bill or subscription was paid in one month (recurring_item_months).
export function useMonthBillPayments(month: string) {
  return useQuery({
    queryKey: [...transactionsKey, 'month-bill-payments', month],
    queryFn: async (): Promise<BillPayment[]> => {
      const { data, error } = await db()
        .from('recurring_item_months')
        .select('recurring_item_id, paid_minor, last_paid_on')
        .eq('month', month);
      if (error) throw error;
      return data.map((row) => ({
        recurring_item_id: row.recurring_item_id ?? '',
        paid_minor: row.paid_minor ?? 0,
        last_paid_on: (row.last_paid_on ?? '').slice(0, 10),
      }));
    },
  });
}
