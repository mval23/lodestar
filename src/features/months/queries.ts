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
