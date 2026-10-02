import { useHasTransactions, useProfile } from '../../lib/profile';
import { monthStartInZone } from '../../lib/dates';
import { useAccounts } from '../accounts/queries';
import { useBills } from '../bills/queries';
import { useBudgets } from '../budgets/queries';
import { useCategories } from '../categories/queries';
import { useGoals } from '../goals/queries';

// The setup walkthrough, in the order a new person meets it: where they stand
// today, what money is for, what comes round on a schedule, this month's
// plan, what they're saving for, and the first expense. Only the accounts are
// needed to go on; every other step can be skipped and come back to.
export const STEPS = [
  {
    slug: 'accounts',
    label: 'Accounts',
    title: 'Where you stand today',
    lead: 'Add each account you want to keep track of, with what it holds today. For a card or a loan, enter what you owe.',
  },
  {
    slug: 'categories',
    label: 'Categories',
    title: 'What your money is for',
    lead: 'A category is what money was spent on or came in from. Pick a few to start; you can rename, group or add more any time.',
  },
  {
    slug: 'bills',
    label: 'Bills',
    title: 'What comes round regularly',
    lead: 'Rent, phone, streaming: anything paid on a schedule. Lodestar shows what’s due, and Mark as paid records it for you.',
  },
  {
    slug: 'budgets',
    label: 'Budget',
    title: 'Plan this month',
    lead: 'Type an amount beside each category you want to keep an eye on. Leave the rest blank.',
  },
  {
    slug: 'goals',
    label: 'Goals',
    title: 'What you’re saving for',
    lead: 'A goal keeps its money in an account of its own, such as a savings account. What you move into that account counts towards it.',
  },
  {
    slug: 'expense',
    label: 'First expense',
    title: 'Record your first expense',
    lead: 'Add something you spent recently. From here on, add expenses as they happen, or import a CSV from your bank.',
  },
] as const;

export type StepSlug = (typeof STEPS)[number]['slug'];

export function isStepSlug(value: string | undefined): value is StepSlug {
  return STEPS.some((step) => step.slug === value);
}

export type SetupProgress = {
  isPending: boolean;
  done: Record<StepSlug, boolean>;
  doneCount: number;
  // The first step not yet done, or null once every step is.
  next: StepSlug | null;
};

// Whether a step is done is read from the data itself, never stored: an
// account exists, a category exists, this month has a plan, and so on. So
// the walkthrough agrees with the rest of the app however a row got there.
export function useSetupProgress(): SetupProgress {
  const profile = useProfile();
  const month = monthStartInZone(profile.data?.timezone);
  const accounts = useAccounts();
  const categories = useCategories();
  const bills = useBills();
  const budgets = useBudgets(month);
  const goals = useGoals();
  const hasTransactions = useHasTransactions();

  const done: Record<StepSlug, boolean> = {
    accounts: (accounts.data ?? []).some((a) => !a.archived_at),
    categories: (categories.data ?? []).some((c) => !c.archived_at),
    bills: (bills.data ?? []).some((b) => !b.archived_at),
    budgets: (budgets.data ?? []).length > 0,
    goals: (goals.data ?? []).some((g) => !g.archived_at),
    expense: hasTransactions.data === true,
  };

  return {
    isPending:
      accounts.isPending ||
      categories.isPending ||
      bills.isPending ||
      budgets.isPending ||
      goals.isPending ||
      hasTransactions.isPending,
    done,
    doneCount: STEPS.filter((step) => done[step.slug]).length,
    next: STEPS.find((step) => !done[step.slug])?.slug ?? null,
  };
}
