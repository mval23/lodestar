import { useHasTransactions, useProfile } from '../../lib/profile';
import { formatMonth, monthStartInZone } from '../../lib/dates';
import { useAccounts } from '../accounts/queries';
import { useBills } from '../bills/queries';
import { useBudgets } from '../budgets/queries';
import { useCategories } from '../categories/queries';
import { useGoals } from '../goals/queries';

// How far along someone is, read from their data rather than stored: the tour
// asks what exists, so it agrees with every page however a row got there.
export type TourProgress = {
  accounts: number;
  categories: number;
  expenseCategories: number;
  bills: number;
  budgets: number;
  goals: number;
  hasTransactions: boolean;
  monthLabel: string;
  existing: Set<string>;
};

export const categoryKey = (kind: string, name: string) => `${kind}:${name.trim().toLowerCase()}`;

export function useTourProgress(): TourProgress {
  const profile = useProfile();
  const month = monthStartInZone(profile.data?.timezone);
  const accounts = useAccounts();
  const categories = useCategories();
  const bills = useBills();
  const budgets = useBudgets(month);
  const goals = useGoals();
  const hasTransactions = useHasTransactions();

  const allCategories = categories.data ?? [];
  const activeCategories = allCategories.filter((c) => !c.archived_at);
  return {
    accounts: (accounts.data ?? []).filter((a) => !a.archived_at).length,
    categories: activeCategories.length,
    expenseCategories: activeCategories.filter((c) => c.kind === 'expense').length,
    bills: (bills.data ?? []).filter((b) => !b.archived_at).length,
    budgets: (budgets.data ?? []).length,
    goals: (goals.data ?? []).filter((g) => !g.archived_at).length,
    hasTransactions: hasTransactions.data === true,
    monthLabel: formatMonth(month),
    // Names are unique per kind, archived or not.
    existing: new Set(allCategories.map((c) => categoryKey(c.kind, c.name))),
  };
}
