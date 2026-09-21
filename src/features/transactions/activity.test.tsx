import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { ActivityPage } from './ActivityPage';
import type { Transaction } from './queries';

// Synthetic data only.
const useTransactions = vi.fn();
const phone = vi.fn();

vi.mock('./queries', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./queries')>();
  return { ...actual, useTransactions: (...args: unknown[]) => useTransactions(...args) };
});

vi.mock('../../lib/media', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/media')>();
  return { ...actual, useMediaQuery: () => phone() };
});

vi.mock('../accounts/queries', () => ({
  useAccounts: () => ({
    data: [
      { account_id: 'chk', name: 'Everyday checking', archived_at: null },
      { account_id: 'sav', name: 'Emergency fund', archived_at: null },
    ],
  }),
}));

vi.mock('../categories/queries', () => ({
  useCategories: () => ({ data: [{ id: 'groceries', name: 'Groceries', kind: 'expense', archived_at: null }] }),
}));

vi.mock('../../lib/profile', () => ({
  useCurrency: () => 'USD',
  useProfile: () => ({ data: { timezone: 'UTC' } }),
}));

// The sheet is its own subject; here it only has to say what it opened.
vi.mock('./TransactionSheet', () => ({
  TransactionSheet: ({ transaction }: { transaction?: Transaction }) => (
    <p>Editing {transaction?.description ?? 'a new transaction'}</p>
  ),
}));

const TODAY = new Date().toISOString().slice(0, 10);
const yesterday = () => {
  const d = new Date(`${TODAY}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
};

function txn(over: Partial<Transaction>): Transaction {
  return {
    id: 't',
    user_id: 'u1',
    kind: 'expense',
    occurred_on: TODAY,
    amount_minor: 4550,
    from_account_id: 'chk',
    to_account_id: null,
    category_id: 'groceries',
    category_kind: 'expense',
    description: 'Market',
    notes: null,
    recurring_item_id: null,
    import_batch_id: null,
    source_ref: null,
    created_at: '',
    updated_at: '',
    ...over,
  } as Transaction;
}

const ROWS = [
  txn({ id: 'a', description: 'Market' }),
  txn({
    id: 'b',
    kind: 'transfer',
    description: 'Emergency fund',
    occurred_on: yesterday(),
    amount_minor: 50000,
    from_account_id: 'chk',
    to_account_id: 'sav',
    category_id: null,
    category_kind: null,
  }),
];

function show() {
  render(
    <MemoryRouter>
      <ActivityPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  useTransactions.mockReturnValue({ data: { rows: ROWS, total: 2 }, isPending: false, isError: false, isSuccess: true });
});

describe('ActivityPage on a phone', () => {
  beforeEach(() => phone.mockReturnValue(true));

  it('lists transactions under their day, not in a table', () => {
    show();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Today' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Yesterday' })).toBeInTheDocument();
  });

  // The phone table used to drop the account columns, so a transfer read
  // "Emergency fund $500.00" with nowhere it came from or went.
  it('says where a transfer went, and what an expense was for and paid from', () => {
    show();
    expect(screen.getByText('Everyday checking → Emergency fund')).toBeInTheDocument();
    expect(screen.getByText('Groceries · Everyday checking')).toBeInTheDocument();
  });

  it('opens a transaction from anywhere on its row', async () => {
    show();
    await userEvent.click(screen.getByRole('button', { name: /^Market/ }));
    expect(screen.getByText('Editing Market')).toBeInTheDocument();
  });

  it('asks for a shorter page than a wide screen does', () => {
    show();
    expect(useTransactions).toHaveBeenLastCalledWith(expect.anything(), 25);
  });
});

describe('ActivityPage on a wide screen', () => {
  beforeEach(() => phone.mockReturnValue(false));

  it('keeps the table, with its category and account columns', () => {
    show();
    const table = screen.getByRole('table');
    expect(within(table).getByRole('columnheader', { name: 'Account' })).toBeInTheDocument();
    expect(useTransactions).toHaveBeenLastCalledWith(expect.anything(), 50);
  });
});
