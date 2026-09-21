import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { db } from '../../lib/supabase';
import { accountsKey } from '../accounts/queries';
import { categoryUsageKey } from '../categories/queries';
import type { Database } from '../../lib/database.types';

export type TxnKind = Database['public']['Enums']['txn_kind'];
export type Transaction = Database['public']['Tables']['transactions']['Row'];
export type TransactionInsert = Database['public']['Tables']['transactions']['Insert'];
export type TransactionUpdate = Database['public']['Tables']['transactions']['Update'];

export const PAGE_SIZE = 50;

export type Filters = {
  search: string;
  kind: TxnKind | 'all';
  accountId: string | 'all';
  categoryId: string | 'all';
  from: string;
  to: string;
  sort: 'occurred_on' | 'amount_minor';
  direction: 'asc' | 'desc';
  page: number;
};

export const DEFAULT_FILTERS: Filters = {
  search: '',
  kind: 'all',
  accountId: 'all',
  categoryId: 'all',
  from: '',
  to: '',
  sort: 'occurred_on',
  direction: 'desc',
  page: 1,
};

// PostgREST reads commas, parentheses and dots as syntax inside or=(...),
// so a search term is stripped of them rather than escaped.
export function sanitizeSearch(term: string): string {
  return term.replace(/[,()\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
}

export const transactionsKey = ['transactions'] as const;

export type Page = { rows: Transaction[]; total: number };

// A phone asks for shorter pages than a wide screen; the size is part of the
// key, so the two never share a cached page.
export function useTransactions(filters: Filters, pageSize: number = PAGE_SIZE) {
  return useQuery({
    queryKey: [...transactionsKey, filters, pageSize],
    queryFn: async (): Promise<Page> => {
      let query = db().from('transactions').select('*', { count: 'exact' });

      const search = sanitizeSearch(filters.search);
      if (search) query = query.or(`description.ilike.%${search}%,notes.ilike.%${search}%`);
      if (filters.kind !== 'all') query = query.eq('kind', filters.kind);
      // An account matches whether the money left it or arrived in it.
      if (filters.accountId !== 'all') {
        query = query.or(`from_account_id.eq.${filters.accountId},to_account_id.eq.${filters.accountId}`);
      }
      if (filters.categoryId !== 'all') query = query.eq('category_id', filters.categoryId);
      if (filters.from) query = query.gte('occurred_on', filters.from);
      if (filters.to) query = query.lte('occurred_on', filters.to);

      const ascending = filters.direction === 'asc';
      query = query.order(filters.sort, { ascending }).order('id', { ascending });

      const start = (filters.page - 1) * pageSize;
      const { data, error, count } = await query.range(start, start + pageSize - 1);
      if (error) throw error;
      return { rows: data, total: count ?? 0 };
    },
    placeholderData: (previous) => previous,
  });
}

// Every write moves money, so balances and picker order go stale with it.
function useInvalidateLedger() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: transactionsKey });
    void queryClient.invalidateQueries({ queryKey: accountsKey });
    void queryClient.invalidateQueries({ queryKey: categoryUsageKey });
  };
}

export function useCreateTransaction() {
  const invalidate = useInvalidateLedger();
  return useMutation({
    mutationFn: async (values: TransactionInsert): Promise<Transaction> => {
      const { data, error } = await db().from('transactions').insert(values).select('*').single();
      if (error) throw error;
      return data;
    },
    onSuccess: invalidate,
  });
}

export function useUpdateTransaction() {
  const invalidate = useInvalidateLedger();
  return useMutation({
    mutationFn: async ({ id, changes }: { id: string; changes: TransactionUpdate }): Promise<Transaction> => {
      const { data, error } = await db().from('transactions').update(changes).eq('id', id).select('*').single();
      if (error) throw error;
      return data;
    },
    onSuccess: invalidate,
  });
}

export function useDeleteTransaction() {
  const invalidate = useInvalidateLedger();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db().from('transactions').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

// The direction rule, mirrored from the CHECK constraint so the sheet can
// explain the problem before the database refuses the row.
export function directionProblem(values: {
  kind: TxnKind;
  from_account_id: string | null;
  to_account_id: string | null;
}): string | undefined {
  const { kind, from_account_id: from, to_account_id: to } = values;
  if (kind === 'expense') {
    if (!from) return 'Choose which account this came from.';
    if (to) return 'An expense leaves one account. Record a move between accounts as a transfer.';
  }
  if (kind === 'income') {
    if (!to) return 'Choose which account this went into.';
    if (from) return 'Income arrives in one account. Record a move between accounts as a transfer.';
  }
  if (kind === 'transfer') {
    if (!from) return 'Choose which account the money left.';
    if (!to) return 'Choose which account the money went into.';
    if (from === to) return 'Choose two different accounts.';
  }
  return undefined;
}

// One transaction, for editing a row that came from a view with fewer columns.
export function useTransaction(id: string | undefined) {
  return useQuery({
    queryKey: [...transactionsKey, 'one', id],
    enabled: Boolean(id),
    queryFn: async (): Promise<Transaction | null> => {
      const { data, error } = await db().from('transactions').select('*').eq('id', id!).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

// The largest expense in a date range, for the month page.
export function useLargestExpense(from: string, to: string) {
  return useQuery({
    queryKey: [...transactionsKey, 'largest-expense', from, to],
    queryFn: async (): Promise<Transaction | null> => {
      const { data, error } = await db()
        .from('transactions')
        .select('*')
        .eq('kind', 'expense')
        .gte('occurred_on', from)
        .lte('occurred_on', to)
        .order('amount_minor', { ascending: false })
        .order('occurred_on', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}
