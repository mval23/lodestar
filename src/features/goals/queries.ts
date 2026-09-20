import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { db } from '../../lib/supabase';
import { accountsKey } from '../accounts/queries';
import type { Database } from '../../lib/database.types';

export type Goal = Database['public']['Tables']['goals']['Row'];
export type GoalInsert = Database['public']['Tables']['goals']['Insert'];
export type GoalUpdate = Database['public']['Tables']['goals']['Update'];

// Normalized from the view: its columns are all nullable in the generated
// types, though only the optional ones are ever actually null.
export type GoalProgress = {
  goal_id: string;
  account_id: string;
  name: string;
  target_minor: number | null;
  target_date: string | null;
  monthly_plan_minor: number | null;
  achieved_at: string | null;
  archived_at: string | null;
  balance_minor: number;
  remaining_minor: number | null;
  this_month: string;
  this_month_contributed_minor: number;
};

export const goalsKey = ['goals'] as const;

export function useGoals() {
  return useQuery({
    queryKey: goalsKey,
    queryFn: async (): Promise<GoalProgress[]> => {
      const { data, error } = await db().from('goal_progress').select('*').order('sort_order', { ascending: true });
      if (error) throw error;
      return data.map((row) => ({
        goal_id: row.goal_id ?? '',
        account_id: row.account_id ?? '',
        name: row.name ?? '',
        target_minor: row.target_minor,
        target_date: row.target_date,
        monthly_plan_minor: row.monthly_plan_minor,
        achieved_at: row.achieved_at,
        archived_at: row.archived_at,
        balance_minor: row.balance_minor ?? 0,
        remaining_minor: row.remaining_minor,
        this_month: row.this_month ?? '',
        this_month_contributed_minor: row.this_month_contributed_minor ?? 0,
      }));
    },
  });
}

function useInvalidateGoals() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: goalsKey });
    void queryClient.invalidateQueries({ queryKey: accountsKey });
  };
}

export function useCreateGoal() {
  const invalidate = useInvalidateGoals();
  return useMutation({
    mutationFn: async (values: GoalInsert): Promise<Goal> => {
      const { data, error } = await db().from('goals').insert(values).select('*').single();
      if (error) throw error;
      return data;
    },
    onSuccess: invalidate,
  });
}

export function useUpdateGoal() {
  const invalidate = useInvalidateGoals();
  return useMutation({
    mutationFn: async ({ id, changes }: { id: string; changes: GoalUpdate }): Promise<Goal> => {
      const { data, error } = await db().from('goals').update(changes).eq('id', id).select('*').single();
      if (error) throw error;
      return data;
    },
    onSuccess: invalidate,
  });
}

export function useDeleteGoal() {
  const invalidate = useInvalidateGoals();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db().from('goals').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export type GoalStanding = {
  // 0–100, clamped for the bar only; the numbers themselves are never clamped.
  share: number;
  reached: boolean;
  monthsLeft: number | null;
  neededPerMonth: number | null;
};

// What the goal asks of you, month by month. A target with a date turns into
// "this much a month"; without a date it is just a total to reach.
export function standingOf(goal: GoalProgress, today: string): GoalStanding {
  const target = goal.target_minor;
  const reached = target !== null && goal.balance_minor >= target;
  const share = target && target > 0 ? Math.min(100, Math.max(0, Math.round((goal.balance_minor / target) * 100))) : 0;

  let monthsLeft: number | null = null;
  let neededPerMonth: number | null = null;
  if (target !== null && goal.target_date) {
    const [ty, tm] = goal.target_date.split('-').map(Number);
    const [cy, cm] = today.split('-').map(Number);
    monthsLeft = ((ty ?? 0) - (cy ?? 0)) * 12 + ((tm ?? 0) - (cm ?? 0));
    const remaining = Math.max(0, target - goal.balance_minor);
    // A date in the past, or this month, means the whole remainder is due now.
    neededPerMonth = monthsLeft > 0 ? Math.ceil(remaining / monthsLeft) : remaining;
  }

  return { share, reached, monthsLeft, neededPerMonth };
}
