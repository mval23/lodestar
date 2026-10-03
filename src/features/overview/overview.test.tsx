import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { addMonths } from '../../lib/dates';
import type { AccountBalance } from '../accounts/queries';
import type { BudgetPace, MonthToDate } from './queries';
import { restNote } from './Dashboard';
import { OverviewPage } from './OverviewPage';

const useAccounts = vi.fn();
const useNetWorth = vi.fn();
const useBills = vi.fn();
const useGoals = vi.fn();
const useMonthToDate = vi.fn();
const useBudgetPace = vi.fn();
const useAccountClosings = vi.fn();

vi.mock('../accounts/queries', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../accounts/queries')>();
  return { ...actual, useAccounts: () => useAccounts() };
});
vi.mock('../reports/queries', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../reports/queries')>();
  return { ...actual, useNetWorth: () => useNetWorth() };
});
vi.mock('../bills/queries', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../bills/queries')>();
  return { ...actual, useBills: () => useBills() };
});
vi.mock('../goals/queries', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../goals/queries')>();
  return { ...actual, useGoals: () => useGoals() };
});
vi.mock('./queries', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./queries')>();
  return {
    ...actual,
    useMonthToDate: () => useMonthToDate(),
    useBudgetPace: () => useBudgetPace(),
    useAccountClosings: () => useAccountClosings(),
  };
});
const phone = vi.fn(() => false);
vi.mock('../../lib/media', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/media')>();
  return { ...actual, useMediaQuery: () => phone() };
});
const startTour = vi.fn();
vi.mock('../tour/Tour', () => ({
  useTour: () => ({ active: false, start: startTour }),
  hasSeenTour: () => seenTour(),
}));
const seenTour = vi.fn(() => false);
vi.mock('../../lib/profile', () => ({
  useCurrency: () => 'USD',
  useProfile: () => ({ data: { id: 'u1', timezone: 'UTC', currency: 'USD' } }),
  useUpdateProfile: () => ({ mutate: vi.fn(), isError: false }),
}));

const THIS_MONTH = `${new Date().toISOString().slice(0, 7)}-01`;
const LAST_MONTH = addMonths(THIS_MONTH, -1);

function show() {
  render(
    <MemoryRouter>
      <OverviewPage />
    </MemoryRouter>,
  );
}

function account(id: string, name: string, type: AccountBalance['type'], balance: number): AccountBalance {
  return {
    account_id: id,
    name,
    type,
    is_liability: type === 'credit_card' || type === 'loan',
    archived_at: null,
    balance_minor: balance,
    user_id: 'u1',
    sort_order: 0,
    opening_balance_minor: 0,
    money_in_minor: 0,
    money_out_minor: 0,
    include_in_net_worth: true,
  };
}

function pace(name: string, planned: number, spent: number, onPace: number, daysLeft = 6): BudgetPace {
  return {
    budget_id: `b-${name}`,
    category_id: `c-${name}`,
    category_name: name,
    month: THIS_MONTH,
    planned_minor: planned,
    spent_minor: spent,
    bills_month_minor: 0,
    bills_due_minor: 0,
    pace_minor: onPace,
    gap_minor: spent - onPace,
    days_left: daysLeft,
    per_day_minor: null,
    status: spent > planned ? 'over' : spent > onPace ? 'ahead' : 'on_pace',
  };
}

const soFar: MonthToDate = {
  month: THIS_MONTH,
  today: THIS_MONTH,
  day_of_month: 24,
  days_in_month: 30,
  money_in_minor: 305000,
  money_out_minor: 318507,
  to_goals_minor: 125000,
  typical_in_minor: 283333,
  typical_out_minor: 363990,
  typical_to_goals_minor: 125000,
  typical_months: 6,
};

const accounts = [
  account('chk', 'Everyday checking', 'checking', 543797),
  account('wal', 'Wallet', 'cash', 56842),
  account('fund', 'Emergency fund', 'savings', 1235000),
  account('visa', 'Visa card', 'credit_card', -105265),
  account('loan', 'Car loan', 'loan', -556000),
];

function loaded() {
  useAccounts.mockReturnValue({ data: accounts, isSuccess: true, isPending: false, isError: false });
}

beforeEach(() => {
  useAccounts.mockReturnValue({ data: [], isSuccess: true, isPending: false, isError: false });
  useNetWorth.mockReturnValue({ data: [] });
  useBills.mockReturnValue({ data: [] });
  useGoals.mockReturnValue({ data: [] });
  useMonthToDate.mockReturnValue({ data: null, isPending: false });
  useBudgetPace.mockReturnValue({ data: [], isPending: false });
  useAccountClosings.mockReturnValue({ data: [] });
  phone.mockReturnValue(false);
  startTour.mockReset();
  seenTour.mockReturnValue(false);
});

describe('OverviewPage, first run', () => {
  it('asks for a currency and a first account before anything else', () => {
    show();
    expect(screen.getByText('Welcome to Lodestar')).toBeInTheDocument();
    expect(screen.getByRole('radiogroup', { name: 'Currency' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add your first account' })).toBeInTheDocument();
  });

  it('starts the tour on a first run, once', () => {
    show();
    expect(startTour).toHaveBeenCalledTimes(1);
  });

  it('leaves the tour alone once this browser has seen it, but still offers it', () => {
    seenTour.mockReturnValue(true);
    show();
    expect(startTour).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Show me around' })).toBeInTheDocument();
  });

  // The page used to render its whole dashboard from an empty list while the
  // accounts loaded, so the first thing it said was $0.00.
  it('says nothing about net worth until the accounts have arrived', () => {
    useAccounts.mockReturnValue({ data: undefined, isSuccess: false, isPending: true, isError: false });
    show();
    expect(screen.getByText('Working out where you stand…')).toBeInTheDocument();
    expect(screen.queryByText('Net worth')).not.toBeInTheDocument();
    expect(screen.queryByText('$0.00')).not.toBeInTheDocument();
  });
});

describe('This month', () => {
  it('leads with left to spend, its pace, and the month so far against a typical month', () => {
    loaded();
    useBudgetPace.mockReturnValue({
      data: [pace('Rent', 165000, 165000, 165000), pace('Groceries', 55000, 38043, 44000)],
      isPending: false,
    });
    useMonthToDate.mockReturnValue({ data: soFar, isPending: false });
    show();

    const band = screen.getByRole('region', { name: 'This month' });
    // 220,000 planned − 203,043 spent: the one bracketed figure.
    expect(within(band).getAllByText('$169.57').length).toBeGreaterThan(0);
    expect(band.querySelector('.bracket')).toHaveTextContent('$169.57');
    // 209,000 on pace − 203,043 spent.
    expect(band).toHaveTextContent('$59.57 under pace');
    expect(band).toHaveTextContent('6 days left');
    expect(band.querySelector('.pace-tick')).not.toBeNull();
    // Money in and out, each against a typical month cut at the same day.
    expect(band).toHaveTextContent('$3,050.00');
    expect(band).toHaveTextContent('+$216.67');
    expect(band).toHaveTextContent('$216.67 vs a typical');
    // "Oct 1–24" is held on one line by a word joiner after the dash.
    expect(band).toHaveTextContent(/1–\u2060?24/);
    expect(band).toHaveTextContent('minus $454.83 vs a typical');
  });

  it('says plainly when there is no plan and nothing to compare with', () => {
    loaded();
    useMonthToDate.mockReturnValue({ data: { ...soFar, typical_months: 0 }, isPending: false });
    show();
    const band = screen.getByRole('region', { name: 'This month' });
    expect(band).toHaveTextContent('No plan for this month yet.');
    expect(within(band).getAllByText('No earlier months to compare yet')).toHaveLength(2);
    expect(band).toHaveTextContent('No monthly plans set');
  });

  it('compares what went into goals with their monthly plans', () => {
    loaded();
    useMonthToDate.mockReturnValue({ data: { ...soFar, to_goals_minor: 100000 }, isPending: false });
    useGoals.mockReturnValue({
      data: [
        { goal_id: 'g1', name: 'Emergency fund', monthly_plan_minor: 75000, archived_at: null, target_minor: null, balance_minor: 0, this_month_contributed_minor: 75000 },
        { goal_id: 'g2', name: 'Travel', monthly_plan_minor: 50000, archived_at: null, target_minor: null, balance_minor: 0, this_month_contributed_minor: 25000 },
      ],
    });
    show();
    const band = screen.getByRole('region', { name: 'This month' });
    expect(band).toHaveTextContent('$250.00 to go of');
    expect(band).toHaveTextContent('$1,250.00 planned');
  });

  it('says how net worth has moved since last month end', () => {
    loaded();
    useNetWorth.mockReturnValue({
      data: [{ month: LAST_MONTH, assets_minor: 0, liabilities_minor: 0, net_worth_minor: 1000000 }],
    });
    show();
    const band = screen.getByRole('region', { name: 'This month' });
    // 543,797 + 56,842 + 1,235,000 − 105,265 − 556,000 = 1,174,374.
    expect(within(band).getAllByText('$11,743.74').length).toBeGreaterThan(0);
    expect(band).toHaveTextContent('+$1,743.74');
    expect(band).toHaveTextContent('$1,743.74 since');
  });
});

describe('What stands out', () => {
  it('names the budget furthest over plan, and money out against a typical month', () => {
    loaded();
    useBudgetPace.mockReturnValue({ data: [pace('Subscriptions', 8000, 8247, 6400)], isPending: false });
    useMonthToDate.mockReturnValue({ data: soFar, isPending: false });
    show();
    const line = screen.getByText(/What stands out/).closest('p')!;
    expect(line).toHaveTextContent('Subscriptions is over plan by');
    expect(line).toHaveTextContent('below a typical');
  });

  it('says nothing when the month is unremarkable', () => {
    loaded();
    useBudgetPace.mockReturnValue({ data: [pace('Rent', 165000, 165000, 165000)], isPending: false });
    useMonthToDate.mockReturnValue({ data: { ...soFar, money_out_minor: 360000 }, isPending: false });
    show();
    expect(screen.queryByText(/What stands out/)).not.toBeInTheDocument();
  });
});

describe('Budgets that need a look', () => {
  it('lists over plan first, then ahead of pace, three at most, each opening its budget line', () => {
    loaded();
    useBudgetPace.mockReturnValue({
      data: [
        pace('Rent', 165000, 165000, 165000),
        pace('Health', 10000, 9216, 8000),
        pace('Dining out', 30000, 29977, 24000),
        pace('Subscriptions', 8000, 8247, 6400),
        pace('Groceries', 55000, 38043, 44000),
      ],
      isPending: false,
    });
    show();
    const group = screen.getByRole('region', { name: 'Budgets that need a look' });
    const rows = within(group).getAllByRole('link').filter((link) => link.classList.contains('need-row'));
    expect(rows.map((row) => row.querySelector('.need-name')?.textContent)).toEqual(['Subscriptions', 'Dining out', 'Health']);
    expect(rows[0]).toHaveTextContent('Over plan by');
    expect(rows[1]).toHaveTextContent('ahead of pace');
    expect(rows[0]).toHaveAttribute('href', expect.stringContaining('c-Subscriptions'));
    expect(group).toHaveTextContent('2 more, all on pace or under.');
    expect(within(group).getByRole('link', { name: 'All 5' })).toBeInTheDocument();
  });
});

describe('restNote', () => {
  it('says how the budgets not shown stand', () => {
    expect(restNote(2, 0)).toBe('2 more, all on pace or under.');
    expect(restNote(6, 6)).toBe('6 more, all ahead of pace or over.');
    expect(restNote(6, 2)).toBe('6 more: 2 ahead of pace or over, 4 on pace or under.');
  });
});

describe('Where you stand', () => {
  it('groups the accounts, with a subtotal and the change since last month end', () => {
    loaded();
    useAccountClosings.mockReturnValue({
      data: [
        { account_id: 'chk', month: LAST_MONTH, closing_balance_minor: 761875 },
        { account_id: 'wal', month: LAST_MONTH, closing_balance_minor: 56842 },
        { account_id: 'visa', month: LAST_MONTH, closing_balance_minor: -182313 },
        { account_id: 'loan', month: LAST_MONTH, closing_balance_minor: -556000 },
      ],
    });
    show();
    const group = screen.getByRole('region', { name: 'Where you stand' });
    const cash = within(group).getByText('Cash').closest('a')!;
    // 543,797 + 56,842 now, 818,717 at last month end.
    expect(cash).toHaveTextContent('$6,006.39');
    expect(cash).toHaveTextContent('minus $2,180.78 since');
    const debt = within(group).getByText('Cards and loans').closest('a')!;
    expect(debt).toHaveTextContent('−$6,612.65');
    // −661,265 now against −738,313: owed less, said in words, not by sign.
    expect(debt).toHaveTextContent('$770.48 less owed than');
    expect(within(group).getByText('Savings')).toBeInTheDocument();
  });

  it('names an account left out of net worth instead of counting it in a subtotal', () => {
    useAccounts.mockReturnValue({
      data: [...accounts, { ...account('astro', 'Astro dollars', 'investment', 14800), include_in_net_worth: false }],
      isSuccess: true,
      isPending: false,
      isError: false,
    });
    show();
    const group = screen.getByRole('region', { name: 'Where you stand' });
    // Savings is the Emergency fund alone: 12,350.00, without the 148.00.
    expect(within(group).getByText('Savings').closest('a')).toHaveTextContent('$12,350.00');
    expect(group).toHaveTextContent('Not in net worth: Astro dollars');
    // Net worth in the band leaves it out too: still 11,743.74.
    expect(within(screen.getByRole('region', { name: 'This month' })).getAllByText('$11,743.74').length).toBeGreaterThan(0);
  });
});

describe('Goals', () => {
  it('shows each goal against its target and this month against its plan', () => {
    loaded();
    useGoals.mockReturnValue({
      data: [
        { goal_id: 'g1', name: 'Travel', target_minor: 400000, monthly_plan_minor: 20000, archived_at: null, balance_minor: 260000, this_month_contributed_minor: 20000 },
        { goal_id: 'g2', name: 'Home deposit', target_minor: 4000000, monthly_plan_minor: 50000, archived_at: null, balance_minor: 1500000, this_month_contributed_minor: 10000 },
        { goal_id: 'g3', name: 'Retirement', target_minor: null, monthly_plan_minor: null, archived_at: null, balance_minor: 2450000, this_month_contributed_minor: 0 },
      ],
    });
    show();
    const group = screen.getByRole('region', { name: 'Goals' });
    const travel = within(group).getByText('Travel').closest('a')!;
    expect(travel).toHaveTextContent('On plan · ');
    expect(travel).toHaveTextContent('65%');
    expect(within(group).getByText('Home deposit').closest('a')).toHaveTextContent('$400.00 to go this month');
    const retirement = within(group).getByText('Retirement').closest('a')!;
    expect(retirement).toHaveTextContent('No monthly plan');
    expect(retirement).toHaveTextContent('No target');
  });
});

describe('OverviewPage on a phone', () => {
  beforeEach(() => phone.mockReturnValue(true));

  it('puts this month first and folds where you stand and what is coming up', () => {
    loaded();
    useBudgetPace.mockReturnValue({ data: [pace('Groceries', 55000, 38043, 44000)], isPending: false });
    show();
    expect(screen.getByRole('region', { name: 'This month' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Budgets that need a look' })).toBeInTheDocument();
    const folds = Array.from(document.querySelectorAll('details.fold'));
    expect(folds.map((fold) => fold.querySelector('summary')?.textContent)).toEqual(['Where you stand', 'Coming up']);
    for (const fold of folds) expect(fold).not.toHaveAttribute('open');
    expect(screen.getAllByRole('link', { name: /Reports/ }).length).toBeGreaterThan(0);
  });
});
