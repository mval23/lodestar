import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router';
import { addMonths } from '../../lib/dates';
import { DebtReportPage } from './DebtReportPage';
import { RecurringReportPage } from './RecurringReportPage';
import { RunwayReportPage } from './RunwayReportPage';
import type { DebtLine, RunwayLine } from './queries';

// Synthetic data only.
const THIS_MONTH = `${new Date().toISOString().slice(0, 7)}-01`;
const LAST = addMonths(THIS_MONTH, -1);
const loaded = <T,>(data: T) => ({ data, isPending: false, isError: false, isSuccess: true, error: null });
const useCashRunway = vi.fn();

vi.mock('./queries', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./queries')>();
  return {
    ...actual,
    useFirstActivityMonth: () => loaded('2024-10-01'),
    useRecurringCosts: () =>
      loaded([
        { recurring_item_id: 'rent', yearly_minor: 1980000, paid_12m_minor: 1980000, payments_12m: 12, last_paid_on: '2026-09-01',
          total_yearly_minor: 2091186, total_monthly_minor: 174266, subscriptions_yearly_minor: 13188, items: 3 },
        { recurring_item_id: 'elec', yearly_minor: 97998, paid_12m_minor: 97998, payments_12m: 12, last_paid_on: '2026-09-12',
          total_yearly_minor: 2091186, total_monthly_minor: 174266, subscriptions_yearly_minor: 13188, items: 3 },
        { recurring_item_id: 'music', yearly_minor: 13188, paid_12m_minor: 13188, payments_12m: 12, last_paid_on: '2026-09-14',
          total_yearly_minor: 2091186, total_monthly_minor: 174266, subscriptions_yearly_minor: 13188, items: 3 },
      ]),
    useFixedFlexible: () =>
      loaded([{ month: LAST, fixed_minor: 180000, flexible_minor: 150000, total_minor: 330000, fixed_total_minor: 2000000, all_total_minor: 4000000 }]),
    usePossibleRecurring: () =>
      loaded([
        { description: 'Car wash', category_id: 'transport', account_id: 'card', typical_minor: 1800, yearly_minor: 21600, months_seen: 12,
          run_months: 12, last_on: '2026-09-26', confidence: 'high', found: 1, found_yearly_minor: 21600 },
      ]),
    useCashRunway: () => useCashRunway(),
    useReportCashFlow: () => loaded([]),
    useDebtSummary: () => loaded(DEBTS),
    useAccountMonthFlows: () => loaded([]),
  };
});
vi.mock('../bills/queries', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../bills/queries')>();
  const bill = (id: string, name: string, label: string, amount: number, variable = false) => ({
    id, name, label, kind: 'expense', amount_minor: amount, amount_is_variable: variable, cadence_unit: 'month', cadence_interval: 1, archived_at: null,
  });
  return { ...actual, useBills: () => loaded([bill('rent', 'Rent', 'bill', 165000), bill('elec', 'Electric bill', 'bill', 11000, true), bill('music', 'Music', 'subscription', 1099)]) };
});
vi.mock('../bills/BillSheet', () => ({
  BillSheet: ({ prefill }: { prefill?: { name?: string; amount_minor?: number } }) => (
    <p>
      New bill: {prefill?.name} at {prefill?.amount_minor}
    </p>
  ),
}));
vi.mock('../categories/queries', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../categories/queries')>();
  return {
    ...actual,
    useCategories: () => loaded([{ id: 'transport', name: 'Transport', kind: 'expense', archived_at: null }]),
    useCategoryGroups: () => loaded([{ id: 'ess', name: 'Essentials' }]),
  };
});
vi.mock('../accounts/queries', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../accounts/queries')>();
  return { ...actual, useAccounts: () => loaded([]) };
});
vi.mock('../../lib/profile', () => ({ useCurrency: () => 'USD', useProfile: () => ({ data: { timezone: 'UTC' } }) }));

const DEBTS: DebtLine[] = [
  { account_id: 'loan', name: 'Car loan', type: 'loan', start_minor: -1018000, end_minor: -556000, balance_minor: -556000, paid_minor: 462000,
    purchases_minor: 0, months_with_purchases: 0, months_paid_full: 0, recent_payment_minor: 38500, payments_left: 15, payoff_month: '2027-12-01',
    total_start_minor: -1150692, total_end_minor: -694948, total_paid_minor: 2495744 },
  { account_id: 'card', name: 'Visa card', type: 'credit_card', start_minor: -132692, end_minor: -138948, balance_minor: -40000, paid_minor: 2033744,
    purchases_minor: 2040000, months_with_purchases: 12, months_paid_full: 12, recent_payment_minor: 170000, payments_left: 1, payoff_month: '2026-10-01',
    total_start_minor: -1150692, total_end_minor: -694948, total_paid_minor: 2495744 },
];

const line = (l: RunwayLine['line'], amount: number, months: number | null, name: string | null = null, n: number | null = null): RunwayLine => ({
  line: l, account_id: name, name, amount_minor: amount, months, n,
});

function show(path: string) {
  render(
    <QueryClientProvider client={new QueryClient()}>
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/reports/recurring" element={<RecurringReportPage />} />
        <Route path="/reports/runway" element={<RunwayReportPage />} />
        <Route path="/reports/debt" element={<DebtReportPage />} />
      </Routes>
    </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  useCashRunway.mockReturnValue(
    loaded([
      line('account', 798797, null, 'Everyday checking'),
      line('account', -138948, null, 'Visa card'),
      line('available', 659849, 1.7),
      line('goal', 1235000, 3.3, 'Emergency fund'),
      line('goals', 1235000, 3.3),
      line('spending', 379341, null, null, 6),
      line('loan_payments', 38500, null, null, 6),
      line('runway', 1894849, 5.0),
      line('runway_loans', 1894849, 4.5),
    ]),
  );
});

describe('Recurring payments', () => {
  it('gives the yearly cost from Postgres, with variable bills tagged', () => {
    show('/reports/recurring');
    const band = screen.getByRole('region', { name: 'Recurring payments' });
    expect(band).toHaveTextContent(/\$20,911\.86/);
    expect(band).toHaveTextContent('50%');
    expect(screen.getByRole('link', { name: 'Electric bill' }).closest('tr')).toHaveTextContent(/about.*\$110\.00.*\$979\.98.*Varies/);
  });

  it('sets a possible payment up as a bill only when asked, filled in from the match', async () => {
    show('/reports/recurring');
    const card = screen.getByText('Car wash').closest('li')!;
    expect(card).toHaveTextContent('High confidence');
    expect(screen.queryByText(/New bill/)).not.toBeInTheDocument();
    await userEvent.click(within(card).getByRole('button', { name: 'Set up as a bill' }));
    expect(screen.getByText('New bill: Car wash at 1800')).toBeInTheDocument();
  });
});

describe('Cash runway', () => {
  it('shows the same figures as its calculation basis, every one tagged an estimate', () => {
    show('/reports/runway');
    const band = screen.getByRole('region', { name: 'Runway' });
    expect(band).toHaveTextContent('5.0 months');
    expect(band).toHaveTextContent(/Estimate/);
    const basis = screen.getByRole('table');
    expect(within(basis).getByText('Runway').closest('tr')).toHaveTextContent(/5\.0 months.*4\.5 months if the.*\$385\.00/);
    expect(within(basis).getByText('Available cash').closest('tr')).toHaveTextContent(/\$6,598\.49/);
  });

  it('shows a group’s runway only once a group is picked', () => {
    show('/reports/runway');
    expect(screen.getByRole('region', { name: 'Runway' })).toHaveTextContent('Pick a category group above');
  });
});

describe('Debt repayment', () => {
  it('keeps debts negative, and tags the payoff month an estimate', () => {
    show('/reports/debt');
    const band = screen.getByRole('region', { name: 'Debt' });
    expect(band).toHaveTextContent(/−\$6,949\.48/);
    expect(band).toHaveTextContent(/Debt reduced by.*\$4,557\.44/);
    expect(band).toHaveTextContent(/Car loan paid off.*Estimate.*December 2027/);
    const accounts = screen.getByRole('region', { name: 'By account' });
    expect(within(accounts).getByText('Car loan').closest('li')).toHaveTextContent(/−\$5,560\.00/);
    expect(within(accounts).getByText('Visa card').closest('li')).toHaveTextContent('Paid in full every month');
  });
});
