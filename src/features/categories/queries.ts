import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { db } from '../../lib/supabase';
import type { Database } from '../../lib/database.types';

export type CategoryKind = Database['public']['Enums']['category_kind'];
export type Category = Database['public']['Tables']['categories']['Row'];
export type CategoryGroup = Database['public']['Tables']['category_groups']['Row'];
// Normalized from the view, whose columns are all nullable in the generated
// types even though none of them are null in practice.
export type CategoryUsage = {
  category_id: string;
  kind: CategoryKind;
  last_used_at: string | null;
  use_count: number;
};

export const categoriesKey = ['categories'] as const;
export const categoryGroupsKey = ['category_groups'] as const;
export const categoryUsageKey = ['category_usage'] as const;

export function useCategories() {
  return useQuery({
    queryKey: categoriesKey,
    queryFn: async (): Promise<Category[]> => {
      const { data, error } = await db()
        .from('categories')
        .select('*')
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true });
      if (error) throw error;
      return data;
    },
  });
}

export function useCategoryGroups() {
  return useQuery({
    queryKey: categoryGroupsKey,
    queryFn: async (): Promise<CategoryGroup[]> => {
      const { data, error } = await db()
        .from('category_groups')
        .select('*')
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true });
      if (error) throw error;
      return data;
    },
  });
}

// Pickers are ordered by recent use, so the categories you actually reach for
// are the ones at the top.
export function useCategoryUsage() {
  return useQuery({
    queryKey: categoryUsageKey,
    queryFn: async (): Promise<CategoryUsage[]> => {
      const { data, error } = await db().from('category_usage').select('*');
      if (error) throw error;
      return data.map((row) => ({
        category_id: row.category_id ?? '',
        kind: row.kind ?? 'expense',
        last_used_at: row.last_used_at,
        use_count: row.use_count ?? 0,
      }));
    },
  });
}

export function sortForPicker(categories: Category[], usage: CategoryUsage[] | undefined): Category[] {
  const byId = new Map((usage ?? []).map((u) => [u.category_id, u]));
  return [...categories].sort((a, b) => {
    const aUsed = byId.get(a.id)?.last_used_at ?? '';
    const bUsed = byId.get(b.id)?.last_used_at ?? '';
    if (aUsed !== bUsed) return aUsed < bUsed ? 1 : -1;
    return a.name.localeCompare(b.name);
  });
}

function useInvalidateCategories() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: categoriesKey });
    void queryClient.invalidateQueries({ queryKey: categoryGroupsKey });
  };
}

export function useCreateCategory() {
  const invalidate = useInvalidateCategories();
  return useMutation({
    mutationFn: async (values: Database['public']['Tables']['categories']['Insert']): Promise<Category> => {
      const { data, error } = await db().from('categories').insert(values).select('*').single();
      if (error) throw error;
      return data;
    },
    onSuccess: invalidate,
  });
}

export function useUpdateCategory() {
  const invalidate = useInvalidateCategories();
  return useMutation({
    mutationFn: async ({
      id,
      changes,
    }: {
      id: string;
      changes: Database['public']['Tables']['categories']['Update'];
    }): Promise<Category> => {
      const { data, error } = await db().from('categories').update(changes).eq('id', id).select('*').single();
      if (error) throw error;
      return data;
    },
    onSuccess: invalidate,
  });
}

export function useDeleteCategory() {
  const invalidate = useInvalidateCategories();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db().from('categories').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export function useCreateCategoryGroup() {
  const invalidate = useInvalidateCategories();
  return useMutation({
    mutationFn: async (name: string): Promise<CategoryGroup> => {
      const { data, error } = await db().from('category_groups').insert({ name }).select('*').single();
      if (error) throw error;
      return data;
    },
    onSuccess: invalidate,
  });
}

// merge_categories moves transactions and budgets across, sums any budgets
// that collide, and deletes the source, all in one database transaction.
export function useMergeCategories() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ source, target }: { source: string; target: string }): Promise<number> => {
      const { data, error } = await db().rpc('merge_categories', {
        p_source_id: source,
        p_target_id: target,
      });
      if (error) throw error;
      return data ?? 0;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: categoriesKey });
      void queryClient.invalidateQueries({ queryKey: categoryUsageKey });
      void queryClient.invalidateQueries({ queryKey: ['transactions'] });
    },
  });
}

// ---------------------------------------------------------------------------
// The category page. Totals sit under transactionsKey, so any change to the
// ledger refreshes them.
// ---------------------------------------------------------------------------

export function useCategory(id: string | undefined) {
  return useQuery({
    queryKey: [...categoriesKey, id],
    enabled: Boolean(id),
    queryFn: async (): Promise<Category | null> => {
      const { data, error } = await db().from('categories').select('*').eq('id', id!).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export type CategoryMonth = { month: string; total_minor: number; txn_count: number };

// Months with activity only; the page fills quiet months with zero for the chart.
export function useCategoryMonths(id: string | undefined, from: string) {
  return useQuery({
    queryKey: ['transactions', 'category-months', id, from],
    enabled: Boolean(id),
    queryFn: async (): Promise<CategoryMonth[]> => {
      const { data, error } = await db()
        .from('category_month_totals')
        .select('month, total_minor, txn_count')
        .eq('category_id', id!)
        .gte('month', from)
        .order('month', { ascending: true });
      if (error) throw error;
      return data.map((row) => ({
        month: (row.month ?? '').slice(0, 10),
        total_minor: row.total_minor ?? 0,
        txn_count: row.txn_count ?? 0,
      }));
    },
  });
}

// Every month's total for the category, for "last 12 months" and a typical month.
export function useCategoryMonthTotals(from: string, to: string) {
  return useQuery({
    queryKey: ['transactions', 'category-month-totals', from, to],
    queryFn: async () => {
      const { data, error } = await db()
        .from('category_month_totals')
        .select('category_id, kind, month, total_minor, txn_count')
        .gte('month', from)
        .lte('month', to);
      if (error) throw error;
      return data.map((row) => ({
        category_id: row.category_id ?? '',
        kind: row.kind ?? 'expense',
        month: (row.month ?? '').slice(0, 10),
        total_minor: row.total_minor ?? 0,
        txn_count: row.txn_count ?? 0,
      }));
    },
  });
}

export type TopDescription = { description: string; total_minor: number; txn_count: number };

export function useTopDescriptions(id: string | undefined, from: string, to: string, limit = 5) {
  return useQuery({
    queryKey: ['transactions', 'top-descriptions', id, from, to, limit],
    enabled: Boolean(id),
    queryFn: async (): Promise<TopDescription[]> => {
      const { data, error } = await db().rpc('category_top_descriptions', {
        p_category_id: id!,
        p_from: from,
        p_to: to,
        p_limit: limit,
      });
      if (error) throw error;
      return (data ?? []).map((row) => ({
        description: row.description,
        total_minor: row.total_minor,
        txn_count: row.txn_count,
      }));
    },
  });
}
