import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { pick } from '../../test/select';
import { CategoryDetailPage } from './CategoryDetailPage';

const useCategory = vi.fn();
const useCategoryMonths = vi.fn();
const useTopDescriptions = vi.fn();
const useTransactions = vi.fn();
const create = vi.fn();

const ID = '0a8f7b2e-1c3d-4e5f-8a9b-0c1d2e3f4a5b';
const THIS_MONTH = '2026-09-01';

const category = (over = {}) => ({
  id: ID,
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

vi.mock('./queries', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./queries')>();
  return {
    ...actual,
    useCategory: (id: string | undefined) => useCategory(id),
    useCategoryMonths: () => useCategoryMonths(),
    useTopDescriptions: () => useTopDescriptions(),
    useCategories: () => ({ data: [category()] }),
    useCategoryGroups: () => ({ data: [] }),
    useCategoryUsage: () => ({ data: [{ category_id: ID, kind: 'expense', last_used_at: null, use_count: 12 }] }),
  };
});

vi.mock('../budgets/queries', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../budgets/queries')>();
  return {
    ...actual,
    useBudgets: () => ({
      data: [
        {
          budget_id: 'b1',
          category_id: ID,
          category_name: 'Groceries',
          group_id: null,
          month: THIS_MONTH,
          planned_minor: 52000,
          spent_minor: 48260,
          left_minor: 3740,
        },
      ],
      isError: false,
    }),
    useBudgetHistory: () => ({ data: [], isError: false }),
  };
});

vi.mock('../transactions/queries', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../transactions/queries')>();
  return {
    ...actual,
    useTransactions: () => useTransactions(),
    useCreateTransaction: () => ({ mutateAsync: create, isPending: false }),
    useTransaction: () => ({ data: undefined }),
  };
});

vi.mock('../accounts/queries', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../accounts/queries')>();
  return {
    ...actual,
    useAccounts: () => ({
      data: [
        { account_id: 'acc-1', name: 'Everyday checking', archived_at: null },
        { account_id: 'acc-2', name: 'Blue card', archived_at: null },
      ],
    }),
  };
});

vi.mock('../../lib/profile', () => ({
  useCurrency: () => 'USD',
  useProfile: () => ({ data: { timezone: 'UTC' } }),
}));

vi.mock('../../lib/dates', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/dates')>();
  return { ...actual, monthStartInZone: () => THIS_MONTH, todayInZone: () => '2026-09-20' };
});

function renderPage(id = ID) {
  return render(
    <MemoryRouter initialEntries={[`/categories/${id}`]}>
      <Routes>
        <Route path="/categories/:id" element={<CategoryDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  create.mockReset().mockResolvedValue({ id: 'new' });
  useCategory.mockReturnValue({ data: category(), isSuccess: true, isError: false });
  useCategoryMonths.mockReturnValue({
    data: [
      { month: '2026-08-01', total_minor: 52330, txn_count: 9 },
      { month: THIS_MONTH, total_minor: 48260, txn_count: 7 },
    ],
    isError: false,
  });
  useTopDescriptions.mockReturnValue({
    data: [
      { description: 'Supermarket weekly shop', total_minor: 310480, txn_count: 52 },
      { description: 'Corner market', total_minor: 128430, txn_count: 96 },
    ],
    isError: false,
  });
  useTransactions.mockReturnValue({
    data: {
      rows: [
        {
          id: 't1',
          kind: 'expense',
          occurred_on: '2026-09-14',
          amount_minor: 18240,
          description: 'Groceries',
          category_id: ID,
          from_account_id: 'acc-1',
          to_account_id: null,
          status: 'cleared',
        },
      ],
      total: 1,
    },
    isError: false,
    isPlaceholderData: false,
  });
});

describe('CategoryDetailPage', () => {
  it('refuses an id that is not one', () => {
    renderPage('nonsense');
    expect(screen.getByText('This category doesn’t exist')).toBeInTheDocument();
    expect(useCategory).toHaveBeenCalledWith(undefined);
  });

  it('leads with this month against the plan, and links to the budget line', () => {
    renderPage();
    expect(screen.getByRole('heading', { level: 1, name: 'Groceries' })).toBeInTheDocument();
    expect(screen.getAllByText('$482.60').length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: /\$37\.40 left/ })).toHaveAttribute('href', `/budgets/2026-09/${ID}`);
  });

  it('has one table and no tabs, because a category holds one kind', () => {
    renderPage();
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    expect(screen.getByRole('table', { name: /Transactions in this category/ })).toBeInTheDocument();
  });

  it('adds a row with the kind and the category already decided', async () => {
    renderPage();
    const form = screen.getByRole('form', { name: 'Add an expense' });
    // Neither the kind nor the category is a choice here.
    expect(within(form).queryByRole('button', { name: /^Category,/ })).not.toBeInTheDocument();
    expect(within(form).getByText('Groceries')).toBeInTheDocument();

    await userEvent.type(within(form).getByLabelText('Amount'), '46.80');
    await pick('From account', 'Everyday checking');
    await userEvent.click(within(form).getByRole('button', { name: 'Add' }));

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'expense',
        category_id: ID,
        amount_minor: 4680,
        from_account_id: 'acc-1',
        to_account_id: null,
        // Left blank, the category names the row; nothing is filled in behind your back.
        description: 'Groceries',
      }),
    );
  });

  it('asks which account the money left, since a category has none', async () => {
    renderPage();
    const form = screen.getByRole('form', { name: 'Add an expense' });
    await userEvent.type(within(form).getByLabelText('Amount'), '46.80');
    await userEvent.click(within(form).getByRole('button', { name: 'Add' }));
    expect(create).not.toHaveBeenCalled();
    expect(await screen.findByText(/which account this came from/i)).toBeInTheDocument();
  });

  it('groups what it is spent on, without pretending to match loosely', () => {
    renderPage();
    expect(screen.getByText('Supermarket weekly shop')).toBeInTheDocument();
    expect(screen.getByText(/grouped on the exact description/i)).toBeInTheDocument();
  });
});
