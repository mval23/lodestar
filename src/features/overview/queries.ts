import { useQuery } from '@tanstack/react-query';
import { addMonths } from '../../lib/dates';
import { db } from '../../lib/supabase';
import type { PaceLine } from '../../lib/standsOut';
import { accountsKey } from '../accounts/queries';
import { budgetsKey } from '../budgets/queries';

// What the Overview needs beyond the other pages' queries: the month so far
// against a typical month, each budget line's pace, and every account's
// month-end balance for the small lines beside the subtotals. All of it is
// summed in Postgres (month_to_date, budget_pace, account_month_flow).

// Invalidated with every write that moves money (see transactions/queries).
export const overviewKey = ['overview'] as const;

export type MonthToDate = {
  month: string;
  today: string;
  day_of_month: number;
  days_in_month: number;
  money_in_minor: number;
  money_out_minor: number;
  to_goals_minor: number;
  typical_in_minor: number;
  typical_out_minor: number;
  typical_to_goals_minor: number;
  typical_months: number;
};

export function useMonthToDate(month: string) {
  return useQuery({
    queryKey: [...overviewKey, 'month-to-date', month],
    queryFn: async (): Promise<MonthToDate | null> => {
      const { data, error } = await db().rpc('month_to_date', { p_month: month });
      if (error) throw error;
      return (data ?? [])[0] ?? null;
    },
  });
}

export type BudgetPace = PaceLine & {
  budget_id: string;
  category_id: string;
  month: string;
  bills_month_minor: number;
  bills_due_minor: number;
  per_day_minor: number | null;
};

// Under the budgets key, so a change to a plan refreshes the pace with it.
export function useBudgetPace(month: string) {
  return useQuery({
    queryKey: [...budgetsKey, 'pace', month],
    queryFn: async (): Promise<BudgetPace[]> => {
      const { data, error } = await db().rpc('budget_pace', { p_month: month });
      if (error) throw error;
      // status is text in Postgres; the function only ever returns these three.
      return (data ?? []).map((row) => ({ ...row, status: row.status as BudgetPace['status'] }));
    },
  });
}

export type AccountClosing = { account_id: string; month: string; closing_balance_minor: number };

// Every account's balance at each month end, from 11 months before `month`
// to `month` itself (whose "closing" balance is the balance now).
export function useAccountClosings(month: string) {
  return useQuery({
    queryKey: [...accountsKey, 'closings', month],
    queryFn: async (): Promise<AccountClosing[]> => {
      const { data, error } = await db()
        .from('account_month_flow')
        .select('account_id, month, closing_balance_minor')
        .gte('month', addMonths(month, -11))
        .lte('month', month);
      if (error) throw error;
      return data.map((row) => ({
        account_id: row.account_id ?? '',
        month: (row.month ?? '').slice(0, 10),
        closing_balance_minor: row.closing_balance_minor ?? 0,
      }));
    },
  });
}

// Over plan first, by how far over; then ahead of pace, by how far ahead;
// then the rest by share of plan used. The order the Overview lists them in.
export function byNeed(a: BudgetPace, b: BudgetPace): number {
  const rank = (row: BudgetPace) => (row.status === 'over' ? 0 : row.status === 'ahead' ? 1 : 2);
  if (rank(a) !== rank(b)) return rank(a) - rank(b);
  if (a.status === 'over') return b.spent_minor - b.planned_minor - (a.spent_minor - a.planned_minor);
  if (a.status === 'ahead') return b.gap_minor - a.gap_minor;
  const share = (row: BudgetPace) => (row.planned_minor > 0 ? row.spent_minor / row.planned_minor : 0);
  return share(b) - share(a);
}
