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

export function useGoal(id: string | undefined) {
  return useQuery({
    queryKey: [...goalsKey, id],
    enabled: Boolean(id),
    queryFn: async (): Promise<GoalProgress | null> => {
      const { data, error } = await db().from('goal_progress').select('*').eq('goal_id', id!).maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        goal_id: data.goal_id ?? '',
        account_id: data.account_id ?? '',
        name: data.name ?? '',
        target_minor: data.target_minor,
        target_date: data.target_date,
        monthly_plan_minor: data.monthly_plan_minor,
        achieved_at: data.achieved_at,
        archived_at: data.archived_at,
        balance_minor: data.balance_minor ?? 0,
        remaining_minor: data.remaining_minor,
        this_month: data.this_month ?? '',
        this_month_contributed_minor: data.this_month_contributed_minor ?? 0,
      };
    },
  });
}


export type GoalMonth = { month: string; put_in_minor: number; taken_out_minor: number; closing_balance_minor: number };

// The goal month by month since its account began: what went in, what came
// out, and the balance at each month's end (goal_month_flow).
export function useGoalMonths(goalId: string | undefined) {
  return useQuery({
    queryKey: [...goalsKey, 'months', goalId],
    enabled: Boolean(goalId),
    queryFn: async (): Promise<GoalMonth[]> => {
      const { data, error } = await db()
        .from('goal_month_flow')
        .select('goal_id, month, put_in_minor, taken_out_minor, closing_balance_minor')
        .eq('goal_id', goalId!)
        .order('month', { ascending: true });
      if (error) throw error;
      return data
        .filter((row) => row.goal_id === goalId)
        .map((row) => ({
          month: (row.month ?? '').slice(0, 10),
          put_in_minor: row.put_in_minor ?? 0,
          taken_out_minor: row.taken_out_minor ?? 0,
          closing_balance_minor: row.closing_balance_minor ?? 0,
        }));
    },
  });
}

export type GoalPace = {
  // What a dated target needs each month from here; null without one.
  needed_monthly_minor: number | null;
  // The average put in over the 6 complete months before this one.
  avg_put_in_minor: number;
  months_put_in: number;
  // At that pace, when the target is reached; only from 3 or more months of it.
  estimated_month: string | null;
};

// One goal's pace, worked out in Postgres (goal_progress).
export function useGoalPace(goalId: string | undefined) {
  return useQuery({
    queryKey: [...goalsKey, 'pace', goalId],
    enabled: Boolean(goalId),
    queryFn: async (): Promise<GoalPace | null> => {
      const { data, error } = await db()
        .from('goal_progress')
        .select('goal_id, needed_monthly_minor, avg_put_in_minor, months_put_in, estimated_month')
        .eq('goal_id', goalId!)
        .limit(1);
      if (error) throw error;
      const row = data.find((r) => r.goal_id === goalId);
      if (!row) return null;
      return {
        // ?? null: a database without these columns yet leaves them out.
        needed_monthly_minor: row.needed_monthly_minor ?? null,
        avg_put_in_minor: row.avg_put_in_minor ?? 0,
        months_put_in: row.months_put_in ?? 0,
        estimated_month: row.estimated_month ? row.estimated_month.slice(0, 10) : null,
      };
    },
  });
}
