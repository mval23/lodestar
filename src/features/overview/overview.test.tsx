import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { OverviewPage } from './OverviewPage';

const useAccounts = vi.fn();
const useCashFlow = vi.fn();
const useNetWorth = vi.fn();
const useBudgets = vi.fn();
const useBills = vi.fn();
const useGoals = vi.fn();
const useMonthAccounts = vi.fn();

vi.mock('../accounts/queries', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../accounts/queries')>();
  return { ...actual, useAccounts: () => useAccounts() };
});
vi.mock('../reports/queries', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../reports/queries')>();
  return { ...actual, useCashFlow: () => useCashFlow(), useNetWorth: () => useNetWorth() };
});
vi.mock('../budgets/queries', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../budgets/queries')>();
  return { ...actual, useBudgets: () => useBudgets() };
});
vi.mock('../bills/queries', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../bills/queries')>();
  return { ...actual, useBills: () => useBills() };
});
vi.mock('../goals/queries', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../goals/queries')>();
  return { ...actual, useGoals: () => useGoals() };
});
const phone = vi.fn(() => false);
vi.mock('../../lib/media', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/media')>();
  return { ...actual, useMediaQuery: () => phone() };
});
vi.mock('../months/queries', () => ({ useMonthAccounts: () => useMonthAccounts() }));
vi.mock('../../lib/profile', () => ({
  useCurrency: () => 'USD',
  useProfile: () => ({ data: { id: 'u1', timezone: 'UTC', currency: 'USD' } }),
  useUpdateProfile: () => ({ mutate: vi.fn(), isError: false }),
}));

const THIS_MONTH = `${new Date().toISOString().slice(0, 7)}-01`;
const TODAY = new Date().toISOString().slice(0, 10);

function show() {
  render(
    <MemoryRouter>
      <OverviewPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  useAccounts.mockReturnValue({ data: [], isSuccess: true, isPending: false, isError: false });
  useCashFlow.mockReturnValue({ data: [] });
  useNetWorth.mockReturnValue({ data: [] });
  useBudgets.mockReturnValue({ data: [] });
  useBills.mockReturnValue({ data: [] });
  useGoals.mockReturnValue({ data: [] });
  useMonthAccounts.mockReturnValue({ data: [] });
  phone.mockReturnValue(false);
});

describe('OverviewPage', () => {
  it('asks for a currency and a first account before anything else', () => {
    show();
    expect(screen.getByText('Welcome to Lodestar')).toBeInTheDocument();
    expect(screen.getByRole('radiogroup', { name: 'Currency' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add your first account' })).toBeInTheDocument();
  });

  it('leads with net worth once there are accounts', () => {
    useAccounts.mockReturnValue({
      data: [
        {
          account_id: 'a',
          name: 'Everyday checking',
          type: 'checking',
          is_liability: false,
          archived_at: null,
          balance_minor: 285450,
          user_id: 'u1',
          sort_order: 0,
          opening_balance_minor: 0,
          money_in_minor: 0,
          money_out_minor: 0,
        },
        {
          account_id: 'c',
          name: 'Blue card',
          type: 'credit_card',
          is_liability: true,
          archived_at: null,
          balance_minor: -31000,
          user_id: 'u1',
          sort_order: 1,
          opening_balance_minor: 0,
          money_in_minor: 0,
          money_out_minor: 0,
        },
      ],
      isSuccess: true,
      isPending: false,
      isError: false,
    });
    show();
    // 285450 − 31000 = 254450
    expect(screen.getAllByText('$2,544.50').length).toBeGreaterThan(0);
    expect(screen.getByText('Everyday checking')).toBeInTheDocument();
    // On a wide screen what is owned and what is owed are separate groups,
    // each with its total: owed is said as a positive amount.
    expect(screen.getByRole('region', { name: 'Accounts' })).toHaveTextContent('$2,854.50');
    expect(screen.getByRole('region', { name: 'Debt' })).toHaveTextContent('$310.00');
    expect(screen.getByRole('region', { name: 'Debt' })).toHaveTextContent('Blue card');
  });

  it('says plainly when each card has nothing to show', () => {
    useAccounts.mockReturnValue({
      data: [
        {
          account_id: 'a',
          name: 'Everyday checking',
          type: 'checking',
          is_liability: false,
          archived_at: null,
          balance_minor: 1000,
          user_id: 'u1',
          sort_order: 0,
          opening_balance_minor: 1000,
          money_in_minor: 0,
          money_out_minor: 0,
        },
      ],
      isSuccess: true,
      isPending: false,
      isError: false,
    });
    show();
    expect(screen.getByText('Nothing recorded this month yet.')).toBeInTheDocument();
    expect(screen.getByText('No plan for this month yet.')).toBeInTheDocument();
    expect(screen.getByText('Nothing due in the next week.')).toBeInTheDocument();
    // With no goals there is nothing to show, so the strip stays away.
    expect(screen.queryByRole('heading', { name: 'Goals' })).not.toBeInTheDocument();
  });

  it('summarises the month, the budget, what is due and what is saved', () => {
    useAccounts.mockReturnValue({
      data: [
        {
          account_id: 'a',
          name: 'Everyday checking',
          type: 'checking',
          is_liability: false,
          archived_at: null,
          balance_minor: 100000,
          user_id: 'u1',
          sort_order: 0,
          opening_balance_minor: 100000,
          money_in_minor: 0,
          money_out_minor: 0,
        },
      ],
      isSuccess: true,
      isPending: false,
      isError: false,
    });
    useCashFlow.mockReturnValue({
      data: [{ month: THIS_MONTH, money_in_minor: 250000, money_out_minor: 100000, net_minor: 150000 }],
    });
    useBudgets.mockReturnValue({
      data: [
        {
          budget_id: 'b1',
          category_id: 'groceries',
          category_name: 'Groceries',
          group_id: null,
          month: THIS_MONTH,
          planned_minor: 20000,
          spent_minor: 25550,
          left_minor: -5550,
        },
      ],
    });
    useBills.mockReturnValue({
      data: [
        {
          id: 'bill1',
          name: 'Rent',
          next_due_on: TODAY,
          amount_minor: 120000,
          archived_at: null,
          label: 'bill',
          kind: 'expense',
        },
      ],
    });
    useGoals.mockReturnValue({
      data: [{ goal_id: 'g1', name: 'Emergency fund', balance_minor: 50000, target_minor: 100000, archived_at: null }],
    });

    show();

    expect(screen.getAllByText('+$1,500.00').length).toBeGreaterThan(0); // the month's net
    expect(screen.getByText(/Over plan by/)).toBeInTheDocument();
    // The category past its plan is named, and leads to its budget line.
    expect(screen.getByRole('link', { name: 'Groceries' })).toBeInTheDocument();
    expect(screen.getByText('Due today')).toBeInTheDocument();
    expect(screen.getByText(/50% saved/)).toBeInTheDocument();
  });

  const checking = {
    account_id: 'a',
    name: 'Everyday checking',
    type: 'checking',
    is_liability: false,
    archived_at: null,
    balance_minor: 100000,
    user_id: 'u1',
    sort_order: 0,
    opening_balance_minor: 100000,
    money_in_minor: 0,
    money_out_minor: 0,
  };

  // The page used to render its whole dashboard from an empty list while the
  // accounts loaded, so the first thing it said was $0.00.
  it('says nothing about net worth until the accounts have arrived', () => {
    useAccounts.mockReturnValue({ data: undefined, isSuccess: false, isPending: true, isError: false });
    show();
    expect(screen.getByText('Working out where you stand…')).toBeInTheDocument();
    expect(screen.queryByText('Net worth')).not.toBeInTheDocument();
    expect(screen.queryByText('$0.00')).not.toBeInTheDocument();
  });

  it('shows which way net worth has moved, in words as well as a line', () => {
    useAccounts.mockReturnValue({ data: [checking], isSuccess: true, isPending: false, isError: false });
    useNetWorth.mockReturnValue({
      data: [
        { month: '2026-08-01', assets_minor: 90000, liabilities_minor: 0, net_worth_minor: 90000 },
        { month: THIS_MONTH, assets_minor: 100000, liabilities_minor: 0, net_worth_minor: 100000 },
      ],
    });
    show();
    expect(screen.getByRole('img', { name: /Net worth over the last 2 months/ })).toBeInTheDocument();
    expect(screen.getByText(/over 2 months/)).toBeInTheDocument();
    expect(screen.getAllByText('+$100.00').length).toBeGreaterThan(0);
  });

  // The four figures checked every time, in one band: left to spend (the
  // page's one bracket), net worth, this month, and what is due this week.
  it('leads a wide screen with the key figures in one band', () => {
    useAccounts.mockReturnValue({ data: [checking], isSuccess: true, isPending: false, isError: false });
    useCashFlow.mockReturnValue({
      data: [{ month: THIS_MONTH, money_in_minor: 250000, money_out_minor: 100000, net_minor: 150000 }],
    });
    useBudgets.mockReturnValue({
      data: [
        {
          budget_id: 'b1',
          category_id: 'groceries',
          category_name: 'Groceries',
          group_id: null,
          month: THIS_MONTH,
          planned_minor: 60000,
          spent_minor: 45000,
          left_minor: 15000,
        },
      ],
    });
    useBills.mockReturnValue({
      data: [
        { id: 'bill1', name: 'Phone', next_due_on: TODAY, amount_minor: 4500, archived_at: null, label: 'bill', kind: 'expense' },
        { id: 'bill2', name: 'Salary', next_due_on: '2099-01-01', amount_minor: 285000, archived_at: null, label: 'income', kind: 'income' },
      ],
    });
    show();

    const band = screen.getByRole('region', { name: 'Key figures' });
    expect(within(band).getByRole('link', { name: /Left to spend/ })).toBeInTheDocument();
    expect(band.querySelectorAll('.bracket')).toHaveLength(1);
    expect(within(band).getAllByText('$150.00').length).toBeGreaterThan(0);
    expect(within(band).getAllByText('+$1,500.00').length).toBeGreaterThan(0);
    expect(within(band).getByText('Next: Phone, due today')).toBeInTheDocument();

    // Coming up lists what comes round next, money in included.
    const coming = screen.getByRole('region', { name: 'Coming up' });
    expect(within(coming).getByRole('link', { name: 'Salary' })).toBeInTheDocument();
    expect(within(coming).getAllByText('+$2,850.00').length).toBeGreaterThan(0);

    // The phone's stack is not drawn beside it.
    expect(screen.queryByRole('navigation', { name: 'More' })).not.toBeInTheDocument();
  });

  // A card payment is a transfer into the card, so it is in neither income
  // nor expenses: it shows under the debt it paid down.
  it('shows what was paid towards debt this month, counting only cards and loans', () => {
    useAccounts.mockReturnValue({
      data: [
        checking,
        { ...checking, account_id: 'c', name: 'Blue card', type: 'credit_card', is_liability: true, balance_minor: -98964 },
      ],
      isSuccess: true,
      isPending: false,
      isError: false,
    });
    useMonthAccounts.mockReturnValue({
      data: [
        { account_id: 'c', transfer_in_minor: 40000 },
        { account_id: 'a', transfer_in_minor: 12345 },
      ],
    });
    show();

    const debt = screen.getByRole('region', { name: 'Debt' });
    expect(within(debt).getAllByText('$989.64').length).toBeGreaterThan(0);
    expect(within(debt).getByText('Paid this month').closest('.wide-row')).toHaveTextContent('$400.00');
  });
});

// A phone keeps the stacked Overview: the month's plan first, then the cards.
describe('OverviewPage on a phone', () => {
  beforeEach(() => phone.mockReturnValue(true));

  const checking = {
    account_id: 'a',
    name: 'Everyday checking',
    type: 'checking',
    is_liability: false,
    archived_at: null,
    balance_minor: 100000,
    user_id: 'u1',
    sort_order: 0,
    opening_balance_minor: 100000,
    money_in_minor: 0,
    money_out_minor: 0,
  };

  it('keeps the stack, with assets and liabilities apart and the More list', () => {
    useAccounts.mockReturnValue({
      data: [
        checking,
        { ...checking, account_id: 'c', name: 'Blue card', type: 'credit_card', is_liability: true, balance_minor: -31000 },
      ],
      isSuccess: true,
      isPending: false,
      isError: false,
    });
    show();
    expect(screen.queryByRole('region', { name: 'Key figures' })).not.toBeInTheDocument();
    expect(screen.getByText(/in assets/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Assets' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Cards and loans' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'More' })).toBeInTheDocument();
  });

  // The month's income, expenses and debt, side by side. A card payment is a
  // transfer into the card, so it is in neither income nor expenses: it shows
  // under the debt it paid down.
  it('totals the month: income, expenses, and the debt with what was paid towards it', () => {
    useAccounts.mockReturnValue({
      data: [
        checking,
        { ...checking, account_id: 'c', name: 'Blue card', type: 'credit_card', is_liability: true, balance_minor: -98964 },
      ],
      isSuccess: true,
      isPending: false,
      isError: false,
    });
    useCashFlow.mockReturnValue({
      data: [{ month: THIS_MONTH, money_in_minor: 688200, money_out_minor: 363190, net_minor: 325010 }],
    });
    useMonthAccounts.mockReturnValue({
      data: [
        { account_id: 'c', transfer_in_minor: 40000 },
        { account_id: 'a', transfer_in_minor: 12345 },
      ],
    });
    show();

    const card = screen.getByRole('region', { name: 'This month' });
    expect(within(card).getByText('Income')).toBeInTheDocument();
    expect(within(card).getAllByText('$6,882.00').length).toBeGreaterThan(0);
    expect(within(card).getByText('Expenses')).toBeInTheDocument();
    expect(within(card).getAllByText('$3,631.90').length).toBeGreaterThan(0);
    // Owed, as a positive amount, the way it is said.
    expect(within(card).getAllByText('$989.64').length).toBeGreaterThan(0);
    // Only transfers into a card or loan count as paying it down.
    expect(within(card).getByText(/paid this month/)).toHaveTextContent('$400.00');
    expect(within(card).getAllByText('+$3,250.10').length).toBeGreaterThan(0);
  });
});
