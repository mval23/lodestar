import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BillsPage } from './BillsPage';
import { describeDue, describeSchedule, dueStateOf, kindForLabel, type RecurringItem } from './queries';

const useBills = vi.fn();
const markPaid = vi.fn();

vi.mock('./queries', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./queries')>();
  return {
    ...actual,
    useBills: () => useBills(),
    useMarkBillPaid: () => ({ mutateAsync: markPaid, isPending: false }),
    useCreateBill: () => ({ mutateAsync: vi.fn(), isPending: false }),
    useUpdateBill: () => ({ mutateAsync: vi.fn(), isPending: false }),
    useDeleteBill: () => ({ mutateAsync: vi.fn(), isPending: false }),
  };
});

vi.mock('../accounts/queries', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../accounts/queries')>();
  return { ...actual, useAccounts: () => ({ data: [] }) };
});

vi.mock('../../lib/profile', () => ({ useCurrency: () => 'USD', useProfile: () => ({ data: { timezone: 'UTC' } }) }));

// The page reads "today" from the profile's zone; pin it so the due-state
// tests are not a matter of when they run.
const TODAY = new Date().toISOString().slice(0, 10);
function shift(days: number): string {
  const date = new Date(`${TODAY}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function bill(over: Partial<RecurringItem> = {}): RecurringItem {
  return {
    id: 'b1',
    user_id: 'u1',
    name: 'Rent',
    label: 'bill',
    kind: 'expense',
    amount_minor: 120000,
    amount_is_variable: false,
    from_account_id: 'chk',
    to_account_id: null,
    category_id: null,
    category_kind: 'expense',
    cadence_unit: 'month',
    cadence_interval: 1,
    anchor_on: shift(0),
    next_due_on: shift(0),
    ends_on: null,
    archived_at: null,
    created_at: '',
    updated_at: '',
    ...over,
  };
}

beforeEach(() => {
  markPaid.mockReset().mockResolvedValue({ transaction_id: 't1', next_due_on: shift(30) });
  useBills.mockReturnValue({ data: [], isPending: false, isError: false, isSuccess: true });
});

describe('dueStateOf and describeDue', () => {
  it('separates overdue, today, this week and later', () => {
    expect(dueStateOf(shift(-1), TODAY)).toBe('overdue');
    expect(dueStateOf(TODAY, TODAY)).toBe('today');
    expect(dueStateOf(shift(3), TODAY)).toBe('soon');
    expect(dueStateOf(shift(30), TODAY)).toBe('later');
  });

  it('says how late or how soon, in words', () => {
    expect(describeDue(TODAY, TODAY)).toBe('Due today');
    expect(describeDue(shift(1), TODAY)).toBe('Due tomorrow');
    expect(describeDue(shift(5), TODAY)).toBe('Due in 5 days');
    expect(describeDue(shift(-1), TODAY)).toBe('Overdue by 1 day');
    expect(describeDue(shift(-4), TODAY)).toBe('Overdue by 4 days');
  });
});

describe('describeSchedule', () => {
  it('reads naturally for every cadence', () => {
    expect(describeSchedule('month', 1)).toBe('Monthly');
    expect(describeSchedule('month', 3)).toBe('Every 3 months');
    expect(describeSchedule('week', 2)).toBe('Every 2 weeks');
    expect(describeSchedule('year', 1)).toBe('Yearly');
  });
});

describe('kindForLabel', () => {
  it('keeps the label and kind in step, as the database requires', () => {
    // A subscription is always an expense; income is always income.
    expect(kindForLabel('subscription', 'transfer')).toBe('expense');
    expect(kindForLabel('income', 'expense')).toBe('income');
    expect(kindForLabel('transfer', 'expense')).toBe('transfer');
    // A bill may be either an expense or a transfer, so a valid choice stays.
    expect(kindForLabel('bill', 'transfer')).toBe('transfer');
    expect(kindForLabel('bill', 'income')).toBe('expense');
  });
});

describe('BillsPage', () => {
  it('invites a first bill when there are none', () => {
    render(<BillsPage />);
    expect(screen.getByText('No bills yet')).toBeInTheDocument();
  });

  it('puts what is due now above what is due later', () => {
    useBills.mockReturnValue({
      data: [bill({ id: 'a', name: 'Rent' }), bill({ id: 'b', name: 'Insurance', next_due_on: shift(40) })],
      isPending: false,
      isError: false,
      isSuccess: true,
    });
    render(<BillsPage />);
    expect(screen.getByText('Due now')).toBeInTheDocument();
    expect(screen.getByText('Later')).toBeInTheDocument();
    expect(screen.getByText('Due today')).toBeInTheDocument();
  });

  it('marks a fixed bill paid in one step, and says when it is next due', async () => {
    useBills.mockReturnValue({ data: [bill()], isPending: false, isError: false, isSuccess: true });
    render(<BillsPage />);
    await userEvent.click(screen.getByRole('button', { name: 'Mark as paid' }));
    expect(markPaid).toHaveBeenCalledWith(expect.objectContaining({ id: 'b1', paidOn: TODAY }));
    expect(await screen.findByText(/Recorded\. Next due/)).toBeInTheDocument();
  });

  it('asks for the amount when it varies, rather than inventing one', async () => {
    useBills.mockReturnValue({
      data: [bill({ amount_is_variable: true, name: 'Electricity' })],
      isPending: false,
      isError: false,
      isSuccess: true,
    });
    render(<BillsPage />);
    const field = screen.getByLabelText('Amount');
    await userEvent.clear(field);
    await userEvent.type(field, '84.20');
    await userEvent.click(screen.getByRole('button', { name: 'Mark as paid' }));
    expect(markPaid).toHaveBeenCalledWith(expect.objectContaining({ amountMinor: 8420 }));
  });

  it('refuses an amount it would have to round, and does not call the database', async () => {
    useBills.mockReturnValue({
      data: [bill({ amount_is_variable: true })],
      isPending: false,
      isError: false,
      isSuccess: true,
    });
    render(<BillsPage />);
    const field = screen.getByLabelText('Amount');
    await userEvent.clear(field);
    await userEvent.type(field, '10.005');
    await userEvent.click(screen.getByRole('button', { name: 'Mark as paid' }));
    expect(markPaid).not.toHaveBeenCalled();
    expect(screen.getByText(/at most 2 decimal places/)).toBeInTheDocument();
  });

  it('keeps the bill unpaid and explains when the database refuses', async () => {
    markPaid.mockRejectedValue({ code: '55000', message: 'This bill is archived.' });
    useBills.mockReturnValue({ data: [bill()], isPending: false, isError: false, isSuccess: true });
    render(<BillsPage />);
    await userEvent.click(screen.getByRole('button', { name: 'Mark as paid' }));
    expect(await screen.findByText(/archived/)).toBeInTheDocument();
    // The success message never appears, so nothing claims to be paid.
    expect(screen.queryByText(/Recorded\./)).not.toBeInTheDocument();
  });

  it('can pay on another date or for another amount', async () => {
    useBills.mockReturnValue({ data: [bill()], isPending: false, isError: false, isSuccess: true });
    render(<BillsPage />);
    await userEvent.click(screen.getByRole('button', { name: 'Different amount or date' }));
    expect(screen.getByLabelText('Amount')).toHaveValue('1200.00');
    await userEvent.click(screen.getByRole('button', { name: 'Mark as paid' }));
    expect(markPaid).toHaveBeenCalledWith(expect.objectContaining({ amountMinor: 120000 }));
  });
});
