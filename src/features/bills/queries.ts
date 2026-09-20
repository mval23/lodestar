import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { db } from '../../lib/supabase';
import { accountsKey } from '../accounts/queries';
import { categoryUsageKey } from '../categories/queries';
import { transactionsKey } from '../transactions/queries';
import type { Database } from '../../lib/database.types';

export type RecurringItem = Database['public']['Tables']['recurring_items']['Row'];
export type RecurringInsert = Database['public']['Tables']['recurring_items']['Insert'];
export type RecurringUpdate = Database['public']['Tables']['recurring_items']['Update'];
export type RecurringLabel = Database['public']['Enums']['recurring_label'];
export type CadenceUnit = Database['public']['Enums']['cadence_unit'];
export type TxnKind = Database['public']['Enums']['txn_kind'];

export const billsKey = ['recurring_items'] as const;

// The label and the kind are tied together by a CHECK constraint: a
// subscription is always an expense, income is always income, and a transfer
// is always a transfer. Only a bill can be either an expense or a transfer.
export const LABELS: { value: RecurringLabel; label: string; kinds: TxnKind[]; hint: string }[] = [
  { value: 'bill', label: 'Bill', kinds: ['expense', 'transfer'], hint: 'Rent, utilities, anything due on a date' },
  { value: 'subscription', label: 'Subscription', kinds: ['expense'], hint: 'A recurring charge you could cancel' },
  { value: 'income', label: 'Income', kinds: ['income'], hint: 'Pay, a pension, anything arriving' },
  { value: 'transfer', label: 'Transfer', kinds: ['transfer'], hint: 'A standing move between your accounts' },
];

export function kindForLabel(label: RecurringLabel, current: TxnKind): TxnKind {
  const allowed = LABELS.find((l) => l.value === label)?.kinds ?? ['expense'];
  return allowed.includes(current) ? current : allowed[0]!;
}

export const CADENCES: { value: CadenceUnit; label: string; every: string }[] = [
  { value: 'week', label: 'Weekly', every: 'weeks' },
  { value: 'month', label: 'Monthly', every: 'months' },
  { value: 'year', label: 'Yearly', every: 'years' },
];

export function describeSchedule(unit: CadenceUnit, interval: number): string {
  const cadence = CADENCES.find((c) => c.value === unit);
  if (!cadence) return '';
  if (interval === 1) return cadence.label;
  return `Every ${interval} ${cadence.every}`;
}

export function useBills() {
  return useQuery({
    queryKey: billsKey,
    queryFn: async (): Promise<RecurringItem[]> => {
      const { data, error } = await db()
        .from('recurring_items')
        .select('*')
        .order('next_due_on', { ascending: true });
      if (error) throw error;
      return data;
    },
  });
}

function useInvalidateBills() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: billsKey });
    void queryClient.invalidateQueries({ queryKey: transactionsKey });
    void queryClient.invalidateQueries({ queryKey: accountsKey });
    void queryClient.invalidateQueries({ queryKey: categoryUsageKey });
  };
}

export function useCreateBill() {
  const invalidate = useInvalidateBills();
  return useMutation({
    mutationFn: async (values: RecurringInsert): Promise<RecurringItem> => {
      const { data, error } = await db().from('recurring_items').insert(values).select('*').single();
      if (error) throw error;
      return data;
    },
    onSuccess: invalidate,
  });
}

export function useUpdateBill() {
  const invalidate = useInvalidateBills();
  return useMutation({
    mutationFn: async ({ id, changes }: { id: string; changes: RecurringUpdate }): Promise<RecurringItem> => {
      const { data, error } = await db().from('recurring_items').update(changes).eq('id', id).select('*').single();
      if (error) throw error;
      return data;
    },
    onSuccess: invalidate,
  });
}

export function useDeleteBill() {
  const invalidate = useInvalidateBills();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db().from('recurring_items').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export type PaidResult = { transaction_id: string; next_due_on: string };

// Recording the payment and moving the due date are one database
// transaction: if the transaction cannot be written, the due date does not
// move, so a bill is never quietly marked paid without the money to match.
export function useMarkBillPaid() {
  const invalidate = useInvalidateBills();
  return useMutation({
    mutationFn: async ({
      id,
      paidOn,
      amountMinor,
    }: {
      id: string;
      paidOn?: string;
      amountMinor?: number;
    }): Promise<PaidResult> => {
      const args: { p_item_id: string; p_paid_on?: string; p_amount_minor?: number } = { p_item_id: id };
      if (paidOn) args.p_paid_on = paidOn;
      if (amountMinor !== undefined) args.p_amount_minor = amountMinor;
      const { data, error } = await db().rpc('mark_bill_paid', args);
      if (error) throw error;
      const result = Array.isArray(data) ? data[0] : data;
      if (!result) throw new Error('Marking the bill paid returned nothing.');
      return result as PaidResult;
    },
    onSuccess: invalidate,
  });
}

export type DueState = 'overdue' | 'today' | 'soon' | 'later';

export function dueStateOf(nextDueOn: string, today: string): DueState {
  if (nextDueOn < today) return 'overdue';
  if (nextDueOn === today) return 'today';
  // "Soon" is the next seven days, which is how far ahead a week's planning
  // actually reaches.
  const due = Date.parse(`${nextDueOn}T00:00:00Z`);
  const now = Date.parse(`${today}T00:00:00Z`);
  return due - now <= 7 * 86_400_000 ? 'soon' : 'later';
}

export function describeDue(nextDueOn: string, today: string): string {
  const state = dueStateOf(nextDueOn, today);
  if (state === 'today') return 'Due today';
  const days = Math.round(
    (Date.parse(`${nextDueOn}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000,
  );
  if (state === 'overdue') {
    const late = Math.abs(days);
    return late === 1 ? 'Overdue by 1 day' : `Overdue by ${late} days`;
  }
  return days === 1 ? 'Due tomorrow' : `Due in ${days} days`;
}
