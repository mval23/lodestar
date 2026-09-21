import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { OverviewPage } from './OverviewPage';

const useAccounts = vi.fn();
const useCashFlow = vi.fn();
const useBudgets = vi.fn();
const useBills = vi.fn();
const useGoals = vi.fn();

vi.mock('../accounts/queries', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../accounts/queries')>();
  return { ...actual, useAccounts: () => useAccounts() };
});
vi.mock('../reports/queries', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../reports/queries')>();
  return { ...actual, useCashFlow: () => useCashFlow() };
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
  useBudgets.mockReturnValue({ data: [] });
  useBills.mockReturnValue({ data: [] });
  useGoals.mockReturnValue({ data: [] });
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
    expect(screen.getByText(/in assets/)).toBeInTheDocument();
    expect(screen.getByText(/owed/)).toBeInTheDocument();
    expect(screen.getByText('Everyday checking')).toBeInTheDocument();
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
    expect(screen.getByText('No goals yet.')).toBeInTheDocument();
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
    expect(screen.getByText(/1 over plan/)).toBeInTheDocument();
    expect(screen.getByText('Due today')).toBeInTheDocument();
    expect(screen.getByText('50% saved')).toBeInTheDocument();
  });
});
