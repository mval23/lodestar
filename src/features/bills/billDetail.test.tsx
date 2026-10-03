import { render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router';
import { addMonths } from '../../lib/dates';
import { BillDetailPage } from './BillDetailPage';
import type { BillHistoryMonth, RecurringItem } from './queries';

// Synthetic data only.
const ID = '6c0a3f1e-2b4d-4c5e-8f9a-0b1c2d3e4f5a';
const TODAY = new Date().toISOString().slice(0, 10);
const THIS_MONTH = `${TODAY.slice(0, 7)}-01`;
const CHANGED = addMonths(THIS_MONTH, -13);
const loaded = <T,>(data: T) => ({ data, isPending: false, isError: false, isSuccess: true, error: null });

const useBill = vi.fn();
const useBillHistory = vi.fn();
const useRecurringCosts = vi.fn();

vi.mock('./queries', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./queries')>();
  return {
    ...actual,
    useBill: () => useBill(),
    useBillHistory: () => useBillHistory(),
    useBillMonths: () => loaded([]),
    useBillPayments: () => loaded({ rows: [], total: 0 }),
    useMarkBillPaid: () => ({ mutateAsync: vi.fn(), isPending: false }),
  };
});
vi.mock('../reports/queries', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../reports/queries')>();
  return { ...actual, useRecurringCosts: () => useRecurringCosts() };
});
vi.mock('../accounts/queries', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../accounts/queries')>();
  return { ...actual, useAccounts: () => loaded([{ account_id: 'chk', name: 'Everyday checking', type: 'checking' }]) };
});
vi.mock('../categories/queries', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../categories/queries')>();
  return { ...actual, useCategories: () => loaded([{ id: 'rent', name: 'Rent', kind: 'expense', archived_at: null }]) };
});
vi.mock('../../lib/profile', () => ({ useCurrency: () => 'USD', useProfile: () => ({ data: { timezone: 'UTC' } }) }));

function bill(over: Partial<RecurringItem> = {}): RecurringItem {
  return {
    id: ID,
    user_id: 'u1',
    name: 'Rent',
    label: 'bill',
    kind: 'expense',
    amount_minor: 165000,
    amount_is_variable: false,
    from_account_id: 'chk',
    to_account_id: null,
    category_id: 'rent',
    category_kind: 'expense',
    cadence_unit: 'month',
    cadence_interval: 1,
    anchor_on: addMonths(THIS_MONTH, -23),
    next_due_on: addMonths(THIS_MONTH, 1),
    ends_on: null,
    archived_at: null,
    created_at: '2024-10-01T00:00:00Z',
    updated_at: '2024-10-01T00:00:00Z',
    ...over,
  };
}

// Two years of rent: 1,600.00 a month, then 1,650.00 from CHANGED on.
function history(missed: string[] = []): BillHistoryMonth[] {
  return Array.from({ length: 24 }, (_, i) => {
    const month = addMonths(THIS_MONTH, i - 23);
    const amount = month >= CHANGED ? 165000 : 160000;
    const gone = missed.includes(month);
    return {
      month,
      due_count: 1,
      paid_minor: gone ? 0 : amount,
      payment_count: gone ? 0 : 1,
      last_minor: gone ? null : amount,
      from_minor: i === 0 || gone ? null : month === CHANGED ? 160000 : amount,
      change_minor: i === 0 || gone ? null : month === CHANGED ? 5000 : 0,
      status: gone ? 'missed' : 'paid',
      months_due: 24,
      months_paid: 24 - missed.length,
      typical_month_minor: 382663,
    };
  });
}

function show() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[`/bills/${ID}`]}>
        <Routes>
          <Route path="/bills/:id" element={<BillDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  useBill.mockReturnValue(loaded(bill()));
  useBillHistory.mockReturnValue(loaded(history()));
  useRecurringCosts.mockReturnValue(
    loaded([
      { recurring_item_id: ID, yearly_minor: 1980000, paid_12m_minor: 1980000, payments_12m: 12, last_paid_on: THIS_MONTH,
        total_yearly_minor: 2461207, total_monthly_minor: 205101, subscriptions_yearly_minor: 13188, items: 4 },
    ]),
  );
});

describe('BillDetailPage', () => {
  it('leads with the next due date, a year of it, and its shares of bills and of a typical month', () => {
    show();
    const band = screen.getByRole('region', { name: 'This bill' });
    expect(within(band).getByText('Next due').closest('.fig-cell')).toHaveTextContent(/Due in \d+ days.*\$1,650\.00.*from Everyday checking/);
    expect(within(band).getByText('A year of it').closest('.fig-cell')).toHaveTextContent(/\$19,800\.00.*Monthly, 12 payments/);
    expect(within(band).getByText('Share of bills').closest('.fig-cell')).toHaveTextContent(/80\.4%.*of.*\$24,612\.07.*a year/);
    expect(within(band).getByText('Share of a typical month').closest('.fig-cell')).toHaveTextContent(/43\.1%.*of.*\$3,826\.63/);
  });

  it('calls out the price change, and judges months against the current schedule', () => {
    show();
    const changes = screen.getByRole('region', { name: 'Changes and gaps' });
    expect(changes).toHaveTextContent(/Up.*\$50\.00.*from/);
    expect(changes).toHaveTextContent(/\$1,600\.00.*→.*\$1,650\.00.*\+3\.1%.*\$600\.00.*more a year/);
    expect(changes).toHaveTextContent(/No missed months.*24 of 24 months paid.*judged against the current schedule/);
    expect(screen.getByText(/Rent is 43\.1% of a typical month’s spending/)).toBeInTheDocument();
  });

  it('names a month with nothing paid, judged against the current schedule, and leads with it', () => {
    const gap = addMonths(THIS_MONTH, -4);
    useBillHistory.mockReturnValue(loaded(history([gap])));
    show();
    const changes = screen.getByRole('region', { name: 'Changes and gaps' });
    expect(changes).toHaveTextContent(/1 month with no payment.*judged against the current schedule/);
    expect(screen.getByText(/1 of the last 24 months has no payment recorded/)).toBeInTheDocument();
  });

  it('calls out no price change when the amount varies', () => {
    useBill.mockReturnValue(loaded(bill({ amount_is_variable: true })));
    show();
    const changes = screen.getByRole('region', { name: 'Changes and gaps' });
    expect(changes).toHaveTextContent('The amount varies');
    expect(changes).not.toHaveTextContent(/Up.*from/);
  });
});
