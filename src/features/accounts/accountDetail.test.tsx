import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { pick } from '../../test/select';
import { AccountDetailPage } from './AccountDetailPage';
import type { AccountBalance, AccountMonth, AccountSummary, LedgerEntry, OutflowLine } from './queries';

const useAccountBalance = vi.fn();
const useAccountSummary = vi.fn();
const useAccountOutflows = vi.fn();
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
    include_in_net_worth: true,
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

// Synthetic figures, as account_summary would return them for Jun – Aug.
function summary(over: Partial<AccountSummary> = {}): AccountSummary {
  return {
    months: 3,
    income_minor: 1530000,
    expense_minor: 1050000,
    transfer_in_minor: 175091,
    transfer_out_minor: 594000,
    in_minor: 1705091,
    out_minor: 1644000,
    avg_in_minor: 568364,
    avg_out_minor: 548000,
    avg_income_minor: 510000,
    avg_expense_minor: 350000,
    avg_transfer_in_minor: 58364,
    avg_transfer_out_minor: 198000,
    balance_minor: 421835,
    month_end_on: '2026-08-31',
    since_month_end_minor: -218078,
    year_ago_on: '2025-09-30',
    since_year_ago_minor: -12828,
    lowest_minor: 286513,
    lowest_on: '2026-09-12',
    payments_left: null,
    ...over,
  };
}

const line = (over: Partial<OutflowLine>): OutflowLine => ({
  line: 'category',
  category_id: null,
  to_account_id: null,
  account_type: null,
  name: '',
  out_minor: 0,
  txn_count: 1,
  total_out_minor: 1644000,
  ...over,
});

const update = vi.hoisted(() => vi.fn());

vi.mock('./queries', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./queries')>();
  return {
    ...actual,
    useAccountBalance: (id: string | undefined) => useAccountBalance(id),
    useAccountMonths: () => useAccountMonths(),
    useAccountLedger: (id: string, kind: string) => useAccountLedger(id, kind),
    useAccountSummary: (id: string, from: string, to: string) => useAccountSummary(id, from, to),
    useAccountOutflows: (id: string, from: string, to: string) => useAccountOutflows(id, from, to),
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
    useUpdateTransaction: () => ({ mutateAsync: update, isPending: false }),
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
  useAccountSummary.mockReturnValue({ data: summary(), isError: false });
  useAccountOutflows.mockReturnValue({
    data: [
      line({ line: 'account', name: 'Visa card', account_type: 'credit_card', to_account_id: OTHER, out_minor: 565465 }),
      line({ name: 'Rent', category_id: 'cat-housing', out_minor: 495000 }),
      line({ line: 'goals', name: 'Into goals', out_minor: 375000 }),
      line({ line: 'account', name: 'Wallet', account_type: 'cash', to_account_id: OTHER, out_minor: 30000 }),
      line({ name: 'No category', out_minor: 178535 }),
    ],
    isError: false,
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

  it('leads with the balance, and names the kinds in its tabs without totals', () => {
    renderPage();
    expect(screen.getByRole('heading', { level: 1, name: 'Everyday checking' })).toBeInTheDocument();
    expect(screen.getAllByText('$4,218.35').length).toBeGreaterThan(0);
    // One balance, not two: there is no cleared figure to sit beside it.
    expect(screen.queryByText(/\bcleared\b|\bpending\b/i)).not.toBeInTheDocument();

    const tabs = screen.getByRole('tablist', { name: 'Activity by kind' });
    // The figures above already say how much moved; the tabs only choose.
    expect(within(tabs).getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['Income', 'Expenses', 'Transfers']);
  });

  it('gives the period’s typical month, the changes since month ends, and the lowest balance', () => {
    renderPage();
    const band = screen.getByRole('region', { name: 'This account' });
    expect(band).toHaveTextContent(/−\$2,180\.78.*since Aug 31.*−\$128\.28.*since Sep 30, 2025/);
    expect(within(band).getByText('In, a typical month').closest('.fig-cell')).toHaveTextContent('$5,683.64');
    expect(within(band).getByText('Out, a typical month').closest('.fig-cell')).toHaveTextContent('$5,480.00');
    expect(within(band).getByText('Lowest, last 90 days').closest('.fig-cell')).toHaveTextContent(/\$2,865\.13.*Sep 12, 2026/);
    // What stands out, from the same figures.
    expect(screen.getByText(/Everyday checking is/).closest('.stands-out')).toHaveTextContent(/\$2,180\.78.*lower than at Aug 31.*stayed above \$2,865\.13/);
  });

  it('says where the money goes, transfers named for where they went and tagged', async () => {
    renderPage();
    const goes = screen.getByRole('region', { name: 'Where it goes' });
    const rows = within(goes).getAllByRole('row').slice(1).map((r) => r.querySelector('th')?.textContent);
    expect(rows).toEqual(['Visa card payments · transfer', 'Rent', 'Into goals · transfer', 'Cash to Wallet · transfer', 'No category']);
    expect(within(goes).getByText('Rent').closest('tr')).toHaveTextContent(/\$4,950\.00.*30\.1%/);
    expect(goes).toHaveTextContent(/\$16,440\.00/);
    // The period moves both the typical months and where it goes.
    await userEvent.click(screen.getByRole('radio', { name: '12 months' }));
    expect(useAccountOutflows).toHaveBeenLastCalledWith(ID, expect.any(String), expect.any(String));
    const [, from, to] = useAccountOutflows.mock.lastCall as [string, string, string];
    expect((Number(to.slice(0, 4)) - Number(from.slice(0, 4))) * 12 + Number(to.slice(5, 7)) - Number(from.slice(5, 7))).toBe(12);
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
    expect(within(table).getByRole('button', { name: 'Category of “Rent”, Housing' })).toBeInTheDocument();
    expect(within(table).getByText('−$1,450.00')).toBeInTheDocument();
  });

  describe('editing in place, like a spreadsheet', () => {
    beforeEach(() => update.mockReset().mockResolvedValue({}));

    it('saves an amount typed into its cell, in integer minor units', async () => {
      renderPage();
      await userEvent.click(screen.getByRole('button', { name: 'Amount, 1450.00. Edit' }));
      const input = within(screen.getByRole('table', { name: /on this account/ })).getByRole('textbox', { name: 'Amount' });
      expect(input).toHaveValue('1450.00');
      await userEvent.clear(input);
      await userEvent.type(input, '1,500.25{Enter}');
      expect(update).toHaveBeenCalledWith({ id: 't1', changes: { amount_minor: 150025 } });
      // What was typed shows at once, before the refreshed rows arrive.
      expect(screen.getByText('−$1,500.25')).toBeInTheDocument();
    });

    it('moves to the next cell with Tab, saving the one it leaves', async () => {
      renderPage();
      await userEvent.click(screen.getByRole('button', { name: 'Description, Rent. Edit' }));
      const description = within(screen.getByRole('table', { name: /on this account/ })).getByRole('textbox', { name: 'Description' });
      await userEvent.clear(description);
      await userEvent.type(description, 'Rent, September');
      await userEvent.tab();
      expect(update).toHaveBeenCalledWith({ id: 't1', changes: { description: 'Rent, September' } });
      expect(within(screen.getByRole('table', { name: /on this account/ })).getByRole('textbox', { name: 'Amount' })).toHaveFocus();
    });

    it('puts a cell back with Escape, and writes nothing', async () => {
      renderPage();
      await userEvent.click(screen.getByRole('button', { name: 'Description, Rent. Edit' }));
      const description = within(screen.getByRole('table', { name: /on this account/ })).getByRole('textbox', { name: 'Description' });
      await userEvent.clear(description);
      await userEvent.type(description, 'Something else{Escape}');
      expect(update).not.toHaveBeenCalled();
      expect(screen.getByRole('button', { name: 'Description, Rent. Edit' })).toBeInTheDocument();
    });

    it('writes nothing when a cell is left as it was', async () => {
      renderPage();
      await userEvent.click(screen.getByRole('button', { name: 'Amount, 1450.00. Edit' }));
      await userEvent.keyboard('{Enter}');
      expect(update).not.toHaveBeenCalled();
    });

    it('keeps the editor open and says why when an amount can’t be saved', async () => {
      renderPage();
      await userEvent.click(screen.getByRole('button', { name: 'Amount, 1450.00. Edit' }));
      const input = within(screen.getByRole('table', { name: /on this account/ })).getByRole('textbox', { name: 'Amount' });
      await userEvent.clear(input);
      await userEvent.type(input, '10.005{Enter}');
      expect(update).not.toHaveBeenCalled();
      expect(screen.getByRole('alert')).toHaveTextContent('Enter at most 2 decimal places.');
      expect(within(screen.getByRole('table', { name: /on this account/ })).getByRole('textbox', { name: 'Amount' })).toHaveAttribute('aria-invalid', 'true');
    });

    it('still opens the full form for accounts, notes and deleting', async () => {
      renderPage();
      expect(screen.getByRole('button', { name: 'Open “Rent” in the full form' })).toBeInTheDocument();
    });
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
      data: balance({ type: 'credit_card', is_liability: true, balance_minor: -31000 }),
      isSuccess: true,
      isError: false,
    });
    useAccountSummary.mockReturnValue({ data: summary({ balance_minor: -31000, lowest_minor: -138948 }), isError: false });
    renderPage();
    expect(screen.getByText('Owed')).toBeInTheDocument();
    // The figure stays negative rather than being flipped to read nicely.
    expect(screen.getAllByText('−$310.00').length).toBeGreaterThan(0);
    const band = screen.getByRole('region', { name: 'This account' });
    expect(within(band).getByText('Purchases, a typical month').closest('.fig-cell')).toHaveTextContent('$3,500.00');
    expect(within(band).getByText('Most owed, last 90 days').closest('.fig-cell')).toHaveTextContent('−$1,389.48');
  });

  it('estimates when a loan is paid off, and says interest isn’t separated', () => {
    useAccountBalance.mockReturnValue({
      data: balance({ type: 'loan', is_liability: true, balance_minor: -556000 }),
      isSuccess: true,
      isError: false,
    });
    useAccountSummary.mockReturnValue({ data: summary({ balance_minor: -556000, avg_transfer_in_minor: 38500, payments_left: 15 }), isError: false });
    renderPage();
    const cell = screen.getByText(/Paid off around/).closest('.fig-cell');
    expect(cell).toHaveTextContent(/Estimate/);
    expect(cell).toHaveTextContent(/15 more payments at that amount; interest isn’t separated/);
  });
});
