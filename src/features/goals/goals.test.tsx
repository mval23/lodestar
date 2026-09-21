import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { GoalsPage } from './GoalsPage';
import { standingOf, type GoalProgress } from './queries';

const useGoals = vi.fn();

vi.mock('./queries', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./queries')>();
  return {
    ...actual,
    useGoals: () => useGoals(),
    useCreateGoal: () => ({ mutateAsync: vi.fn(), isPending: false }),
    useUpdateGoal: () => ({ mutateAsync: vi.fn(), isPending: false }),
    useDeleteGoal: () => ({ mutateAsync: vi.fn(), isPending: false }),
  };
});

vi.mock('../accounts/queries', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../accounts/queries')>();
  return { ...actual, useAccounts: () => ({ data: [] }) };
});

vi.mock('../../lib/profile', () => ({ useCurrency: () => 'USD', useProfile: () => ({ data: { timezone: 'UTC' } }) }));

function goal(over: Partial<GoalProgress> = {}): GoalProgress {
  return {
    goal_id: 'g1',
    account_id: 'acc-1',
    name: 'Emergency fund',
    target_minor: 100000,
    target_date: null,
    monthly_plan_minor: null,
    achieved_at: null,
    archived_at: null,
    balance_minor: 50000,
    remaining_minor: 50000,
    this_month: '2026-09-01',
    this_month_contributed_minor: 0,
    ...over,
  };
}

beforeEach(() => {
  useGoals.mockReturnValue({ data: [], isPending: false, isError: false, isSuccess: true });
});

describe('standingOf', () => {
  it('reports the share saved so far', () => {
    expect(standingOf(goal(), '2026-09-01').share).toBe(50);
    expect(standingOf(goal({ balance_minor: 0 }), '2026-09-01').share).toBe(0);
  });

  it('knows when the target is reached, and does not run past 100', () => {
    const standing = standingOf(goal({ balance_minor: 120000 }), '2026-09-01');
    expect(standing.reached).toBe(true);
    expect(standing.share).toBe(100);
  });

  it('divides what is left over the months remaining', () => {
    // 50,000 left over 5 months (September to February).
    const standing = standingOf(goal({ target_date: '2027-02-01' }), '2026-09-01');
    expect(standing.monthsLeft).toBe(5);
    expect(standing.neededPerMonth).toBe(10000);
  });

  it('rounds the monthly figure up, so the target is met rather than missed by a cent', () => {
    const standing = standingOf(goal({ target_minor: 10000, balance_minor: 0, target_date: '2026-12-01' }), '2026-09-01');
    expect(standing.monthsLeft).toBe(3);
    expect(standing.neededPerMonth).toBe(3334); // 10000 / 3 = 3333.33
  });

  it('asks for the whole remainder once the date has arrived or passed', () => {
    expect(standingOf(goal({ target_date: '2026-09-01' }), '2026-09-01').neededPerMonth).toBe(50000);
    expect(standingOf(goal({ target_date: '2026-06-01' }), '2026-09-01').monthsLeft).toBe(-3);
    expect(standingOf(goal({ target_date: '2026-06-01' }), '2026-09-01').neededPerMonth).toBe(50000);
  });

  it('asks for nothing more once the target is met, even past the date', () => {
    const standing = standingOf(goal({ balance_minor: 150000, target_date: '2026-06-01' }), '2026-09-01');
    expect(standing.neededPerMonth).toBe(0);
  });

  it('leaves the monthly figure unset without a target or a date', () => {
    expect(standingOf(goal({ target_minor: null }), '2026-09-01').neededPerMonth).toBeNull();
    expect(standingOf(goal({ target_date: null }), '2026-09-01').neededPerMonth).toBeNull();
    expect(standingOf(goal({ target_minor: null }), '2026-09-01').share).toBe(0);
  });
});

describe('GoalsPage', () => {
  it('invites a first goal when there are none', () => {
    render(<MemoryRouter><GoalsPage /></MemoryRouter>);
    expect(screen.getByText('No goals yet')).toBeInTheDocument();
  });

  it('shows the balance, the target and what is left to save', () => {
    useGoals.mockReturnValue({ data: [goal()], isPending: false, isError: false, isSuccess: true });
    render(<MemoryRouter><GoalsPage /></MemoryRouter>);
    expect(screen.getByText('Emergency fund')).toBeInTheDocument();
    expect(screen.getAllByText('$500.00').length).toBeGreaterThan(0);
    expect(screen.getByText(/to go/)).toBeInTheDocument();
    expect(screen.getAllByText('$1,000.00').length).toBeGreaterThan(0);
  });

  it('says so plainly when the target is reached', () => {
    useGoals.mockReturnValue({
      data: [goal({ balance_minor: 100000 })],
      isPending: false,
      isError: false,
      isSuccess: true,
    });
    render(<MemoryRouter><GoalsPage /></MemoryRouter>);
    expect(screen.getByText('Target reached.')).toBeInTheDocument();
  });

  it('works without a target at all', () => {
    useGoals.mockReturnValue({
      data: [goal({ target_minor: null, remaining_minor: null })],
      isPending: false,
      isError: false,
      isSuccess: true,
    });
    render(<MemoryRouter><GoalsPage /></MemoryRouter>);
    expect(screen.getByText('No target')).toBeInTheDocument();
    expect(screen.getByText('Growing with every transfer in.')).toBeInTheDocument();
  });

  it('reports what was set aside this month against the plan', () => {
    useGoals.mockReturnValue({
      data: [goal({ this_month_contributed_minor: 25000, monthly_plan_minor: 30000 })],
      isPending: false,
      isError: false,
      isSuccess: true,
    });
    render(<MemoryRouter><GoalsPage /></MemoryRouter>);
    expect(screen.getByText(/set aside this month/)).toBeInTheDocument();
    expect(screen.getAllByText('$250.00').length).toBeGreaterThan(0);
    expect(screen.getAllByText('$300.00').length).toBeGreaterThan(0);
  });

  it('leaves an archived goal off the list', () => {
    useGoals.mockReturnValue({
      data: [goal({ archived_at: '2026-01-01T00:00:00Z' })],
      isPending: false,
      isError: false,
      isSuccess: true,
    });
    render(<MemoryRouter><GoalsPage /></MemoryRouter>);
    expect(screen.queryByText('Emergency fund')).not.toBeInTheDocument();
  });
});
