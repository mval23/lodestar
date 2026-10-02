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

export type CashFlowSummary = { moneyIn: number; moneyOut: number; net: number; months: number };

export function summarizeCashFlow(rows: CashFlowMonth[]): CashFlowSummary {
  return rows.reduce(
    (total, row) => ({
      moneyIn: total.moneyIn + row.money_in_minor,
      moneyOut: total.moneyOut + row.money_out_minor,
      net: total.net + row.net_minor,
      months: total.months + 1,
    }),
    { moneyIn: 0, moneyOut: 0, net: 0, months: 0 },
  );
}

// ---------------------------------------------------------------------------
// The Reports page counts calendar months. monthly_cash_flow has a row only
// for a month with something recorded, so "the last 12 rows" could reach back
// more than a year and drop empty months from the chart. The range is chosen
// by date instead: it ends with the last complete month (the current one is
// still partial) and starts no earlier than the first month with activity,
// so a new account isn't padded with months from before it began.
// ---------------------------------------------------------------------------

// A calendar month in a report's range. An empty month has no row in the
// view; it is kept, as zeros, so every month has its slot on the chart.
export type ReportMonth = CashFlowMonth & { active: boolean };

export function reportStart(currentMonth: string, months: number, firstMonth: string | null): string {
  const from = addMonths(currentMonth, -months);
  return firstMonth && firstMonth > from ? firstMonth : from;
}

// One row per calendar month from `from` up to, not including, `to`.
export function fillMonths(rows: CashFlowMonth[], from: string, to: string): ReportMonth[] {
  const byMonth = new Map(rows.map((row) => [row.month, row]));
  const filled: ReportMonth[] = [];
  for (let month = from; month < to; month = addMonths(month, 1)) {
    const row = byMonth.get(month);
    filled.push(
      row
        ? { ...row, active: true }
        : { month, money_in_minor: 0, money_out_minor: 0, net_minor: 0, active: false },
    );
  }
  return filled;
}

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

// The complete months of the range, oldest first, empty ones as zeros.
export function useCashFlowReport(months: number, currentMonth: string) {
  return useQuery({
    queryKey: [...reportsKey, 'cash-flow-range', months, currentMonth],
    queryFn: async (): Promise<ReportMonth[]> => {
      const first = await db()
        .from('monthly_cash_flow')
        .select('month')
        .lt('month', currentMonth)
        .order('month', { ascending: true })
        .limit(1);
      if (first.error) throw first.error;
      const firstMonth = first.data
        .map((row) => (row.month ?? '').slice(0, 10))
        .filter((m) => m !== '' && m < currentMonth)
        .sort()[0];
      if (!firstMonth) return [];

      const from = reportStart(currentMonth, months, firstMonth);
      const { data, error } = await db()
        .from('monthly_cash_flow')
        .select('*')
        .gte('month', from)
        .lt('month', currentMonth)
        .order('month', { ascending: true });
      if (error) throw error;
      return fillMonths(data.map(toCashFlowMonth), from, currentMonth);
    },
  });
}

// The current month on its own: shown as "so far", never added to the range.
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

// Net worth over the same months, ending with now. The view has a row for
// every month from the first activity, so no filling is needed.
export function useNetWorthReport(months: number, currentMonth: string) {
  return useQuery({
    queryKey: [...reportsKey, 'net-worth-range', months, currentMonth],
    queryFn: async (): Promise<NetWorthMonth[]> => {
      const { data, error } = await db()
        .from('net_worth_by_month')
        .select('*')
        .gte('month', addMonths(currentMonth, -months))
        .lte('month', currentMonth)
        .order('month', { ascending: true });
      if (error) throw error;
      return data
        .map((row) => ({
          month: (row.month ?? '').slice(0, 10),
          assets_minor: row.assets_minor ?? 0,
          liabilities_minor: row.liabilities_minor ?? 0,
          net_worth_minor: row.net_worth_minor ?? 0,
        }))
        .sort((a, b) => a.month.localeCompare(b.month));
    },
  });
}

export type TypicalMonth = CashFlowSummary & { emptyMonths: number };

// A typical month: the average of the months with activity. Empty months are
// left out, and counted, so the page can say how many.
export function averagePerMonth(rows: ReportMonth[]): TypicalMonth | null {
  const active = rows.filter((row) => row.active);
  if (active.length === 0) return null;
  const total = summarizeCashFlow(active);
  return {
    moneyIn: Math.round(total.moneyIn / active.length),
    moneyOut: Math.round(total.moneyOut / active.length),
    net: Math.round(total.net / active.length),
    months: active.length,
    emptyMonths: rows.length - active.length,
  };
}
