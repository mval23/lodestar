import { useQuery } from '@tanstack/react-query';
import { addMonths } from '../../lib/dates';
import { db } from '../../lib/supabase';

// Both reports are views, so every figure is summed in Postgres and can never
// drift from the ledger it came from.

export type CashFlowMonth = {
  month: string;
  money_in_minor: number;
  money_out_minor: number;
  net_minor: number;
};

export type NetWorthMonth = {
  month: string;
  assets_minor: number;
  liabilities_minor: number;
  net_worth_minor: number;
};

export const reportsKey = ['reports'] as const;

export function useCashFlow(months = 12) {
  return useQuery({
    queryKey: [...reportsKey, 'cash-flow', months],
    queryFn: async (): Promise<CashFlowMonth[]> => {
      const { data, error } = await db()
        .from('monthly_cash_flow')
        .select('*')
        .order('month', { ascending: false })
        .limit(months);
      if (error) throw error;
      return data
        .map((row) => ({
          month: (row.month ?? '').slice(0, 10),
          money_in_minor: row.money_in_minor ?? 0,
          money_out_minor: row.money_out_minor ?? 0,
          net_minor: row.net_minor ?? 0,
        }))
        .reverse();
    },
  });
}

export function useNetWorth(months = 12) {
  return useQuery({
    queryKey: [...reportsKey, 'net-worth', months],
    queryFn: async (): Promise<NetWorthMonth[]> => {
      const { data, error } = await db()
        .from('net_worth_by_month')
        .select('*')
        .order('month', { ascending: false })
        .limit(months);
      if (error) throw error;
      return data
        .map((row) => ({
          month: (row.month ?? '').slice(0, 10),
          assets_minor: row.assets_minor ?? 0,
          liabilities_minor: row.liabilities_minor ?? 0,
          net_worth_minor: row.net_worth_minor ?? 0,
        }))
        .reverse();
    },
  });
}

// ---------------------------------------------------------------------------
// The Reports hub and its reports. Every total comes from a database
// function (report_cash_flow, report_summary, net_worth_by_account,
// net_worth_change); the browser only formats. A period is complete calendar
// months, from `from` up to, not including, `to`.
// ---------------------------------------------------------------------------

function toCashFlowMonth(row: {
  month: string | null;
  money_in_minor: number | null;
  money_out_minor: number | null;
  net_minor: number | null;
}): CashFlowMonth {
  return {
    month: (row.month ?? '').slice(0, 10),
    money_in_minor: row.money_in_minor ?? 0,
    money_out_minor: row.money_out_minor ?? 0,
    net_minor: row.net_minor ?? 0,
  };
}

// The first month with any income or expense, so a period never starts
// before the person began.
export function useFirstActivityMonth() {
  return useQuery({
    queryKey: [...reportsKey, 'first-month'],
    queryFn: async (): Promise<string | null> => {
      const { data, error } = await db()
        .from('monthly_cash_flow')
        .select('month')
        .order('month', { ascending: true })
        .limit(1);
      if (error) throw error;
      return (
        data
          .map((row) => (row.month ?? '').slice(0, 10))
          .filter((m) => m !== '')
          .sort()[0] ?? null
      );
    },
  });
}

// A calendar month of a report. An empty month is kept, as zeros, so every
// month has its slot on the chart; `active` says whether anything happened.
export type ReportMonth = CashFlowMonth & {
  to_goals_minor: number;
  from_goals_minor: number;
  moved_in_minor: number;
  moved_out_minor: number;
  active: boolean;
};

export function useReportCashFlow(from: string, to: string, accountIds: string[] | null, enabled = true) {
  return useQuery({
    queryKey: [...reportsKey, 'cash-flow', from, to, accountIds],
    enabled: enabled && from < to,
    queryFn: async (): Promise<ReportMonth[]> => {
      // Left out, the scope defaults to every account in Postgres.
      const { data, error } = await db().rpc('report_cash_flow', {
        p_from: from,
        p_to: to,
        p_account_ids: accountIds ?? undefined,
      });
      if (error) throw error;
      return (data ?? []).map((row) => ({ ...row, month: row.month.slice(0, 10) }));
    },
  });
}

export type ReportTotals = {
  // 'current' or 'compare'.
  period: string;
  period_from: string;
  period_to: string;
  money_in_minor: number;
  money_out_minor: number;
  net_minor: number;
  to_goals_minor: number;
  from_goals_minor: number;
  card_payments_minor: number;
  loan_payments_minor: number;
  cash_withdrawals_minor: number;
  other_transfers_minor: number;
  // Every transfer in scope: the buckets above, added up in Postgres.
  transfers_minor: number;
  months: number;
  active_months: number;
};

export function useReportSummary(from: string, to: string, compareFrom: string, accountIds: string[] | null) {
  return useQuery({
    queryKey: [...reportsKey, 'summary', from, to, compareFrom, accountIds],
    enabled: from < to,
    queryFn: async (): Promise<{ current: ReportTotals; compare: ReportTotals } | null> => {
      const { data, error } = await db().rpc('report_summary', {
        p_from: from,
        p_to: to,
        p_compare_from: compareFrom,
        p_account_ids: accountIds ?? undefined,
      });
      if (error) throw error;
      const current = (data ?? []).find((row) => row.period === 'current');
      const compare = (data ?? []).find((row) => row.period === 'compare');
      return current && compare ? { current, compare } : null;
    },
  });
}

// The transfers of a period, each in exactly one bucket.
export function transfersOf(totals: ReportTotals): { label: string; note?: string; minor: number }[] {
  return [
    { label: 'Card payments', note: 'purchases already counted', minor: totals.card_payments_minor },
    { label: 'Into goal accounts', minor: totals.to_goals_minor },
    { label: 'Out of goal accounts', minor: totals.from_goals_minor },
    { label: 'Loan payments', minor: totals.loan_payments_minor },
    { label: 'Cash withdrawals', note: 'cash spending counted', minor: totals.cash_withdrawals_minor },
    { label: 'Other transfers', minor: totals.other_transfers_minor },
  ];
}

// Net worth at each month end from the month before `from` (where the period
// began) to the last month of the period.
export function useNetWorthRange(from: string, to: string) {
  return useQuery({
    queryKey: [...reportsKey, 'net-worth-range', from, to],
    enabled: from < to,
    queryFn: async (): Promise<NetWorthMonth[]> => {
      const { data, error } = await db()
        .from('net_worth_by_month')
        .select('*')
        .gte('month', addMonths(from, -1))
        .lt('month', to)
        .order('month', { ascending: true });
      if (error) throw error;
      return data
        .map((row) => ({
          month: (row.month ?? '').slice(0, 10),
          assets_minor: row.assets_minor ?? 0,
          liabilities_minor: row.liabilities_minor ?? 0,
          net_worth_minor: row.net_worth_minor ?? 0,
        }))
        .filter((row) => row.month >= addMonths(from, -1) && row.month < to)
        .sort((a, b) => a.month.localeCompare(b.month));
    },
  });
}

export type AccountChange = {
  account_id: string;
  name: string;
  type: string;
  is_liability: boolean;
  include_in_net_worth: boolean;
  archived_at: string | null;
  start_minor: number;
  end_minor: number;
  change_minor: number;
};

export function useNetWorthByAccount(from: string, to: string) {
  return useQuery({
    queryKey: [...reportsKey, 'net-worth-accounts', from, to],
    enabled: from < to,
    queryFn: async (): Promise<AccountChange[]> => {
      const { data, error } = await db().rpc('net_worth_by_account', { p_from: from, p_to: to });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export type NetWorthBridge = {
  start_minor: number;
  end_minor: number;
  change_minor: number;
  cash_flow_minor: number;
  openings_minor: number;
  moved_minor: number;
};

export function useNetWorthChange(from: string, to: string) {
  return useQuery({
    queryKey: [...reportsKey, 'net-worth-change', from, to],
    enabled: from < to,
    queryFn: async (): Promise<NetWorthBridge | null> => {
      const { data, error } = await db().rpc('net_worth_change', { p_from: from, p_to: to });
      if (error) throw error;
      return (data ?? [])[0] ?? null;
    },
  });
}

// The current month on its own: shown as "so far", never added to a period.
export function useCurrentMonthFlow(currentMonth: string) {
  return useQuery({
    queryKey: [...reportsKey, 'cash-flow-current', currentMonth],
    queryFn: async (): Promise<CashFlowMonth | null> => {
      const { data, error } = await db()
        .from('monthly_cash_flow')
        .select('*')
        .eq('month', currentMonth)
        .limit(1);
      if (error) throw error;
      return data.map(toCashFlowMonth).find((row) => row.month === currentMonth) ?? null;
    },
  });
}

// A typical month: the period's net over the months that had activity. The
// sums are the database's; this only divides, for display.
export function typicalNet(totals: ReportTotals): number | null {
  return totals.active_months > 0 ? Math.round(totals.net_minor / totals.active_months) : null;
}

// What a typical month is the average of, in words.
export function typicalBasis(totals: ReportTotals): string {
  const months = `${totals.active_months} ${totals.active_months === 1 ? 'month' : 'months'}`;
  const empty = totals.months - totals.active_months;
  if (empty === 0) return `average of ${months}`;
  return `average of ${months} with activity; ${empty} empty ${empty === 1 ? 'month' : 'months'} left out`;
}

// ---------------------------------------------------------------------------
// Spending by category, Budget vs actual, Savings rate and goals.

export type CategoryMonthTotal = { category_id: string | null; month: string; total_minor: number };

// Spending per category per month, for the stacked bars (report_category_months).
export function useReportCategoryMonths(from: string, to: string, accountIds: string[] | null) {
  return useQuery({
    queryKey: [...reportsKey, 'category-months', from, to, accountIds],
    enabled: from < to,
    queryFn: async (): Promise<CategoryMonthTotal[]> => {
      const { data, error } = await db().rpc('report_category_months', {
        p_from: from,
        p_to: to,
        p_account_ids: accountIds ?? undefined,
      });
      if (error) throw error;
      return (data ?? []).map((row) => ({
        category_id: (row.category_id as string | null) ?? null,
        month: row.month.slice(0, 10),
        total_minor: row.total_minor,
      }));
    },
  });
}

export type CategoryTotal = { category_id: string | null; total_minor: number; txn_count: number; compare_minor: number };

// Each category over the period and the comparison period, largest first
// (report_category_totals).
export function useReportCategoryTotals(from: string, to: string, compareFrom: string, accountIds: string[] | null) {
  return useQuery({
    queryKey: [...reportsKey, 'category-totals', from, to, compareFrom, accountIds],
    enabled: from < to,
    queryFn: async (): Promise<CategoryTotal[]> => {
      const { data, error } = await db().rpc('report_category_totals', {
        p_from: from,
        p_to: to,
        p_compare_from: compareFrom,
        p_account_ids: accountIds ?? undefined,
      });
      if (error) throw error;
      return (data ?? []).map((row) => ({ ...row, category_id: (row.category_id as string | null) ?? null }));
    },
  });
}

export type BudgetResult = {
  category_id: string | null;
  month: string;
  // Null without a plan.
  planned_minor: number | null;
  spent_minor: number;
  within_plan: boolean | null;
};

// Every plan and every category with spending, per month (budget_month_results).
export function useBudgetResults(from: string, to: string) {
  return useQuery({
    queryKey: [...reportsKey, 'budget-results', from, to],
    enabled: from < to,
    queryFn: async (): Promise<BudgetResult[]> => {
      const { data, error } = await db().rpc('budget_month_results', { p_from: from, p_to: to });
      if (error) throw error;
      // The generator calls every column non-null; three can be null.
      return (data ?? []).map((row) => ({
        category_id: (row.category_id as string | null) ?? null,
        month: row.month.slice(0, 10),
        planned_minor: (row.planned_minor as number | null) ?? null,
        spent_minor: row.spent_minor,
        within_plan: (row.within_plan as boolean | null) ?? null,
      }));
    },
  });
}

export type BudgetSummary = {
  planned_minor: number;
  spent_planned_minor: number;
  unplanned_minor: number;
  uncategorized_minor: number;
  lines: number;
  within: number;
  history_lines: number;
  history_within: number;
  first_month: string | null;
};

// One month's plans in a line, and how plans held over 12 months.
export function useBudgetSummary(month: string) {
  return useQuery({
    queryKey: [...reportsKey, 'budget-summary', month],
    queryFn: async (): Promise<BudgetSummary | null> => {
      const { data, error } = await db().rpc('budget_month_summary', { p_month: month });
      if (error) throw error;
      const row = (data ?? [])[0];
      if (!row) return null;
      return { ...row, first_month: ((row.first_month as string | null) ?? null)?.slice(0, 10) ?? null };
    },
  });
}

export type GoalPace = {
  goal_id: string;
  needed_monthly_minor: number | null;
  avg_put_in_minor: number;
  months_put_in: number;
  estimated_month: string | null;
};

// What each goal needs a month, its recent pace and, from 3 months of that
// pace, when it is reached (goal_progress).
export function useGoalPaces() {
  return useQuery({
    queryKey: ['goals', 'pace'],
    queryFn: async (): Promise<GoalPace[]> => {
      const { data, error } = await db()
        .from('goal_progress')
        .select('goal_id, needed_monthly_minor, avg_put_in_minor, months_put_in, estimated_month');
      if (error) throw error;
      return data.map((row) => ({
        goal_id: row.goal_id ?? '',
        needed_monthly_minor: row.needed_monthly_minor,
        avg_put_in_minor: row.avg_put_in_minor ?? 0,
        months_put_in: row.months_put_in ?? 0,
        estimated_month: row.estimated_month ? row.estimated_month.slice(0, 10) : null,
      }));
    },
  });
}
