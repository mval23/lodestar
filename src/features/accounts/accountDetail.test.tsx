import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { pick } from '../../test/select';
import { AccountDetailPage, totalsByKind } from './AccountDetailPage';
import type { AccountBalance, AccountMonth, LedgerEntry } from './queries';

const useAccountBalance = vi.fn();
const useAccountMonths = vi.fn();
const useAccountLedger = vi.fn();
const create = vi.fn();

const ID = '0a8f7b2e-1c3d-4e5f-8a9b-0c1d2e3f4a5b';
const OTHER = '11111111-2222-4333-8444-555555555555';

function balance(over: Partial<AccountBalance> = {}): AccountBalance {
  return {
    user_id: 'u1',
    account_id: ID,
    name: 'Everyday checking',
    type: 'checking',
    is_liability: false,
    sort_order: 0,
    archived_at: null,
    opening_balance_minor: 0,
    money_in_minor: 5842000,
    money_out_minor: 5420165,
    balance_minor: 421835,
    cleared_balance_minor: 411835,
    ...over,
  };
}

function month(over: Partial<AccountMonth> = {}): AccountMonth {
  return {
    month: '2026-09-01',
    income_minor: 0,
    income_count: 0,
    expense_minor: 0,
    expense_count: 0,
    transfer_in_minor: 0,
    transfer_in_count: 0,
    transfer_out_minor: 0,
    transfer_out_count: 0,
    net_minor: 0,
    closing_balance_minor: 421835,
    ...over,
  };
}

function entry(over: Partial<LedgerEntry> = {}): LedgerEntry {
  return {
    transaction_id: 't1',
    kind: 'expense',
    status: 'cleared',
    occurred_on: '2026-09-18',
    signed_amount_minor: -145000,
    description: 'Rent',
    category_id: 'cat-housing',
    from_account_id: ID,
    to_account_id: null,
    balance_after_minor: 421835,
    ...over,
  };
}

vi.mock('./queries', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./queries')>();
  return {
    ...actual,
    useAccountBalance: (id: string | undefined) => useAccountBalance(id),
    useAccountMonths: () => useAccountMonths(),
    useAccountLedger: (id: string, kind: string) => useAccountLedger(id, kind),
    useAccount: () => ({ data: undefined }),
    useAccounts: () => ({
      data: [balance(), balance({ account_id: OTHER, name: 'Emergency savings', type: 'savings' })],
    }),
    useArchiveAccount: () => ({ mutateAsync: vi.fn(), isPending: false }),
  };
});

vi.mock('../transactions/queries', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../transactions/queries')>();
  return {
    ...actual,
    useCreateTransaction: () => ({ mutateAsync: create, isPending: false }),
    useTransaction: () => ({ data: undefined }),
  };
});

vi.mock('../categories/queries', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../categories/queries')>();
  return {
    ...actual,
    useCategories: () => ({
      data: [
        { id: 'cat-housing', name: 'Housing', kind: 'expense', group_id: null, archived_at: null },
        { id: 'cat-pay', name: 'Pay', kind: 'income', group_id: null, archived_at: null },
      ],
    }),
    useCategoryUsage: () => ({ data: [] }),
  };
});

vi.mock('../goals/queries', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../goals/queries')>();
  return { ...actual, useGoals: () => ({ data: [] }) };
});

vi.mock('../bills/queries', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../bills/queries')>();
  return { ...actual, useBills: () => ({ data: [] }) };
});

vi.mock('../../lib/profile', () => ({
  useCurrency: () => 'USD',
  useProfile: () => ({ data: { timezone: 'UTC' } }),
}));

function renderPage(id = ID) {
  return render(
    <MemoryRouter initialEntries={[`/accounts/${id}`]}>
      <Routes>
        <Route path="/accounts/:id" element={<AccountDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  create.mockReset().mockResolvedValue({ id: 'new' });
  useAccountBalance.mockReturnValue({ data: balance(), isSuccess: true, isError: false });
  useAccountMonths.mockReturnValue({
    data: [
      month({ month: '2026-08-01', income_minor: 291000, income_count: 1, closing_balance_minor: 300000 }),
      month({
        month: '2026-09-01',
        expense_minor: 145000,
        expense_count: 1,
        transfer_out_minor: 40000,
        transfer_out_count: 1,
      }),
    ],
    isError: false,
  });
  useAccountLedger.mockReturnValue({ data: { rows: [entry()], total: 1 }, isError: false });
});

describe('totalsByKind', () => {
  it('adds up the months the view already summed, and keeps transfers apart', () => {
    const totals = totalsByKind([
      month({ income_minor: 291000, income_count: 1, expense_minor: 18240, expense_count: 2 }),
      month({ transfer_in_minor: 5000, transfer_in_count: 1, transfer_out_minor: 40000, transfer_out_count: 3 }),
    ]);
    expect(totals.income).toEqual({ total: 291000, count: 1 });
    expect(totals.expense).toEqual({ total: 18240, count: 2 });
    expect(totals.transfer).toEqual({ in: 5000, out: 40000, count: 4 });
  });
});

describe('AccountDetailPage', () => {
  it('refuses an id that is not one, without asking the database', () => {
    renderPage('not-an-id');
    expect(screen.getByText('This account doesn’t exist')).toBeInTheDocument();
    expect(useAccountBalance).toHaveBeenCalledWith(undefined);
  });

  it('shows the same "Not found" for an account that is not yours', () => {
    // RLS returns no row, exactly as it does for one that never existed.
    useAccountBalance.mockReturnValue({ data: null, isSuccess: true, isError: false });
    renderPage();
    expect(screen.getByText('This account doesn’t exist')).toBeInTheDocument();
  });

  it('leads with the balance and splits the totals by kind across the tabs', () => {
    renderPage();
    expect(screen.getByRole('heading', { level: 1, name: 'Everyday checking' })).toBeInTheDocument();
    expect(screen.getAllByText('$4,218.35').length).toBeGreaterThan(0);
    expect(screen.getAllByText('$4,118.35', { exact: false }).length).toBeGreaterThan(0);

    const tabs = screen.getByRole('tablist', { name: 'Activity by kind' });
    expect(within(tabs).getByRole('tab', { name: /Income/ })).toHaveTextContent('$2,910.00');
    expect(within(tabs).getByRole('tab', { name: /Expenses/ })).toHaveTextContent('$1,450.00');
    expect(within(tabs).getByRole('tab', { name: /Transfers/ })).toHaveTextContent('$400.00 out');
  });

  it('opens on expenses and moves to another kind', async () => {
    renderPage();
    expect(screen.getByRole('tab', { name: /Expenses/ })).toHaveAttribute('aria-selected', 'true');
    await userEvent.click(screen.getByRole('tab', { name: /Income/ }));
    expect(screen.getByRole('tab', { name: /Income/ })).toHaveAttribute('aria-selected', 'true');
    expect(useAccountLedger).toHaveBeenCalledWith(ID, 'income');
  });

  it('moves between tabs with the arrow keys', async () => {
    renderPage();
    screen.getByRole('tab', { name: /Expenses/ }).focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: /Transfers/ })).toHaveAttribute('aria-selected', 'true');
  });

  it('shows each entry with the balance after it', () => {
    renderPage();
    const table = screen.getByRole('table', { name: /Expenses on this account/ });
    expect(within(table).getByText('Rent')).toBeInTheDocument();
    expect(within(table).getByText('Housing')).toBeInTheDocument();
    expect(within(table).getByText('−$1,450.00')).toBeInTheDocument();
  });

  it('adds an expense that leaves this account, with no second account to choose', async () => {
    renderPage();
    const form = screen.getByRole('form', { name: 'Add an expense' });
    await userEvent.type(within(form).getByLabelText('Description'), 'Groceries');
    await userEvent.type(within(form).getByLabelText('Amount'), '18.24');
    await userEvent.click(within(form).getByRole('button', { name: 'Add' }));

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'expense',
        amount_minor: 1824,
        from_account_id: ID,
        to_account_id: null,
        description: 'Groceries',
      }),
    );
  });

  it('adds income that arrives in this account', async () => {
    renderPage();
    await userEvent.click(screen.getByRole('tab', { name: /Income/ }));
    const form = screen.getByRole('form', { name: 'Add income' });
    await userEvent.type(within(form).getByLabelText('Amount'), '2910');
    await pick('Category', 'Pay');
    await userEvent.click(within(form).getByRole('button', { name: 'Add' }));

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'income', to_account_id: ID, from_account_id: null, category_id: 'cat-pay' }),
    );
  });

  it('writes a transfer in the direction chosen, and never gives it a category', async () => {
    renderPage();
    await userEvent.click(screen.getByRole('tab', { name: /Transfers/ }));
    const form = screen.getByRole('form', { name: 'Add a transfer' });
    expect(within(form).queryByRole('button', { name: /^Category,/ })).not.toBeInTheDocument();
    await userEvent.type(within(form).getByLabelText('Amount'), '400');
    await pick('Other account', 'To Emergency savings');
    await userEvent.click(within(form).getByRole('button', { name: 'Add' }));

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'transfer',
        from_account_id: ID,
        to_account_id: OTHER,
        category_id: null,
      }),
    );
  });

  it('explains a transfer with no other account instead of saving it', async () => {
    renderPage();
    await userEvent.click(screen.getByRole('tab', { name: /Transfers/ }));
    const form = screen.getByRole('form', { name: 'Add a transfer' });
    await userEvent.type(within(form).getByLabelText('Amount'), '400');
    await userEvent.click(within(form).getByRole('button', { name: 'Add' }));

    expect(create).not.toHaveBeenCalled();
    expect(await screen.findByText(/which account the money went into/i)).toBeInTheDocument();
  });

  it('refuses an amount it would have to round', async () => {
    renderPage();
    const form = screen.getByRole('form', { name: 'Add an expense' });
    await userEvent.type(within(form).getByLabelText('Amount'), '10.005');
    await userEvent.click(within(form).getByRole('button', { name: 'Add' }));
    expect(create).not.toHaveBeenCalled();
    expect(await screen.findByText(/at most 2 decimal places/)).toBeInTheDocument();
  });

  it('calls a liability what it is', () => {
    useAccountBalance.mockReturnValue({
      data: balance({ type: 'credit_card', is_liability: true, balance_minor: -31000, cleared_balance_minor: -31000 }),
      isSuccess: true,
      isError: false,
    });
    renderPage();
    expect(screen.getByText('Owed')).toBeInTheDocument();
    // The figure stays negative rather than being flipped to read nicely.
    expect(screen.getAllByText('−$310.00').length).toBeGreaterThan(0);
  });
});
