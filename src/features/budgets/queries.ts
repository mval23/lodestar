import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { db } from '../../lib/supabase';
import type { Database } from '../../lib/database.types';

export type Budget = Database['public']['Tables']['budgets']['Row'];

// Normalized from the view, whose columns are all nullable in the generated
// types even though none of them are null in practice.
export type BudgetProgress = {
  budget_id: string;
  category_id: string;
  category_name: string;
  group_id: string | null;
  month: string;
  planned_minor: number;
  spent_minor: number;
  left_minor: number;
};

export const budgetsKey = ['budgets'] as const;

export function monthKey(month: string) {
  return [...budgetsKey, month] as const;
}

export function useBudgets(month: string) {
  return useQuery({
    queryKey: monthKey(month),
    queryFn: async (): Promise<BudgetProgress[]> => {
      const { data, error } = await db().from('budget_progress').select('*').eq('month', month);
      if (error) throw error;
      return data.map((row) => ({
        budget_id: row.budget_id ?? '',
        category_id: row.category_id ?? '',
        category_name: row.category_name ?? '',
        group_id: row.group_id,
        month: row.month ?? month,
        planned_minor: row.planned_minor ?? 0,
        spent_minor: row.spent_minor ?? 0,
        left_minor: row.left_minor ?? 0,
      }));
    },
  });
}

function useInvalidateBudgets() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: budgetsKey });
}

// One plan per category per month. Setting an amount where none existed
// inserts; clearing it removes the row, so "no plan" and "planned zero" stay
// different things.
export function useSetBudget() {
  const invalidate = useInvalidateBudgets();
  return useMutation({
    mutationFn: async ({
      budgetId,
      categoryId,
      month,
      amountMinor,
    }: {
      budgetId?: string;
      categoryId: string;
      month: string;
      amountMinor: number | null;
    }) => {
      if (amountMinor === null) {
        if (!budgetId) return;
        const { error } = await db().from('budgets').delete().eq('id', budgetId);
        if (error) throw error;
        return;
      }
      if (budgetId) {
        const { error } = await db().from('budgets').update({ amount_minor: amountMinor }).eq('id', budgetId);
        if (error) throw error;
        return;
      }
      const { error } = await db()
        .from('budgets')
        .insert({ category_id: categoryId, month, amount_minor: amountMinor });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

// Starts a month from the previous one. It never overwrites a plan that is
// already there, and running it twice inserts nothing the second time.
export function useCopyBudgets() {
  const invalidate = useInvalidateBudgets();
  return useMutation({
    mutationFn: async ({ from, to }: { from: string; to: string }): Promise<number> => {
      const { data, error } = await db().rpc('copy_budgets', { p_from_month: from, p_to_month: to });
      if (error) throw error;
      return data ?? 0;
    },
    onSuccess: invalidate,
  });
}

export type BudgetTotals = { planned: number; spent: number; left: number; over: number };

export function totalsOf(rows: BudgetProgress[]): BudgetTotals {
  let planned = 0;
  let spent = 0;
  let over = 0;
  for (const row of rows) {
    planned += row.planned_minor;
    spent += row.spent_minor;
    if (row.left_minor < 0) over += -row.left_minor;
  }
  return { planned, spent, left: planned - spent, over };
}

// One category's plans across a span of months, for the budget line's chart.
export function useBudgetHistory(categoryId: string | undefined, from: string, to: string) {
  return useQuery({
    queryKey: [...budgetsKey, 'history', categoryId, from, to],
    enabled: Boolean(categoryId),
    queryFn: async (): Promise<BudgetProgress[]> => {
      const { data, error } = await db()
        .from('budget_progress')
        .select('*')
        .eq('category_id', categoryId!)
        .gte('month', from)
        .lte('month', to)
        .order('month', { ascending: true });
      if (error) throw error;
      return data.map((row) => ({
        budget_id: row.budget_id ?? '',
        category_id: row.category_id ?? '',
        category_name: row.category_name ?? '',
        group_id: row.group_id,
        month: (row.month ?? '').slice(0, 10),
        planned_minor: row.planned_minor ?? 0,
        spent_minor: row.spent_minor ?? 0,
        left_minor: row.left_minor ?? 0,
      }));
    },
  });
}
