import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { BudgetLinePage } from './BudgetLinePage';

const useBudgets = vi.fn();
const useCategory = vi.fn();
const setBudget = vi.fn();
const useBudgetHistory = vi.fn();
const useCategoryStats = vi.fn();

const CAT = '0a8f7b2e-1c3d-4e5f-8a9b-0c1d2e3f4a5b';
const THIS_MONTH = '2026-09-01';

const category = (over = {}) => ({
  id: CAT,
  user_id: 'u1',
  group_id: null,
  name: 'Groceries',
  kind: 'expense',
  sort_order: 0,
  archived_at: null,
  source_ref: null,
  created_at: '',
  updated_at: '',
  ...over,
});

const line = (over = {}) => ({
  budget_id: 'b1',
  category_id: CAT,
  category_name: 'Groceries',
  group_id: null,
  month: THIS_MONTH,
  planned_minor: 52000,
  spent_minor: 48260,
  left_minor: 3740,
  ...over,
});

const update = vi.hoisted(() => vi.fn());

vi.mock('./queries', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./queries')>();
  return {
    ...actual,
    useBudgets: () => useBudgets(),
    useBudgetHistory: () => useBudgetHistory(),
    useSetBudget: () => ({ mutateAsync: setBudget, isPending: false }),
  };
});

vi.mock('../categories/queries', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../categories/queries')>();
  return {
    ...actual,
    useCategory: (id: string | undefined) => useCategory(id),
    useCategoryGroups: () => ({ data: [] }),
    useCategoryMonths: () => ({ data: [{ month: THIS_MONTH, total_minor: 48260, txn_count: 5 }], isError: false }),
    useCategories: () => ({ data: [category()] }),
    useCategoryUsage: () => ({ data: [] }),
    useCategoryStats: () => useCategoryStats(),
  };
});

vi.mock('../months/queries', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../months/queries')>();
  return {
    ...actual,
    useDailySpending: () => ({
      data: Array.from({ length: 30 }, (_, i) => ({
        day: `2026-09-${String(i + 1).padStart(2, '0')}`,
        day_of_month: i + 1,
        spent_minor: 0,
        running_minor: i < 18 ? 48260 : 48260,
        typical_running_minor: 0,
        typical_months: 6,
        after_today: i + 1 > 18,
      })),
    }),
  };
});

vi.mock('../overview/queries', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../overview/queries')>();
  return {
    ...actual,
    // Plan 520.00 by day 18 of 30: 312.00 on pace; 482.60 spent, so 170.60 ahead.
    useBudgetPace: () => ({
      data: [
        {
          budget_id: 'b1', category_id: CAT, category_name: 'Groceries', group_id: null, month: THIS_MONTH,
          planned_minor: 52000, spent_minor: 48260, bills_month_minor: 0, bills_due_minor: 0, pace_minor: 31200,
          gap_minor: 17060, days_left: 12, per_day_minor: 311, status: 'ahead',
        },
      ],
    }),
  };
});

vi.mock('../transactions/queries', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../transactions/queries')>();
  return {
    ...actual,
    useTransactions: () => ({ data: { rows: [], total: 0 }, isError: false, isPlaceholderData: false }),
    useCreateTransaction: () => ({ mutateAsync: vi.fn(), isPending: false }),
    useUpdateTransaction: () => ({ mutateAsync: update, isPending: false }),
    useTransaction: () => ({ data: undefined }),
  };
});

vi.mock('../accounts/queries', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../accounts/queries')>();
  return { ...actual, useAccounts: () => ({ data: [{ account_id: 'acc-1', name: 'Everyday checking', archived_at: null }] }) };
});

vi.mock('../../lib/profile', () => ({
  useCurrency: () => 'USD',
  useProfile: () => ({ data: { timezone: 'UTC' } }),
}));

vi.mock('../../lib/dates', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/dates')>();
  return { ...actual, monthStartInZone: () => THIS_MONTH, todayInZone: () => '2026-09-18' };
});

function renderPage(month = '2026-09', categoryId = CAT) {
  return render(
    <MemoryRouter initialEntries={[`/budgets/${month}/${categoryId}`]}>
      <Routes>
        <Route path="/budgets/:month/:categoryId" element={<BudgetLinePage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  setBudget.mockReset().mockResolvedValue(undefined);
  useCategory.mockReturnValue({ data: category(), isSuccess: true, isError: false });
  useBudgets.mockReturnValue({ data: [line()], isError: false });
  useBudgetHistory.mockReturnValue({ data: [], isError: false });
  useCategoryStats.mockReturnValue({ data: { typical_minor: 51000, months: 11 }, isError: false });
});

const plan = (month: string, planned: number, spent: number) => ({ ...line(), month, planned_minor: planned, spent_minor: spent, left_minor: planned - spent });

describe('BudgetLinePage', () => {
  it('refuses a month that is not one', () => {
    renderPage('2026-99');
    expect(screen.getByText('This budget line doesn’t exist')).toBeInTheDocument();
  });

  it('refuses an income category, because budgets plan expenses', () => {
    useCategory.mockReturnValue({ data: category({ kind: 'income' }), isSuccess: true, isError: false });
    renderPage();
    expect(screen.getByText('This budget line doesn’t exist')).toBeInTheDocument();
  });

  it('leads with what is left', () => {
    renderPage();
    expect(screen.getByText('Left to spend')).toBeInTheDocument();
    expect(screen.getAllByText('$37.40').length).toBeGreaterThan(0);
  });

  it('says "Over plan by" instead of clamping at zero', () => {
    useBudgets.mockReturnValue({ data: [line({ spent_minor: 80430, left_minor: -28430 })], isError: false });
    renderPage();
    expect(screen.getByText('Over plan by')).toBeInTheDocument();
    expect(screen.getAllByText('$284.30').length).toBeGreaterThan(0);
  });

  it('treats a month with no plan as a state, not an error', () => {
    useBudgets.mockReturnValue({ data: [], isError: false });
    renderPage();
    expect(screen.getByText('Spent this month')).toBeInTheDocument();
    expect(screen.getByText('No plan yet. Set one below.')).toBeInTheDocument();
    // Spending still shows: it comes from the category's own total, not the
    // budget row, which does not exist.
    expect(screen.getAllByText('$482.60').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Save plan' })).toBeInTheDocument();
  });

  it('sets a plan for this month only', async () => {
    useBudgets.mockReturnValue({ data: [], isError: false });
    renderPage();
    await userEvent.type(screen.getByLabelText('Set a plan'), '520');
    await userEvent.click(screen.getByRole('button', { name: 'Save plan' }));
    expect(setBudget).toHaveBeenCalledWith({
      budgetId: undefined,
      categoryId: CAT,
      month: THIS_MONTH,
      amountMinor: 52000,
    });
  });

  it('gives what is left a day, as Postgres worked it out', () => {
    renderPage();
    const band = screen.getByRole('region', { name: 'This budget line' });
    // 37.40 left over 12 days.
    expect(band).toHaveTextContent(/\$3\.11.*a day/);
    expect(band).toHaveTextContent('for the 12 days left');
    expect(band).toHaveTextContent(/\$170\.60.*ahead of pace/);
  });

  it('suggests the usual amount as a plan only when the plan keeps missing, and only on a tap', async () => {
    useBudgetHistory.mockReturnValue({
      data: [plan('2026-05-01', 52000, 56000), plan('2026-06-01', 52000, 58000), plan('2026-07-01', 52000, 50000), plan('2026-08-01', 52000, 61000)],
      isError: false,
    });
    useCategoryStats.mockReturnValue({ data: { typical_minor: 57500, months: 11 }, isError: false });
    renderPage();
    expect(screen.getByText(/over plan in 3 of 4 months/)).toBeInTheDocument();
    expect(setBudget).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: /Use .*\$575\.00 for September/ }));
    expect(setBudget).toHaveBeenCalledWith({ budgetId: 'b1', categoryId: CAT, month: THIS_MONTH, amountMinor: 57500 });
  });

  it('suggests nothing when most months land within the plan', () => {
    useBudgetHistory.mockReturnValue({
      data: [plan('2026-06-01', 52000, 50000), plan('2026-07-01', 52000, 49000), plan('2026-08-01', 52000, 61000)],
      isError: false,
    });
    renderPage();
    expect(screen.getByText(/no change suggested/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Use / })).not.toBeInTheDocument();
  });
});
