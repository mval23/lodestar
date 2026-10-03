import { render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { addMonths } from '../../lib/dates';
import { BudgetsReportPage } from './BudgetsReportPage';
import { SavingsReportPage } from './SavingsReportPage';
import { SpendingReportPage } from './SpendingReportPage';
import type { ReportMonth, ReportTotals } from './queries';

// Synthetic data only.
const useReportSummary = vi.fn();
const useReportCashFlow = vi.fn();
const useReportCategoryTotals = vi.fn();
const useReportCategoryMonths = vi.fn();
const useBudgetSummary = vi.fn();
const useBudgetResults = vi.fn();
const useGoalPaces = vi.fn();
const useGoals = vi.fn();

const THIS_MONTH = `${new Date().toISOString().slice(0, 7)}-01`;
const LAST = addMonths(THIS_MONTH, -1);
const loaded = <T,>(data: T) => ({ data, isPending: false, isError: false, isSuccess: true, error: null });

vi.mock('./queries', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./queries')>();
  return {
    ...actual,
    useFirstActivityMonth: () => loaded('2024-10-01'),
    useReportSummary: (...args: unknown[]) => useReportSummary(...args),
    useReportCashFlow: (...args: unknown[]) => useReportCashFlow(...args),
    useReportCategoryTotals: (...args: unknown[]) => useReportCategoryTotals(...args),
    useReportCategoryMonths: (...args: unknown[]) => useReportCategoryMonths(...args),
    useBudgetSummary: (...args: unknown[]) => useBudgetSummary(...args),
    useBudgetResults: (...args: unknown[]) => useBudgetResults(...args),
    useGoalPaces: () => useGoalPaces(),
  };
});
vi.mock('../accounts/queries', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../accounts/queries')>();
  return {
    ...actual,
    useAccounts: () =>
      loaded([
        { account_id: 'acc-fund', name: 'Emergency fund', type: 'savings', archived_at: null },
        { account_id: 'acc-inv', name: 'Retirement', type: 'investment', archived_at: null },
      ]),
  };
});
vi.mock('../categories/queries', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../categories/queries')>();
  const cat = (id: string, name: string, group: string) => ({ id, name, kind: 'expense', group_id: group, archived_at: null });
  return {
    ...actual,
    useCategories: () =>
      loaded([cat('rent', 'Rent', 'g-ess'), cat('groc', 'Groceries', 'g-ess'), cat('dine', 'Dining out', 'g-life'), cat('gift', 'Gifts', 'g-life')]),
    useCategoryGroups: () => loaded([{ id: 'g-ess', name: 'Essentials' }, { id: 'g-life', name: 'Lifestyle' }]),
  };
});
vi.mock('../bills/queries', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../bills/queries')>();
  return { ...actual, useBills: () => loaded([{ id: 'b1', kind: 'expense', category_id: 'rent', archived_at: null }]) };
});
vi.mock('../goals/queries', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../goals/queries')>();
  return { ...actual, useGoals: () => useGoals() };
});
vi.mock('../../lib/profile', () => ({
  useCurrency: () => 'USD',
  useProfile: () => ({ data: { timezone: 'UTC' } }),
}));

function totals(over: Partial<ReportTotals> = {}): ReportTotals {
  return {
    period: 'current',
    period_from: addMonths(THIS_MONTH, -12),
    period_to: THIS_MONTH,
    money_in_minor: 6607000,
    money_out_minor: 4593845,
    net_minor: 2013155,
    to_goals_minor: 1500000,
    from_goals_minor: 205000,
    card_payments_minor: 0,
    loan_payments_minor: 0,
    cash_withdrawals_minor: 0,
    other_transfers_minor: 0,
    transfers_minor: 1705000,
    months: 12,
    active_months: 12,
    ...over,
  };
}

function month(m: string, toGoals: number, fromGoals: number): ReportMonth {
  return {
    month: m, money_in_minor: 550000, money_out_minor: 380000, net_minor: 170000, to_goals_minor: toGoals,
    from_goals_minor: fromGoals, moved_in_minor: 0, moved_out_minor: 0, active: true,
  };
}

function show(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/reports/spending" element={<SpendingReportPage />} />
        <Route path="/reports/budgets" element={<BudgetsReportPage />} />
        <Route path="/reports/savings" element={<SavingsReportPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  useReportSummary.mockReturnValue(loaded({ current: totals(), compare: totals({ period: 'compare', money_out_minor: 4313464, to_goals_minor: 1300000, from_goals_minor: 0 }) }));
  useReportCashFlow.mockReturnValue(loaded([month(addMonths(THIS_MONTH, -2), 125000, 85000), month(LAST, 125000, 0)]));
  useReportCategoryTotals.mockReturnValue(
    loaded([
      { category_id: 'rent', total_minor: 1980000, txn_count: 12, compare_minor: 1920000 },
      { category_id: 'groc', total_minor: 1600000, txn_count: 96, compare_minor: 1580000 },
      { category_id: 'dine', total_minor: 992295, txn_count: 60, compare_minor: 780000 },
      { category_id: null, total_minor: 21550, txn_count: 3, compare_minor: 0 },
    ]),
  );
  useReportCategoryMonths.mockReturnValue(
    loaded([
      { category_id: 'rent', month: LAST, total_minor: 165000 },
      { category_id: 'groc', month: LAST, total_minor: 48177 },
      { category_id: null, month: LAST, total_minor: 11280 },
    ]),
  );
  useBudgetSummary.mockReturnValue(
    loaded({
      planned_minor: 223000, spent_planned_minor: 215802, unplanned_minor: 0, uncategorized_minor: 11280,
      lines: 3, within: 2, history_lines: 30, history_within: 21, first_month: '2025-10-01',
    }),
  );
  useBudgetResults.mockReturnValue(
    loaded([
      { category_id: 'rent', month: THIS_MONTH, planned_minor: 165000, spent_minor: 165000, within_plan: true },
      { category_id: 'groc', month: THIS_MONTH, planned_minor: 28000, spent_minor: 15200, within_plan: true },
      { category_id: 'dine', month: THIS_MONTH, planned_minor: 30000, spent_minor: 35602, within_plan: false },
      ...[1, 2, 3, 4].map((k) => ({ category_id: 'dine', month: addMonths(THIS_MONTH, -k), planned_minor: 30000, spent_minor: 36000, within_plan: false })),
      { category_id: null, month: THIS_MONTH, planned_minor: null, spent_minor: 11280, within_plan: null },
    ]),
  );
  useGoals.mockReturnValue(
    loaded([
      { goal_id: 'g1', account_id: 'acc-fund', name: 'Emergency fund', target_minor: 1500000, target_date: null, monthly_plan_minor: 100000,
        achieved_at: null, archived_at: null, balance_minor: 1235000, remaining_minor: 265000, this_month: THIS_MONTH, this_month_contributed_minor: 0 },
      { goal_id: 'g2', account_id: 'acc-inv', name: 'Retirement', target_minor: null, target_date: null, monthly_plan_minor: 25000,
        achieved_at: null, archived_at: null, balance_minor: 2450000, remaining_minor: null, this_month: THIS_MONTH, this_month_contributed_minor: 0 },
    ]),
  );
  useGoalPaces.mockReturnValue(
    loaded([
      { goal_id: 'g1', needed_monthly_minor: null, avg_put_in_minor: 30000, months_put_in: 6, estimated_month: '2027-06-01' },
      { goal_id: 'g2', needed_monthly_minor: null, avg_put_in_minor: 25000, months_put_in: 6, estimated_month: null },
    ]),
  );
});

describe('Spending by category', () => {
  it('leads with total spending against the period before, and names the largest category', () => {
    show('/reports/spending');
    const band = screen.getByRole('region', { name: 'This period' });
    expect(band).toHaveTextContent(/\$45,938\.45/);
    expect(band).toHaveTextContent('+6.5%');
    expect(band).toHaveTextContent('Rent 43.1%');
    expect(band).toHaveTextContent('Dining out');
    expect(band).toHaveTextContent('3 expenses need a category');
  });

  it('ranks every category with its share and change, and links spending with no category to Activity', () => {
    show('/reports/spending');
    const ranked = screen.getByRole('region', { name: 'Ranked' });
    expect(within(ranked).getByRole('link', { name: 'Rent' }).closest('tr')).toHaveTextContent(/43\.1%.*\$19,800\.00.*\+3\.1%/);
    expect(within(ranked).getByRole('link', { name: 'Uncategorized' })).toHaveAttribute(
      'href',
      expect.stringContaining('categoryId=none'),
    );
  });

  it('draws the category a bill pays as the fixed grey base', () => {
    show('/reports/spending');
    expect(screen.getByText('Rent (fixed)')).toBeInTheDocument();
  });
});

describe('Budget vs actual', () => {
  it('sums the month and says how plans have held', () => {
    show('/reports/budgets');
    const band = screen.getByRole('region', { name: 'This month' });
    expect(band).toHaveTextContent(/\$2,230\.00/);
    expect(band).toHaveTextContent(/Left to spend.*\$71\.98/);
    expect(band).toHaveTextContent('2 of 3');
    expect(band).toHaveTextContent('70%');
  });

  it('marks each plan within or over, with its variance', () => {
    show('/reports/budgets');
    const row = screen.getByRole('link', { name: 'Dining out' }).closest('tr')!;
    expect(row).toHaveTextContent(/−\$56\.02.*−19%.*Over plan/);
    expect(screen.getByRole('link', { name: 'Groceries' }).closest('tr')).toHaveTextContent(/\+\$128\.00.*\+46%.*Within plan/);
  });

  it('shows which plans held month by month, and names the one that keeps going over', () => {
    show('/reports/budgets');
    const grid = screen.getByRole('table', { name: /Plans held/ });
    expect(within(grid).getByRole('row', { name: /Dining out/ })).toHaveTextContent('0/5');
    expect(screen.getByText(/What stands out/).closest('section')).toHaveTextContent('Dining out was over plan in 5 of 5 months');
  });
});

describe('Savings rate and goals', () => {
  it('nets what went in against what came out, as a rate of money in', () => {
    show('/reports/savings');
    const band = screen.getByRole('region', { name: 'This period' });
    // 15,000.00 in, 2,050.00 out, of 66,070.00 in: 19.6%.
    expect(band).toHaveTextContent(/\$12,950\.00/);
    expect(band).toHaveTextContent('19.6%');
    expect(band).toHaveTextContent('2 of 2');
  });

  it('gives an estimate only with a target and a pace, tagged as one', () => {
    show('/reports/savings');
    const goals = screen.getByRole('region', { name: 'Goal progress' });
    expect(within(goals).getByText('Emergency fund').closest('li')).toHaveTextContent(/Estimate.*Reached around June 2027/);
    expect(within(goals).getByText('Retirement').closest('li')).toHaveTextContent('No target set, so no completion date');
  });
});
