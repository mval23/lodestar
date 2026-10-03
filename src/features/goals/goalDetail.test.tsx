import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { GoalDetailPage } from './GoalDetailPage';
import type { GoalProgress } from './queries';

// Synthetic data only.
const ID = '6f1c2d3e-4a5b-4c6d-8e7f-9a0b1c2d3e4f';
const THIS_MONTH = '2026-09-01';
const useGoal = vi.fn();
const useGoalPace = vi.fn();

vi.mock('./queries', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./queries')>();
  return {
    ...actual,
    useGoal: () => useGoal(),
    useGoalPace: () => useGoalPace(),
    useGoalMonths: () => ({
      data: [
        { month: '2026-06-01', put_in_minor: 20000, taken_out_minor: 0, closing_balance_minor: 220000 },
        { month: '2026-07-01', put_in_minor: 20000, taken_out_minor: 100000, closing_balance_minor: 140000 },
        { month: '2026-08-01', put_in_minor: 20000, taken_out_minor: 0, closing_balance_minor: 160000 },
        { month: THIS_MONTH, put_in_minor: 20000, taken_out_minor: 0, closing_balance_minor: 180000 },
      ],
      isError: false,
    }),
  };
});
vi.mock('../accounts/queries', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../accounts/queries')>();
  return {
    ...actual,
    useAccounts: () => ({ data: [{ account_id: 'acc-trip', name: 'Travel fund', type: 'savings', archived_at: null }] }),
    useAccountLedger: () => ({ data: { rows: [] }, isError: false }),
  };
});
vi.mock('../transactions/queries', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../transactions/queries')>();
  return {
    ...actual,
    useUpdateTransaction: () => ({ mutateAsync: vi.fn(), isPending: false }),
    useTransaction: () => ({ data: undefined }),
  };
});
vi.mock('../categories/queries', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../categories/queries')>();
  return { ...actual, useCategories: () => ({ data: [] }), useCategoryUsage: () => ({ data: [] }) };
});
vi.mock('../../lib/profile', () => ({ useCurrency: () => 'USD', useProfile: () => ({ data: { timezone: 'UTC' } }) }));
vi.mock('../../lib/dates', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/dates')>();
  return { ...actual, monthStartInZone: () => THIS_MONTH, todayInZone: () => '2026-09-24' };
});

function goal(over: Partial<GoalProgress> = {}): GoalProgress {
  return {
    goal_id: ID,
    account_id: 'acc-trip',
    name: 'Travel',
    target_minor: 400000,
    target_date: '2027-06-30',
    monthly_plan_minor: 20000,
    achieved_at: null,
    archived_at: null,
    balance_minor: 180000,
    remaining_minor: 220000,
    this_month: THIS_MONTH,
    this_month_contributed_minor: 20000,
    ...over,
  };
}

function show() {
  render(
    <MemoryRouter initialEntries={[`/goals/${ID}`]}>
      <Routes>
        <Route path="/goals/:id" element={<GoalDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  useGoal.mockReturnValue({ data: goal(), isSuccess: true, isError: false });
  // 2,200.00 to go: 244.45 a month over the 9 months to June; at 200.00 a
  // month, 11 months, so August 2027.
  useGoalPace.mockReturnValue({
    data: { needed_monthly_minor: 24445, avg_put_in_minor: 20000, months_put_in: 6, estimated_month: '2027-08-01' },
    isError: false,
  });
});

describe('GoalDetailPage', () => {
  it('leads with what is saved, what arriving on time needs, the pace and an estimate tagged as one', () => {
    show();
    const band = screen.getByRole('region', { name: 'This goal' });
    expect(band).toHaveTextContent(/\$1,800\.00/);
    expect(band).toHaveTextContent(/\$244\.45.*a month/);
    expect(band).toHaveTextContent('9 months');
    expect(band).toHaveTextContent(/Estimate.*at the last 6 months’ pace/);
    expect(band).toHaveTextContent('August 2027');
  });

  it('says when the pace arrives against the date, and what arriving on time needs', () => {
    show();
    expect(screen.getByText(/What stands out/).closest('p')).toHaveTextContent(
      /At \$200\.00.*a month, Travel is reached around August 2027, 2 months late\. It needs \$244\.45.*a month to arrive by Jun 30, 2027\./,
    );
  });

  it('projects to the target only with 3 months of money put in', () => {
    show();
    expect(screen.getByRole('heading', { name: 'Where it is, and where the plan takes it' })).toBeInTheDocument();
  });

  it('draws no projection from fewer than 3 months', () => {
    useGoalPace.mockReturnValue({
      data: { needed_monthly_minor: 24445, avg_put_in_minor: 6667, months_put_in: 2, estimated_month: null },
      isError: false,
    });
    show();
    expect(screen.getByRole('heading', { name: 'Saved at each month end' })).toBeInTheDocument();
    expect(screen.getByText(/A projection needs 3 months/)).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'This goal' })).toHaveTextContent('Needs 3 months with money put in for an estimate');
  });

  it('draws no projection and gives no date without a target', () => {
    useGoal.mockReturnValue({ data: goal({ target_minor: null, target_date: null, remaining_minor: null }), isSuccess: true, isError: false });
    useGoalPace.mockReturnValue({
      data: { needed_monthly_minor: null, avg_put_in_minor: 20000, months_put_in: 6, estimated_month: null },
      isError: false,
    });
    show();
    expect(screen.getByRole('heading', { name: 'Saved at each month end' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'This goal' })).toHaveTextContent('No target, so no date');
  });

  it('keeps withdrawals visible below zero rather than netting them away', () => {
    show();
    expect(screen.getByRole('heading', { name: 'Put in and taken out' })).toBeInTheDocument();
  });
});
