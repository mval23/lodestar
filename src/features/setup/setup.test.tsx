import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { SetupPage } from './SetupPage';

const useAccounts = vi.fn();
const useCategories = vi.fn();
const useBills = vi.fn();
const useBudgets = vi.fn();
const useGoals = vi.fn();
const useHasTransactions = vi.fn();
const createCategory = vi.fn();

vi.mock('../../lib/profile', () => ({
  useCurrency: () => 'USD',
  useProfile: () => ({ data: { id: 'u1', timezone: 'UTC', currency: 'USD' } }),
  useUpdateProfile: () => ({ mutate: vi.fn(), isError: false }),
  useHasTransactions: () => useHasTransactions(),
}));
vi.mock('../accounts/queries', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../accounts/queries')>();
  const idle = () => ({ mutateAsync: vi.fn(), isPending: false });
  return {
    ...actual,
    useAccounts: () => useAccounts(),
    useCreateAccount: idle,
    useUpdateAccount: idle,
    useArchiveAccount: idle,
    useDeleteAccount: idle,
  };
});
vi.mock('../categories/queries', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../categories/queries')>();
  return {
    ...actual,
    useCategories: () => useCategories(),
    useCreateCategory: () => ({ mutateAsync: createCategory, isPending: false }),
  };
});
vi.mock('../bills/queries', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../bills/queries')>();
  return { ...actual, useBills: () => useBills() };
});
vi.mock('../budgets/queries', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../budgets/queries')>();
  return { ...actual, useBudgets: () => useBudgets() };
});
vi.mock('../goals/queries', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../goals/queries')>();
  return { ...actual, useGoals: () => useGoals() };
});

const loaded = (data: unknown[]) => ({ data, isPending: false, isSuccess: true, isError: false });

const CHECKING = {
  account_id: 'acc-chk',
  name: 'Everyday checking',
  type: 'checking',
  is_liability: false,
  archived_at: null,
  balance_minor: 120000,
};
const CARD = { ...CHECKING, account_id: 'acc-card', name: 'Blue card', type: 'credit_card', is_liability: true };

function show(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/welcome" element={<SetupPage />} />
        <Route path="/welcome/:step" element={<SetupPage />} />
        <Route path="/" element={<p>Overview page</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  useAccounts.mockReturnValue(loaded([]));
  useCategories.mockReturnValue(loaded([]));
  useBills.mockReturnValue(loaded([]));
  useBudgets.mockReturnValue(loaded([]));
  useGoals.mockReturnValue(loaded([]));
  useHasTransactions.mockReturnValue({ data: false, isPending: false });
  createCategory.mockReset();
});

describe('the welcome', () => {
  it('asks for a currency, lists the six steps, and starts with accounts', () => {
    show('/welcome');
    expect(screen.getByRole('heading', { name: 'Welcome to Lodestar' })).toBeInTheDocument();
    expect(screen.getByRole('radiogroup', { name: 'Currency' })).toBeInTheDocument();
    const outline = within(screen.getByRole('region', { name: 'What we’ll set up' }));
    expect(outline.getAllByRole('listitem')).toHaveLength(6);
    expect(screen.getByRole('link', { name: 'Start' })).toHaveAttribute('href', '/welcome/accounts');
  });

  it('picks up at the first step not yet done', () => {
    useAccounts.mockReturnValue(loaded([CHECKING]));
    useCategories.mockReturnValue(loaded([{ id: 'c1', name: 'Groceries', kind: 'expense', archived_at: null }]));
    show('/welcome');
    expect(screen.getByRole('link', { name: 'Continue setup' })).toHaveAttribute('href', '/welcome/bills');
  });

  it('fixes the currency once there are transactions', () => {
    useHasTransactions.mockReturnValue({ data: true, isPending: false });
    show('/welcome');
    for (const radio of screen.getAllByRole('radio')) expect(radio).toBeDisabled();
  });
});

describe('the steps', () => {
  it('needs an account before going on', () => {
    show('/welcome/accounts');
    expect(screen.getByText('Step 1 of 6')).toBeInTheDocument();
    expect(screen.getByText('Add an account to go on.')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Skip for now' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Continue' })).not.toBeInTheDocument();
  });

  it('opens the account sheet from the accounts step', async () => {
    show('/welcome/accounts');
    await userEvent.click(screen.getByRole('button', { name: 'Add your first account' }));
    expect(screen.getByRole('dialog', { name: 'Add account' })).toBeInTheDocument();
  });

  it('lists the accounts added and moves on once there is one', async () => {
    useAccounts.mockReturnValue(loaded([CHECKING]));
    show('/welcome/accounts');
    expect(screen.getByText('Everyday checking')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByRole('heading', { name: 'What your money is for' })).toBeInTheDocument();
  });

  it('lets any later step be skipped', () => {
    useAccounts.mockReturnValue(loaded([CHECKING]));
    show('/welcome/bills');
    expect(screen.getByRole('link', { name: 'Skip for now' })).toHaveAttribute('href', '/welcome/budgets');
    expect(screen.getByRole('link', { name: 'Back' })).toHaveAttribute('href', '/welcome/categories');
  });

  it('marks done steps in the stepper with words, not colour alone', () => {
    useAccounts.mockReturnValue(loaded([CHECKING]));
    show('/welcome/categories');
    const steps = within(screen.getByRole('navigation', { name: 'Setup steps' }));
    expect(steps.getByRole('link', { name: /Accounts, done/ })).toBeInTheDocument();
    expect(steps.getByRole('link', { name: /Categories/ })).toHaveAttribute('aria-current', 'step');
  });

  it('adds the starter categories picked, and offers none twice', async () => {
    useAccounts.mockReturnValue(loaded([CHECKING]));
    useCategories.mockReturnValue(loaded([{ id: 'c1', name: 'Groceries', kind: 'expense', archived_at: null }]));
    show('/welcome/categories');

    expect(screen.getByRole('button', { name: /Groceries, added/ })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Housing' }));
    await userEvent.click(screen.getByRole('button', { name: 'Salary' }));
    await userEvent.click(screen.getByRole('button', { name: 'Add 2 categories' }));

    expect(createCategory).toHaveBeenCalledWith({ kind: 'expense', name: 'Housing' });
    expect(createCategory).toHaveBeenCalledWith({ kind: 'income', name: 'Salary' });
    expect(createCategory).toHaveBeenCalledTimes(2);
  });

  it('asks for a spending category before a budget', () => {
    useAccounts.mockReturnValue(loaded([CHECKING]));
    show('/welcome/budgets');
    expect(screen.getByRole('link', { name: 'Add a category' })).toHaveAttribute('href', '/welcome/categories');
  });

  it('offers a savings account when no account can hold a goal', () => {
    useAccounts.mockReturnValue(loaded([CARD]));
    show('/welcome/goals');
    expect(screen.queryByRole('button', { name: 'Add a goal' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add a savings account' })).toBeInTheDocument();
  });

  it('sends an unknown step back to the welcome', () => {
    show('/welcome/nope');
    expect(screen.getByRole('heading', { name: 'Welcome to Lodestar' })).toBeInTheDocument();
  });
});

describe('the last screen', () => {
  it('says which steps were skipped and links back to them', () => {
    useAccounts.mockReturnValue(loaded([CHECKING]));
    useHasTransactions.mockReturnValue({ data: true, isPending: false });
    show('/welcome/done');
    expect(screen.getByRole('heading', { name: 'You’re set up' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '2 of 6 steps done' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Bills\s*Skipped for now/ })).toHaveAttribute('href', '/welcome/bills');
    expect(screen.getByRole('link', { name: 'Go to Overview' })).toHaveAttribute('href', '/');
  });
});
