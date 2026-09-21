import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { pick } from '../../test/select';
import { directionProblem, sanitizeSearch } from './queries';
import { TransactionSheet } from './TransactionSheet';

const create = vi.fn();
const update = vi.fn();

vi.mock('./queries', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./queries')>();
  return {
    ...actual,
    useCreateTransaction: () => ({ mutateAsync: create, isPending: false }),
    useUpdateTransaction: () => ({ mutateAsync: update, isPending: false }),
    useDeleteTransaction: () => ({ mutateAsync: vi.fn(), isPending: false }),
  };
});

vi.mock('../accounts/queries', () => ({
  useAccounts: () => ({
    data: [
      { account_id: 'chk', name: 'Everyday checking', archived_at: null },
      { account_id: 'sav', name: 'Emergency fund', archived_at: null },
    ],
  }),
  accountsKey: ['accounts'],
}));

vi.mock('../categories/queries', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../categories/queries')>();
  return {
    ...actual,
    useCategories: () => ({
      data: [
        { id: 'groceries', name: 'Groceries', kind: 'expense', archived_at: null },
        { id: 'salary', name: 'Salary', kind: 'income', archived_at: null },
      ],
    }),
    useCategoryUsage: () => ({ data: [] }),
  };
});

vi.mock('../../lib/profile', () => ({ useCurrency: () => 'USD' }));

beforeEach(() => {
  create.mockReset().mockResolvedValue({ id: 't1' });
  update.mockReset().mockResolvedValue({ id: 't1' });
});

describe('sanitizeSearch', () => {
  it('strips the characters PostgREST reads as syntax', () => {
    expect(sanitizeSearch('coffee, (beans)')).toBe('coffee beans');
    expect(sanitizeSearch('  rent  ')).toBe('rent');
    expect(sanitizeSearch('a'.repeat(200))).toHaveLength(80);
  });
});

describe('directionProblem', () => {
  it('mirrors the database rule for each kind', () => {
    expect(directionProblem({ kind: 'expense', from_account_id: 'chk', to_account_id: null })).toBeUndefined();
    expect(directionProblem({ kind: 'expense', from_account_id: null, to_account_id: null })).toMatch(/came from/);
    expect(directionProblem({ kind: 'income', from_account_id: null, to_account_id: 'chk' })).toBeUndefined();
    expect(directionProblem({ kind: 'income', from_account_id: null, to_account_id: null })).toMatch(/went into/);
    expect(directionProblem({ kind: 'transfer', from_account_id: 'chk', to_account_id: 'sav' })).toBeUndefined();
    expect(directionProblem({ kind: 'transfer', from_account_id: 'chk', to_account_id: null })).toMatch(/went into/);
    expect(directionProblem({ kind: 'transfer', from_account_id: 'chk', to_account_id: 'chk' })).toMatch(/two different/);
  });
});

function renderSheet() {
  render(
    <MemoryRouter>
      <TransactionSheet onClose={vi.fn()} />
    </MemoryRouter>,
  );
}

describe('TransactionSheet', () => {
  it('asks for the amount before anything else', async () => {
    renderSheet();
    expect(screen.getByText('Enter an amount.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Add transaction' }));
    expect(create).not.toHaveBeenCalled();
  });

  it('saves an expense as a positive amount leaving one account', async () => {
    renderSheet();
    await userEvent.type(screen.getByLabelText('Amount'), '45.50');
    await pick('Account', 'Everyday checking');
    await pick('Category', 'Groceries');
    await userEvent.type(screen.getByLabelText('Description'), 'Market');
    await userEvent.click(screen.getByRole('button', { name: 'Add transaction' }));

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'expense',
        amount_minor: 4550,
        from_account_id: 'chk',
        to_account_id: null,
        category_id: 'groceries',
        description: 'Market',
      }),
    );
  });

  it('offers income categories for income, not expense ones', async () => {
    renderSheet();
    await userEvent.click(screen.getByRole('radio', { name: 'Income' }));
    await userEvent.click(screen.getByRole('button', { name: /^Category,/ }));
    const list = await screen.findByRole('listbox', { name: 'Category' });
    expect(within(list).getByRole('option', { name: 'Salary' })).toBeInTheDocument();
    expect(within(list).queryByRole('option', { name: 'Groceries' })).not.toBeInTheDocument();
  });

  it('records a transfer between two accounts and never files it under a category', async () => {
    renderSheet();
    await userEvent.click(screen.getByRole('radio', { name: 'Transfer' }));
    expect(screen.queryByRole('button', { name: /^Category,/ })).not.toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('Amount'), '500');
    await pick('From', 'Everyday checking');
    await pick('To', 'Emergency fund');
    await userEvent.type(screen.getByLabelText('Description'), 'To fund');
    await userEvent.click(screen.getByRole('button', { name: 'Add transaction' }));

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'transfer',
        amount_minor: 50000,
        from_account_id: 'chk',
        to_account_id: 'sav',
        category_id: null,
      }),
    );
  });

  it('refuses a transfer that goes nowhere', async () => {
    renderSheet();
    await userEvent.click(screen.getByRole('radio', { name: 'Transfer' }));
    await userEvent.type(screen.getByLabelText('Amount'), '500');
    await pick('From', 'Everyday checking');
    await pick('To', 'Everyday checking');

    expect(await screen.findByText('Choose two different accounts.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Add transaction' }));
    expect(create).not.toHaveBeenCalled();
  });

  it('has nothing to say about pending: every transaction is simply recorded', async () => {
    renderSheet();
    expect(screen.queryByLabelText('Pending')).not.toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Amount'), '30');
    await pick('Account', 'Everyday checking');
    await userEvent.click(screen.getByRole('button', { name: 'Add transaction' }));
    expect(create).toHaveBeenCalledWith(expect.not.objectContaining({ status: expect.anything() }));
  });

  it('names an unnamed expense after its category, then its kind', async () => {
    renderSheet();
    await userEvent.type(screen.getByLabelText('Amount'), '12');
    await pick('Account', 'Everyday checking');
    await pick('Category', 'Groceries');
    expect(screen.getByLabelText('Description')).toHaveAttribute('placeholder', 'Groceries');
    await userEvent.click(screen.getByRole('button', { name: 'Add transaction' }));
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ description: 'Groceries' }));
  });

  it('falls back to the kind when there is no category either', async () => {
    renderSheet();
    await userEvent.type(screen.getByLabelText('Amount'), '12');
    await pick('Account', 'Everyday checking');
    await userEvent.click(screen.getByRole('button', { name: 'Add transaction' }));
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ description: 'Expense' }));
  });

  it('refuses an amount that would need rounding', async () => {
    renderSheet();
    await userEvent.type(screen.getByLabelText('Amount'), '10.001');
    expect(await screen.findByText(/at most 2 decimal places/)).toBeInTheDocument();
  });
});
