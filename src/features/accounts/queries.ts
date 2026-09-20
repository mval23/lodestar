import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { db } from '../../lib/supabase';
import type { Database } from '../../lib/database.types';

export type AccountType = Database['public']['Enums']['account_type'];
export type Account = Database['public']['Tables']['accounts']['Row'];

type AccountBalanceRow = Database['public']['Views']['account_balances']['Row'];

// The view's columns are all nullable in the generated types, because Postgres
// cannot prove otherwise through a view. Every one of them is in fact
// non-null, so the rows are normalized once, here, and the rest of the app
// works with a strict type instead of guarding on each read.
export type AccountBalance = {
  user_id: string;
  account_id: string;
  name: string;
  type: AccountType;
  is_liability: boolean;
  sort_order: number;
  archived_at: string | null;
  opening_balance_minor: number;
  money_in_minor: number;
  money_out_minor: number;
  balance_minor: number;
  cleared_balance_minor: number;
};

export function normalizeBalance(row: AccountBalanceRow): AccountBalance {
  return {
    user_id: row.user_id ?? '',
    account_id: row.account_id ?? '',
    name: row.name ?? '',
    type: row.type ?? 'other_asset',
    is_liability: row.is_liability ?? false,
    sort_order: row.sort_order ?? 0,
    archived_at: row.archived_at,
    opening_balance_minor: row.opening_balance_minor ?? 0,
    money_in_minor: row.money_in_minor ?? 0,
    money_out_minor: row.money_out_minor ?? 0,
    balance_minor: row.balance_minor ?? 0,
    cleared_balance_minor: row.cleared_balance_minor ?? 0,
  };
}
export type AccountInsert = Database['public']['Tables']['accounts']['Insert'];
export type AccountUpdate = Database['public']['Tables']['accounts']['Update'];

export const ACCOUNT_TYPES: { value: AccountType; label: string; hint: string }[] = [
  { value: 'checking', label: 'Checking', hint: 'Everyday money in a bank' },
  { value: 'savings', label: 'Savings', hint: 'Set aside, including funds behind a goal' },
  { value: 'credit_card', label: 'Credit card', hint: 'What you owe. Enter the balance as a negative amount' },
  { value: 'cash', label: 'Cash', hint: 'Notes and coins you hold' },
  { value: 'investment', label: 'Investment', hint: 'A balance you update by hand' },
  { value: 'loan', label: 'Loan', hint: 'What you owe. Enter the balance as a negative amount' },
  { value: 'other_asset', label: 'Other asset', hint: 'Anything else you own, such as money owed to you' },
];

export const LIABILITY_TYPES: AccountType[] = ['credit_card', 'loan'];

export function accountTypeLabel(type: AccountType): string {
  return ACCOUNT_TYPES.find((t) => t.value === type)?.label ?? type;
}

export const accountsKey = ['accounts'] as const;

// Balances come from the view, so the arithmetic happens in Postgres.
export function useAccounts() {
  return useQuery({
    queryKey: accountsKey,
    queryFn: async (): Promise<AccountBalance[]> => {
      const { data, error } = await db()
        .from('account_balances')
        .select('*')
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true });
      if (error) throw error;
      return data.map(normalizeBalance);
    },
  });
}

export function useAccount(id: string | undefined) {
  return useQuery({
    queryKey: [...accountsKey, id],
    enabled: Boolean(id),
    queryFn: async (): Promise<Account> => {
      const { data, error } = await db().from('accounts').select('*').eq('id', id!).single();
      if (error) throw error;
      return data;
    },
  });
}

function useInvalidateAccounts() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: accountsKey });
}

export function useCreateAccount() {
  const invalidate = useInvalidateAccounts();
  return useMutation({
    mutationFn: async (values: AccountInsert): Promise<Account> => {
      const { data, error } = await db().from('accounts').insert(values).select('*').single();
      if (error) throw error;
      return data;
    },
    onSuccess: invalidate,
  });
}

export function useUpdateAccount() {
  const invalidate = useInvalidateAccounts();
  return useMutation({
    mutationFn: async ({ id, changes }: { id: string; changes: AccountUpdate }): Promise<Account> => {
      const { data, error } = await db().from('accounts').update(changes).eq('id', id).select('*').single();
      if (error) throw error;
      return data;
    },
    onSuccess: invalidate,
  });
}

// Archiving keeps the history; only an account with no transactions can be
// deleted, and the database refuses the rest with a foreign-key error.
export function useArchiveAccount() {
  const invalidate = useInvalidateAccounts();
  return useMutation({
    mutationFn: async ({ id, archived }: { id: string; archived: boolean }) => {
      const { error } = await db()
        .from('accounts')
        .update({ archived_at: archived ? new Date().toISOString() : null })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export function useDeleteAccount() {
  const invalidate = useInvalidateAccounts();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db().from('accounts').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export type NetWorth = { assets: number; liabilities: number; net: number };

export function netWorthOf(accounts: AccountBalance[]): NetWorth {
  let assets = 0;
  let liabilities = 0;
  for (const account of accounts) {
    if (account.archived_at) continue;
    // Split by account type, exactly as net_worth_by_month does, so the
    // Overview figure and the report can never disagree.
    if (account.is_liability) liabilities += account.balance_minor;
    else assets += account.balance_minor;
  }
  return { assets, liabilities, net: assets + liabilities };
}
