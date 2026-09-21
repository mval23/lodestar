import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { BudgetLinePage } from './BudgetLinePage';

const useBudgets = vi.fn();
const useCategory = vi.fn();
const setBudget = vi.fn();

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

vi.mock('./queries', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./queries')>();
  return {
    ...actual,
    useBudgets: () => useBudgets(),
    useBudgetHistory: () => ({ data: [], isError: false }),
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
  };
});

vi.mock('../transactions/queries', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../transactions/queries')>();
  return {
    ...actual,
    useTransactions: () => ({ data: { rows: [], total: 0 }, isError: false, isPlaceholderData: false }),
    useCreateTransaction: () => ({ mutateAsync: vi.fn(), isPending: false }),
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
});

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
    expect(screen.getByText('Left this month')).toBeInTheDocument();
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

  it('states the pace without grading it', () => {
    renderPage();
    // 482.60 over 18 days, carried to a 30-day month.
    expect(screen.getByText(/At this rate, about/)).toBeInTheDocument();
    expect(screen.getByText(/over the plan/)).toBeInTheDocument();
  });
});
