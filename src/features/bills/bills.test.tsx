import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { BillsPage } from './BillsPage';
import {
  describeDue,
  describeSchedule,
  dueStateOf,
  kindForLabel,
  perMonth,
  recordAction,
  type RecurringItem,
} from './queries';

const useBills = vi.fn();
const markPaid = vi.fn();
const useUpcomingItems = vi.fn();
const useMonthBillPayments = vi.fn();
// Which layout the page picks: a phone's columns, or the wide agenda.
const screenSize = { phone: true };

vi.mock('../../lib/media', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/media')>();
  return { ...actual, useMediaQuery: (query: string) => query === actual.PHONE && screenSize.phone };
});

vi.mock('../months/queries', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../months/queries')>();
  return { ...actual, useMonthBillPayments: () => useMonthBillPayments() };
});

vi.mock('./queries', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./queries')>();
  return {
    ...actual,
    useBills: () => useBills(),
    useUpcomingItems: () => useUpcomingItems(),
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

vi.mock('../goals/queries', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../goals/queries')>();
  return { ...actual, useGoals: () => ({ data: [{ goal_id: 'g1', account_id: 'fund', name: 'Travel', archived_at: null }] }) };
});

vi.mock('../categories/queries', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../categories/queries')>();
  return { ...actual, useCategories: () => ({ data: [] }), useCategoryUsage: () => ({ data: [] }) };
});

vi.mock('../../lib/profile', () => ({
  useCurrency: () => 'USD',
  useProfile: () => ({ data: { timezone: 'UTC', week_start: 1 } }),
}));

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
  screenSize.phone = true;
  markPaid.mockReset().mockResolvedValue({ transaction_id: 't1', next_due_on: shift(30) });
  useBills.mockReturnValue({ data: [], isPending: false, isError: false, isSuccess: true });
  useUpcomingItems.mockReturnValue({ data: [] });
  useMonthBillPayments.mockReturnValue({ data: [] });
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

describe('perMonth', () => {
  it('is exact for monthly schedules and says when it had to round', () => {
    expect(perMonth({ amount_minor: 20000, cadence_unit: 'month', cadence_interval: 1 })).toEqual({ minor: 20000, exact: true });
    expect(perMonth({ amount_minor: 120000, cadence_unit: 'year', cadence_interval: 1 })).toEqual({ minor: 10000, exact: true });
    expect(perMonth({ amount_minor: 5000, cadence_unit: 'month', cadence_interval: 2 })).toEqual({ minor: 2500, exact: true });
    // $50 a week is $216.666… a month.
    expect(perMonth({ amount_minor: 5000, cadence_unit: 'week', cadence_interval: 1 })).toEqual({ minor: 21667, exact: false });
  });
});

describe('recordAction', () => {
  it('pays a bill, receives income and marks a transfer done', () => {
    expect(recordAction('expense')).toBe('Mark as paid');
    expect(recordAction('income')).toBe('Mark as received');
    expect(recordAction('transfer')).toBe('Mark as done');
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

// The phone's layout: a column for each kind.
describe('BillsPage', () => {
  it('invites a first bill when there are none', () => {
    render(<MemoryRouter><BillsPage /></MemoryRouter>);
    expect(screen.getByText('No bills yet')).toBeInTheDocument();
  });

  it('puts the next seven days above what is due later, with their total', () => {
    useBills.mockReturnValue({
      data: [bill({ id: 'a', name: 'Rent' }), bill({ id: 'b', name: 'Insurance', next_due_on: shift(40) })],
      isPending: false,
      isError: false,
      isSuccess: true,
    });
    render(<MemoryRouter><BillsPage /></MemoryRouter>);
    expect(screen.getByText('Next 7 days')).toBeInTheDocument();
    expect(screen.getByText('Later')).toBeInTheDocument();
    expect(screen.getByText('Due today')).toBeInTheDocument();
    expect(screen.getByText('Due in the next 7 days')).toBeInTheDocument();
    // Only the bill due this week can be marked paid from the list.
    expect(screen.getAllByRole('button', { name: 'Mark as paid' })).toHaveLength(1);
  });

  it('counts only bills as due, names income arriving beside them, and receives income', async () => {
    useBills.mockReturnValue({
      data: [
        bill({ id: 'a', name: 'Rent' }),
        bill({ id: 'p', name: 'Consulting', label: 'income', kind: 'income', amount_minor: 600000, from_account_id: null, to_account_id: 'chk' }),
      ],
      isPending: false,
      isError: false,
      isSuccess: true,
    });
    render(<MemoryRouter><BillsPage /></MemoryRouter>);
    const band = screen.getByText('Due in the next 7 days').closest('section')!;
    // $1,200.00 of rent; the $6,000.00 of income is not a bill.
    expect(band).toHaveTextContent(/\$1,200\.00.*1 bill.*\+\$6,000\.00.*arriving/);
    expect(band).not.toHaveTextContent('$7,200.00');
    await userEvent.click(screen.getByRole('button', { name: 'Mark as received' }));
    expect(markPaid).toHaveBeenCalledWith(expect.objectContaining({ id: 'p' }));
    expect(await screen.findByText(/Recorded\. Next expected/)).toBeInTheDocument();
  });

  it('says nothing is due when only income is coming this week', () => {
    useBills.mockReturnValue({
      data: [
        bill({ id: 'p', name: 'Consulting', label: 'income', kind: 'income', amount_minor: 600000, from_account_id: null, to_account_id: 'chk' }),
        bill({ id: 'b', name: 'Insurance', next_due_on: shift(40) }),
      ],
      isPending: false,
      isError: false,
      isSuccess: true,
    });
    render(<MemoryRouter><BillsPage /></MemoryRouter>);
    expect(screen.queryByText('Due in the next 7 days')).not.toBeInTheDocument();
    const band = screen.getByText('Next due').closest('section')!;
    expect(band).toHaveTextContent(/Insurance.*Nothing is due in the next 7 days.*\+\$6,000\.00.*arriving/);
  });

  it('marks a fixed bill paid in one step, and says when it is next due', async () => {
    useBills.mockReturnValue({ data: [bill()], isPending: false, isError: false, isSuccess: true });
    render(<MemoryRouter><BillsPage /></MemoryRouter>);
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
    render(<MemoryRouter><BillsPage /></MemoryRouter>);
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
    render(<MemoryRouter><BillsPage /></MemoryRouter>);
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
    render(<MemoryRouter><BillsPage /></MemoryRouter>);
    await userEvent.click(screen.getByRole('button', { name: 'Mark as paid' }));
    expect(await screen.findByText(/archived/)).toBeInTheDocument();
    // The success message never appears, so nothing claims to be paid.
    expect(screen.queryByText(/Recorded\./)).not.toBeInTheDocument();
  });

  it('marks a scheduled transfer done, and names it beside the bills rather than in their total', async () => {
    useBills.mockReturnValue({
      data: [
        bill({ id: 'a', name: 'Rent' }),
        bill({ id: 't', name: 'Travel', label: 'transfer', kind: 'transfer', amount_minor: 20000, to_account_id: 'fund' }),
      ],
      isPending: false,
      isError: false,
      isSuccess: true,
    });
    render(<MemoryRouter><BillsPage /></MemoryRouter>);
    const band = screen.getByText('Due in the next 7 days').closest('section')!;
    expect(band).toHaveTextContent(/\$1,200\.00.*1 bill.*\$200\.00 to move into goals/);
    expect(band).not.toHaveTextContent('$1,400.00');
    await userEvent.click(screen.getByRole('button', { name: 'Mark as done' }));
    expect(markPaid).toHaveBeenCalledWith(expect.objectContaining({ id: 't' }));
    expect(await screen.findByText(/Recorded\. Next due/)).toBeInTheDocument();
  });

  it('puts bills, transfers and income in a column each, and offers to add to an empty one', async () => {
    useBills.mockReturnValue({
      data: [
        bill({ id: 'a', name: 'Rent' }),
        bill({ id: 's', name: 'Music', label: 'subscription', next_due_on: shift(20) }),
        bill({ id: 't', name: 'Travel', label: 'transfer', kind: 'transfer', amount_minor: 20000, to_account_id: 'fund' }),
      ],
      isPending: false,
      isError: false,
      isSuccess: true,
    });
    render(<MemoryRouter><BillsPage /></MemoryRouter>);
    const bills = screen.getByRole('region', { name: 'Bills' });
    const transfers = screen.getByRole('region', { name: 'Transfers' });
    const income = screen.getByRole('region', { name: 'Income' });
    expect(within(bills).getByText('Rent')).toBeInTheDocument();
    expect(within(bills).getByText('Music')).toBeInTheDocument();
    expect(within(bills).queryByText('Travel')).not.toBeInTheDocument();
    expect(within(transfers).getByText('Travel')).toBeInTheDocument();
    expect(within(transfers).getByRole('button', { name: 'Mark as done' })).toBeInTheDocument();
    expect(within(income).getByText(/No income expected/)).toBeInTheDocument();
    await userEvent.click(within(income).getByRole('button', { name: 'Add income' }));
    // The sheet opens as income: money arrives, so it asks where, not from where.
    expect(screen.getAllByText('Paid into').length).toBeGreaterThan(0);
    expect(screen.queryAllByText('Paid from')).toHaveLength(0);
  });

  it('opens the sheet as a transfer from "Schedule a transfer"', async () => {
    render(<MemoryRouter><BillsPage /></MemoryRouter>);
    await userEvent.click(screen.getByRole('button', { name: 'Schedule a transfer' }));
    expect(screen.getByRole('button', { name: 'Schedule transfer' })).toBeInTheDocument();
    expect(screen.getAllByText('From').length).toBeGreaterThan(0);
    expect(screen.getAllByText('To').length).toBeGreaterThan(0);
    expect(screen.queryAllByText('Category')).toHaveLength(0);
  });

  it('can pay on another date or for another amount', async () => {
    useBills.mockReturnValue({ data: [bill()], isPending: false, isError: false, isSuccess: true });
    render(<MemoryRouter><BillsPage /></MemoryRouter>);
    await userEvent.click(screen.getByRole('button', { name: 'Different amount or date' }));
    expect(screen.getByLabelText('Amount')).toHaveValue('1200.00');
    await userEvent.click(screen.getByRole('button', { name: 'Mark as paid' }));
    expect(markPaid).toHaveBeenCalledWith(expect.objectContaining({ amountMinor: 120000 }));
  });
});

// A wide screen: one agenda by date, with the month beside it.
describe('BillsPage on a wide screen', () => {
  const MONTH = `${TODAY.slice(0, 7)}-01`;
  const show = () => render(<MemoryRouter><BillsPage /></MemoryRouter>);
  const agendaOf = (items: RecurringItem[]) =>
    useBills.mockReturnValue({ data: items, isPending: false, isError: false, isSuccess: true });

  beforeEach(() => {
    screenSize.phone = false;
  });

  it('groups what is coming by day, overdue first and later last, with no columns', () => {
    agendaOf([
      bill({ id: 'late', name: 'Gym', next_due_on: shift(-2) }),
      bill({ id: 'now', name: 'Rent', next_due_on: TODAY }),
      bill({ id: 'soon', name: 'Internet', next_due_on: shift(1) }),
      bill({ id: 'later', name: 'Taxes', next_due_on: shift(30) }),
    ]);
    show();
    const titles = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(titles.slice(0, 4)).toEqual([
      'Overdue',
      expect.stringMatching(/^Today · /),
      expect.stringMatching(/^Tomorrow · /),
      'Later',
    ]);
    expect(screen.queryByRole('region', { name: 'Transfers' })).not.toBeInTheDocument();
    // The coming week can be checked off; later ones are paid from their page.
    expect(screen.getByRole('button', { name: 'Mark as paid: Gym' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mark as paid: Taxes' })).not.toBeInTheDocument();
    expect(screen.getByText('Gym').closest('li')).toHaveTextContent('Overdue by 2 days');
  });

  it('records a fixed amount in one click, and says so', async () => {
    agendaOf([bill()]);
    show();
    await userEvent.click(screen.getByRole('button', { name: 'Mark as paid: Rent' }));
    expect(markPaid).toHaveBeenCalledWith({ id: 'b1', paidOn: TODAY });
    expect(await screen.findByText(/Rent recorded\. Next due/)).toBeInTheDocument();
  });

  it('asks for a varying amount under its row before recording it', async () => {
    agendaOf([bill({ name: 'Electricity', amount_is_variable: true })]);
    show();
    const check = screen.getByRole('button', { name: 'Mark as paid: Electricity' });
    await userEvent.click(check);
    expect(markPaid).not.toHaveBeenCalled();
    expect(check).toHaveAttribute('aria-expanded', 'true');
    const field = screen.getByLabelText('Amount');
    await userEvent.clear(field);
    await userEvent.type(field, '84.20');
    await userEvent.click(screen.getByRole('button', { name: 'Mark as paid' }));
    expect(markPaid).toHaveBeenCalledWith(expect.objectContaining({ amountMinor: 8420 }));
    expect(await screen.findByText(/Electricity recorded\./)).toBeInTheDocument();
  });

  it('names transfers and income, and filters to one kind', async () => {
    agendaOf([
      bill({ id: 'b', name: 'Rent' }),
      bill({ id: 't', name: 'Trip fund', label: 'transfer', kind: 'transfer', to_account_id: 'fund' }),
      bill({ id: 'i', name: 'Pay', label: 'income', kind: 'income', from_account_id: null, to_account_id: 'chk' }),
    ]);
    show();
    expect(screen.getByText('Trip fund').closest('li')).toHaveTextContent('Transfer');
    expect(screen.getByRole('button', { name: 'Mark as done: Trip fund' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mark as received: Pay' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('radio', { name: /Transfers/ }));
    expect(screen.getByText('Trip fund')).toBeInTheDocument();
    expect(screen.queryByText('Rent')).not.toBeInTheDocument();
    expect(screen.queryByText('Pay')).not.toBeInTheDocument();
  });

  it('marks the month: what is still due, what is done, and how far along each kind is', () => {
    agendaOf([
      bill({ id: 'rent', name: 'Rent', amount_minor: 120000, next_due_on: shift(40) }),
      bill({ id: 'net', name: 'Internet', amount_minor: 6300, next_due_on: TODAY }),
    ]);
    // Rent was paid on the 1st; Internet is still due today.
    useMonthBillPayments.mockReturnValue({ data: [{ recurring_item_id: 'rent', paid_minor: 120000, last_paid_on: MONTH }] });
    useUpcomingItems.mockReturnValue({
      data: [{ recurring_item_id: 'net', kind: 'expense', due_on: TODAY, amount_minor: 6300 }],
    });
    show();
    expect(screen.getByRole('button', { name: new RegExp(`, 1 due`) })).toHaveAttribute('aria-current', 'date');
    const soFar = screen.getByRole('region', { name: 'This month so far' });
    // $1,200.00 paid of $1,263.00.
    expect(soFar).toHaveTextContent(/Bills paid.*\$1,200\.00.*of.*\$1,263\.00/);
    expect(soFar).not.toHaveTextContent('Transfers done');
  });
});
