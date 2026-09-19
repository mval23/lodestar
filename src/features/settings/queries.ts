import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { db } from '../../lib/supabase';
import type { Database } from '../../lib/database.types';

export type Profile = Database['public']['Tables']['profiles']['Row'];
export type ProfileUpdate = Pick<Profile, 'display_name' | 'currency' | 'timezone' | 'week_start'>;

export const profileKey = ['profile'] as const;

export function useProfile() {
  return useQuery({
    queryKey: profileKey,
    queryFn: async () => {
      // RLS returns only the caller's own row.
      const { data, error } = await db().from('profiles').select('*').single();
      if (error) throw error;
      return data;
    },
  });
}

// Currency can change only before the first transaction (trigger
// profiles_currency_lock). The UI mirrors the rule; the database enforces it.
export function useHasTransactions() {
  return useQuery({
    queryKey: ['transactions', 'exists'],
    queryFn: async () => {
      const { count, error } = await db().from('transactions').select('id', { count: 'exact', head: true });
      if (error) throw error;
      return (count ?? 0) > 0;
    },
  });
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, changes }: { id: string; changes: Partial<ProfileUpdate> }) => {
      // Send only the columns the person changed; the grant is column-level.
      const { data, error } = await db().from('profiles').update(changes).eq('id', id).select('*').single();
      if (error) throw error;
      return data;
    },
    onSuccess: (profile) => queryClient.setQueryData(profileKey, profile),
  });
}
