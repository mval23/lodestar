import { useQuery } from '@tanstack/react-query';
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

// A typical month, ignoring the current one, which is always partial and
// would drag the average down.
export function averagePerMonth(rows: CashFlowMonth[], currentMonth: string): CashFlowSummary | null {
  const complete = rows.filter((row) => row.month !== currentMonth);
  if (complete.length === 0) return null;
  const total = summarizeCashFlow(complete);
  return {
    moneyIn: Math.round(total.moneyIn / complete.length),
    moneyOut: Math.round(total.moneyOut / complete.length),
    net: Math.round(total.net / complete.length),
    months: complete.length,
  };
}
