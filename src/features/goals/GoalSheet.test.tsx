import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GoalSheet } from './GoalSheet';
import type { GoalProgress } from './queries';

const create = vi.fn();
const update = vi.fn();

vi.mock('./queries', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./queries')>();
  return {
    ...actual,
    useGoals: () => ({ data: [goal()] }),
    useCreateGoal: () => ({ mutateAsync: create, isPending: false }),
    useUpdateGoal: () => ({ mutateAsync: update, isPending: false }),
    useDeleteGoal: () => ({ mutateAsync: vi.fn(), isPending: false }),
  };
});

vi.mock('../accounts/queries', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../accounts/queries')>();
  return {
    ...actual,
    useAccounts: () => ({
      data: [
        { account_id: 'acc-travel', name: 'Travel', type: 'savings', archived_at: null },
        { account_id: 'acc-rainy', name: 'Rainy day', type: 'savings', archived_at: null },
      ],
    }),
  };
});

vi.mock('../../lib/profile', () => ({ useCurrency: () => 'USD' }));

function goal(over: Partial<GoalProgress> = {}): GoalProgress {
  return {
    goal_id: 'g1',
    account_id: 'acc-travel',
    name: 'Travel',
    target_minor: null,
    target_date: null,
    monthly_plan_minor: 10000,
    achieved_at: null,
    archived_at: null,
    balance_minor: 0,
    remaining_minor: null,
    this_month: '2026-09-01',
    this_month_contributed_minor: 0,
    ...over,
  } as GoalProgress;
}

beforeEach(() => {
  create.mockReset().mockResolvedValue({ id: 'new' });
  update.mockReset().mockResolvedValue({ id: 'g1' });
});

describe('GoalSheet', () => {
  it('saves an edit without the account, which the database will not let a goal change', async () => {
    render(<GoalSheet goal={goal()} onClose={vi.fn()} />);
    const plan = screen.getByLabelText('Monthly plan');
    await userEvent.clear(plan);
    await userEvent.type(plan, '150');
    await userEvent.click(screen.getByRole('button', { name: 'Save goal' }));

    expect(update).toHaveBeenCalledTimes(1);
    const { changes } = update.mock.calls[0]![0];
    expect(changes).not.toHaveProperty('account_id');
    expect(changes).toMatchObject({ name: 'Travel', monthly_plan_minor: 15000 });
  });

  it('shows the account as fixed while editing, and says how to move it', () => {
    render(<GoalSheet goal={goal()} onClose={vi.fn()} />);
    expect(screen.getByLabelText('Account')).toHaveValue('Travel');
    expect(screen.getByLabelText('Account')).toHaveAttribute('readonly');
    expect(screen.getByText(/A goal stays with its account/)).toBeInTheDocument();
  });

  it('still chooses the account when adding a goal', async () => {
    render(<GoalSheet onClose={vi.fn()} />);
    await userEvent.type(screen.getByLabelText('Name'), 'Rainy day');
    await userEvent.click(screen.getByRole('button', { name: /^Account,/ }));
    await userEvent.click(screen.getByRole('option', { name: 'Rainy day' }));
    await userEvent.click(screen.getByRole('button', { name: 'Add goal' }));

    expect(create).toHaveBeenCalledWith(expect.objectContaining({ name: 'Rainy day', account_id: 'acc-rainy' }));
  });
});
