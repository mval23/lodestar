import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { pick } from '../../test/select';
import { MonthPage } from './MonthPage';

const useMonthSummary = vi.fn();
const useTransactions = vi.fn();
const create = vi.fn();

const THIS_MONTH = '2026-09-01';

const update = vi.hoisted(() => vi.fn());

vi.mock('./queries', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./queries')>();
  return {
    ...actual,
    useMonthSummary: (month: string) => useMonthSummary(month),
    useMonthAccounts: () => ({
      data: [
        {
          account_id: 'acc-1',
          month: THIS_MONTH,
          income_minor: 491000,
          income_count: 2,
          expense_minor: 213240,
          expense_count: 20,
          transfer_in_minor: 0,
          transfer_in_count: 0,
          transfer_out_minor: 40000,
          transfer_out_count: 1,
          net_minor: 277760,
          closing_balance_minor: 421835,
        },
      ],
      isError: false,
    }),
  };
});

vi.mock('../transactions/queries', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../transactions/queries')>();
  return {
    ...actual,
    useTransactions: (filters: { kind: string }) => useTransactions(filters),
    useLargestExpense: () => ({ data: { description: 'Rent', occurred_on: '2026-09-18', amount_minor: 145000 } }),
    useCreateTransaction: () => ({ mutateAsync: create, isPending: false }),
    useUpdateTransaction: () => ({ mutateAsync: update, isPending: false }),
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
        { account_id: 'acc-2', name: 'Emergency savings', archived_at: null },
      ],
    }),
  };
});

vi.mock('../categories/queries', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../categories/queries')>();
  return {
    ...actual,
    useCategories: () => ({ data: [{ id: 'cat-housing', name: 'Housing', kind: 'expense', archived_at: null }] }),
    useCategoryUsage: () => ({ data: [] }),
    useCategoryMonthTotals: () => ({
      data: [{ category_id: 'cat-housing', kind: 'expense', month: THIS_MONTH, total_minor: 145000, txn_count: 1 }],
      isError: false,
    }),
  };
});

vi.mock('../bills/queries', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../bills/queries')>();
  return { ...actual, useBills: () => ({ data: [] }) };
});

vi.mock('../../lib/profile', () => ({
  useCurrency: () => 'USD',
  useProfile: () => ({ data: { timezone: 'UTC' } }),
}));

vi.mock('../../lib/dates', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/dates')>();
  return { ...actual, monthStartInZone: () => THIS_MONTH, todayInZone: () => '2026-09-20' };
});

function renderPage(param = '2026-09') {
  return render(
    <MemoryRouter initialEntries={[`/months/${param}`]}>
      <Routes>
        <Route path="/months/:month" element={<MonthPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

const transfer = {
  id: 't9',
  kind: 'transfer',
  occurred_on: '2026-09-15',
  amount_minor: 40000,
  description: 'To Emergency fund',
  category_id: null,
  from_account_id: 'acc-1',
  to_account_id: 'acc-2',
};

beforeEach(() => {
  create.mockReset().mockResolvedValue({ id: 'new' });
  useMonthSummary.mockReturnValue({
    data: {
      month: THIS_MONTH,
      income_minor: 491000,
      income_count: 2,
      expense_minor: 362540,
      expense_count: 44,
      transfer_minor: 40000,
      transfer_count: 1,
      to_goals_minor: 40000,
      net_minor: 128460,
    },
    isError: false,
  });
  useTransactions.mockReturnValue({ data: { rows: [transfer], total: 1 }, isError: false, isPlaceholderData: false });
});

describe('MonthPage', () => {
  it('refuses a month that is not one', () => {
    renderPage('2026-13');
    expect(screen.getByText('This month doesn’t exist')).toBeInTheDocument();
  });

  it('leads with the net, leaving transfers out of it', () => {
    renderPage();
    expect(screen.getByRole('heading', { level: 1, name: 'September 2026' })).toBeInTheDocument();
    expect(screen.getAllByText('$1,284.60').length).toBeGreaterThan(0);
    expect(screen.getByText(/transfers left out/)).toBeInTheDocument();
    expect(screen.getAllByText('$400.00').length).toBeGreaterThan(0);
  });

  it('carries each kind of total on its tab', () => {
    renderPage();
    const tabs = screen.getByRole('tablist', { name: /by kind/ });
    expect(within(tabs).getByRole('tab', { name: /Income/ })).toHaveTextContent('$4,910.00');
    expect(within(tabs).getByRole('tab', { name: /Expenses/ })).toHaveTextContent('$3,625.40');
    expect(within(tabs).getByRole('tab', { name: /Transfers/ })).toHaveTextContent('$400.00');
    expect(within(tabs).getByRole('tab', { name: /Expenses/ })).toHaveTextContent('44 rows');
  });

  it('asks the query for the kind on the chosen tab, within the month', async () => {
    renderPage();
    await userEvent.click(screen.getByRole('tab', { name: /Transfers/ }));
    expect(useTransactions).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'transfer', from: '2026-09-01', to: '2026-09-30' }),
    );
  });

  it('shows a transfer without a sign, because the month only moved it', async () => {
    renderPage();
    await userEvent.click(screen.getByRole('tab', { name: /Transfers/ }));
    const table = screen.getByRole('table', { name: /Transfers this month/ });
    expect(within(table).getAllByText('$400.00').length).toBeGreaterThan(0);
    expect(within(table).queryByText('−$400.00')).not.toBeInTheDocument();
    expect(within(table).getByText('Everyday checking → Emergency savings')).toBeInTheDocument();
  });

  it('asks for both accounts when adding a transfer, since a month has none', async () => {
    renderPage();
    await userEvent.click(screen.getByRole('tab', { name: /Transfers/ }));
    const form = screen.getByRole('form', { name: 'Add a transfer' });
    await userEvent.type(within(form).getByLabelText('Amount'), '400');
    await pick('From account', 'Everyday checking');
    await pick('To account', 'Emergency savings');
    await userEvent.click(within(form).getByRole('button', { name: 'Add' }));

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'transfer',
        from_account_id: 'acc-1',
        to_account_id: 'acc-2',
        category_id: null,
        occurred_on: '2026-09-20',
      }),
    );
  });

  it('refuses a transfer that would move money to the same account', async () => {
    renderPage();
    await userEvent.click(screen.getByRole('tab', { name: /Transfers/ }));
    const form = screen.getByRole('form', { name: 'Add a transfer' });
    await userEvent.type(within(form).getByLabelText('Amount'), '400');
    await pick('From account', 'Everyday checking');
    await pick('To account', 'Everyday checking');
    await userEvent.click(within(form).getByRole('button', { name: 'Add' }));
    expect(create).not.toHaveBeenCalled();
    expect(await screen.findByText(/two different accounts/i)).toBeInTheDocument();
  });

  it('walks to the month either side', () => {
    renderPage();
    expect(screen.getByRole('link', { name: /Previous month/ })).toHaveAttribute('href', '/months/2026-08');
    expect(screen.getByRole('link', { name: /Next month/ })).toHaveAttribute('href', '/months/2026-10');
  });
});
