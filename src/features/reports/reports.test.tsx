import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { addMonths } from '../../lib/dates';
import type { AccountBalance } from '../accounts/queries';
import { CashFlowReportPage } from './CashFlowReportPage';
import { NetWorthReportPage } from './NetWorthReportPage';
import { ReportsPage } from './ReportsPage';
import { compareStart, filterSearch, parseFilters, periodRange, rangeLabel, scopeAccountIds } from './filters';
import { transfersOf, typicalBasis, typicalNet, type NetWorthMonth, type ReportMonth, type ReportTotals } from './queries';

const useReportSummary = vi.fn();
const useReportCashFlow = vi.fn();
const useNetWorthRange = vi.fn();
const useNetWorthByAccount = vi.fn();
const useNetWorthChange = vi.fn();
const useCurrentMonthFlow = vi.fn();
const useFirstActivityMonth = vi.fn();
const useAccounts = vi.fn();

vi.mock('./queries', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./queries')>();
  return {
    ...actual,
    useReportSummary: (...args: unknown[]) => useReportSummary(...args),
    useReportCashFlow: (...args: unknown[]) => useReportCashFlow(...args),
    useNetWorthRange: (...args: unknown[]) => useNetWorthRange(...args),
    useNetWorthByAccount: (...args: unknown[]) => useNetWorthByAccount(...args),
    useNetWorthChange: (...args: unknown[]) => useNetWorthChange(...args),
    useCurrentMonthFlow: () => useCurrentMonthFlow(),
    useFirstActivityMonth: () => useFirstActivityMonth(),
  };
});
vi.mock('../accounts/queries', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../accounts/queries')>();
  return { ...actual, useAccounts: () => useAccounts() };
});
vi.mock('../../lib/profile', () => ({
  useCurrency: () => 'USD',
  useProfile: () => ({ data: { timezone: 'UTC' } }),
}));

const THIS_MONTH = `${new Date().toISOString().slice(0, 7)}-01`;
const FROM = addMonths(THIS_MONTH, -12);
const loaded = <T,>(data: T) => ({ data, isPending: false, isError: false, isSuccess: true, error: null });

function totals(over: Partial<ReportTotals> = {}): ReportTotals {
  return {
    period: 'current',
    period_from: FROM,
    period_to: THIS_MONTH,
    money_in_minor: 6607000,
    money_out_minor: 4593845,
    net_minor: 2013155,
    to_goals_minor: 1500000,
    from_goals_minor: 205000,
    card_payments_minor: 2033744,
    loan_payments_minor: 462000,
    cash_withdrawals_minor: 120000,
    other_transfers_minor: 0,
    months: 12,
    active_months: 12,
    ...over,
  };
}
const before = totals({
  period: 'compare',
  period_from: addMonths(FROM, -12),
  period_to: FROM,
  money_in_minor: 6330000,
  money_out_minor: 4315464,
  net_minor: 2014536,
});

function month(m: string, moneyIn: number, moneyOut: number, active = true): ReportMonth {
  return {
    month: m,
    money_in_minor: moneyIn,
    money_out_minor: moneyOut,
    net_minor: moneyIn - moneyOut,
    to_goals_minor: 0,
    from_goals_minor: 0,
    moved_in_minor: 0,
    moved_out_minor: 0,
    active,
  };
}

function worth(m: string, assets: number, liabilities: number): NetWorthMonth {
  return { month: m, assets_minor: assets, liabilities_minor: liabilities, net_worth_minor: assets + liabilities };
}

function show(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/reports" element={<ReportsPage />} />
        <Route path="/reports/cash-flow" element={<CashFlowReportPage />} />
        <Route path="/reports/net-worth" element={<NetWorthReportPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  useFirstActivityMonth.mockReturnValue(loaded('2024-10-01'));
  useAccounts.mockReturnValue(loaded([]));
  useReportSummary.mockReturnValue(loaded({ current: totals(), compare: before }));
  useReportCashFlow.mockImplementation((from: string) =>
    loaded(from === FROM ? [month(addMonths(THIS_MONTH, -2), 550000, 366824), month(addMonths(THIS_MONTH, -1), 560000, 352190)] : []),
  );
  useNetWorthRange.mockReturnValue(
    loaded([worth(addMonths(FROM, -1), 4743228, -1150692), worth(addMonths(THIS_MONTH, -2), 6200000, -700000), worth(addMonths(THIS_MONTH, -1), 6300639, -694948)]),
  );
  useNetWorthByAccount.mockReturnValue(loaded([]));
  useNetWorthChange.mockReturnValue(
    loaded({ start_minor: 3592536, end_minor: 5605691, change_minor: 2013155, cash_flow_minor: 2013155, openings_minor: 0, moved_minor: 0 }),
  );
  useCurrentMonthFlow.mockReturnValue(loaded(null));
});

describe('filters', () => {
  it('reads the address, falling back to the defaults for anything it does not know', () => {
    expect(parseFilters(new URLSearchParams('period=24m&compare=year&accounts=debt'))).toEqual({
      period: '24m',
      compare: 'year',
      scope: 'debt',
    });
    expect(parseFilters(new URLSearchParams('period=99m&accounts=mine'))).toEqual({
      period: '12m',
      compare: 'previous',
      scope: 'all',
    });
    expect(filterSearch({ period: '6m', compare: 'previous', scope: 'cash' })).toBe('?period=6m&compare=previous&accounts=cash');
  });

  it('makes a period of complete months that never starts before the first activity', () => {
    expect(periodRange('12m', '2026-10-01', '2024-10-01')).toEqual({ from: '2025-10-01', to: '2026-10-01' });
    expect(periodRange('24m', '2026-10-01', '2025-03-01')).toEqual({ from: '2025-03-01', to: '2026-10-01' });
    // This year so far is the year of the last complete month: in January,
    // the whole of last year.
    expect(periodRange('ytd', '2026-10-01', null)).toEqual({ from: '2026-01-01', to: '2026-10-01' });
    expect(periodRange('ytd', '2027-01-01', null)).toEqual({ from: '2026-01-01', to: '2027-01-01' });
  });

  it('compares with the months just before, or the same months a year earlier', () => {
    const range = { from: '2025-10-01', to: '2026-10-01' };
    expect(compareStart(range, 'previous')).toBe('2024-10-01');
    expect(compareStart({ from: '2026-04-01', to: '2026-10-01' }, 'previous')).toBe('2025-10-01');
    expect(compareStart({ from: '2026-04-01', to: '2026-10-01' }, 'year')).toBe('2025-04-01');
    expect(rangeLabel(range)).toBe('Oct 2025 – Sep 2026');
    expect(rangeLabel({ from: '2026-09-01', to: '2026-10-01' })).toBe('Sep 2026');
  });

  it('turns a scope into the accounts it covers, archived ones included', () => {
    const accounts = [
      { account_id: 'chk', type: 'checking' },
      { account_id: 'visa', type: 'credit_card', archived_at: '2026-01-01' },
      { account_id: 'inv', type: 'investment' },
    ] as AccountBalance[];
    expect(scopeAccountIds('all', accounts)).toBeNull();
    expect(scopeAccountIds('cash', accounts)).toEqual(['chk']);
    expect(scopeAccountIds('debt', accounts)).toEqual(['visa']);
  });
});

describe('summary helpers', () => {
  it('splits every transfer into one bucket', () => {
    const lines = transfersOf(totals());
    expect(lines.map((l) => l.label)).toEqual([
      'Card payments',
      'Into goal accounts',
      'Out of goal accounts',
      'Loan payments',
      'Cash withdrawals',
      'Other transfers',
    ]);
  });

  it('takes a typical month over the months with activity, and says so', () => {
    expect(typicalNet(totals())).toBe(167763);
    expect(typicalBasis(totals())).toBe('average of 12 months');
    expect(typicalBasis(totals({ active_months: 11 }))).toBe('average of 11 months with activity; 1 empty month left out');
    expect(typicalNet(totals({ active_months: 0 }))).toBeNull();
  });
});

describe('Reports hub', () => {
  it('shows the period against the comparison period, with net worth as the one bracket', () => {
    show('/reports');
    const band = screen.getByRole('region', { name: 'This period' });
    expect(band).toHaveTextContent('$66,070.00');
    expect(band).toHaveTextContent('+$2,770.00');
    expect(band).toHaveTextContent('vs Oct');
    expect(band.querySelector('.bracket')).toHaveTextContent('$56,056.91');
    // Saved: 1,500,000 − 205,000 = 1,295,000, 19.6% of money in.
    expect(band).toHaveTextContent('$12,950.00');
    expect(band).toHaveTextContent('19.6% of money in');
  });

  it('says there is nothing to compare with when the comparison period was empty', () => {
    useReportSummary.mockReturnValue(
      loaded({ current: totals(), compare: { ...before, money_in_minor: 0, money_out_minor: 0, net_minor: 0, active_months: 0 } }),
    );
    show('/reports');
    const band = screen.getByRole('region', { name: 'This period' });
    expect(within(band).getAllByText('Nothing earlier to compare with')).toHaveLength(3);
    expect(band).not.toHaveTextContent('+$66,070.00');
  });

  it('asks the database for the complete months only, with the comparison period', () => {
    show('/reports?period=12m&compare=year&accounts=all');
    expect(useReportSummary).toHaveBeenCalledWith(FROM, THIS_MONTH, addMonths(FROM, -12), null);
  });

  it('lists every report, keeping the filters in the links', () => {
    show('/reports?period=6m&compare=previous&accounts=cash');
    const list = screen.getByRole('region', { name: 'All reports' });
    expect(within(list).getByRole('link', { name: /Cash flow/ })).toHaveAttribute(
      'href',
      '/reports/cash-flow?period=6m&compare=previous&accounts=cash',
    );
    expect(within(list).getByRole('link', { name: /Net worth/ })).toHaveAttribute(
      'href',
      '/reports/net-worth?period=6m&compare=previous&accounts=cash',
    );
  });

  it('explains what to do when there is nothing to report', () => {
    useFirstActivityMonth.mockReturnValue(loaded(null));
    show('/reports');
    expect(screen.getByText('Nothing to report yet')).toBeInTheDocument();
  });

  it('tells a new account when its first complete month will appear', () => {
    useFirstActivityMonth.mockReturnValue(loaded(THIS_MONTH));
    useCurrentMonthFlow.mockReturnValue(loaded({ month: THIS_MONTH, money_in_minor: 90000, money_out_minor: 10000, net_minor: 80000 }));
    show('/reports');
    expect(screen.getByText(/Reports count complete months; your first one appears on/)).toBeInTheDocument();
  });
});

describe('Cash flow report', () => {
  it('draws the net on the chart, and last year’s net when that year had activity', async () => {
    useReportCashFlow.mockImplementation((from: string) =>
      loaded(
        from === FROM
          ? [month(addMonths(THIS_MONTH, -1), 560000, 352190)]
          : [month(addMonths(THIS_MONTH, -13), 490000, 350296)],
      ),
    );
    show('/reports/cash-flow');
    expect(screen.getByText('Net')).toBeInTheDocument();
    expect(screen.getByText('Net, a year earlier')).toBeInTheDocument();
  });

  it('leaves the dashed line out when the year before was empty', () => {
    show('/reports/cash-flow');
    expect(screen.queryByText('Net, a year earlier')).not.toBeInTheDocument();
  });

  it('compares the period and lists the transfers left out of both, with their total', () => {
    show('/reports/cash-flow');
    const compare = screen.getByRole('region', { name: 'Against the comparison period' });
    expect(compare).toHaveTextContent('Money in');
    expect(compare).toHaveTextContent('+4.4%');
    const transfers = screen.getByRole('region', { name: 'Left out of both: transfers' });
    // 2,033,744 + 1,500,000 + 205,000 + 462,000 + 120,000 + 0.
    expect(within(transfers).getByText('Every transfer').closest('tr')).toHaveTextContent('$43,207.44');
  });

  it('says the typical month is the average of the months with activity', () => {
    useReportSummary.mockReturnValue(loaded({ current: totals({ active_months: 11 }), compare: before }));
    show('/reports/cash-flow');
    expect(screen.getByText('average of 11 months with activity; 1 empty month left out')).toBeInTheDocument();
  });

  it('shows the current month on its own, not counted', () => {
    useCurrentMonthFlow.mockReturnValue(loaded({ month: THIS_MONTH, money_in_minor: 90000, money_out_minor: 10000, net_minor: 80000 }));
    show('/reports/cash-flow');
    expect(screen.getByText(/So far this month/)).toHaveTextContent('not counted above');
  });

  it('keeps the filters on the way back to the hub', () => {
    show('/reports/cash-flow?period=24m&compare=year&accounts=debt');
    expect(screen.getByRole('link', { name: 'Reports' })).toHaveAttribute('href', '/reports?period=24m&compare=year&accounts=debt');
  });

  it('changes the period from its filter', async () => {
    show('/reports/cash-flow');
    await userEvent.click(screen.getByRole('button', { name: /Period/ }));
    await userEvent.click(screen.getByRole('option', { name: 'Last 6 months' }));
    expect(useReportSummary).toHaveBeenLastCalledWith(addMonths(THIS_MONTH, -6), THIS_MONTH, addMonths(THIS_MONTH, -12), null);
  });
});

describe('Net worth report', () => {
  it('explains the change in parts that add up to it', () => {
    useNetWorthChange.mockReturnValue(
      loaded({ start_minor: 3592536, end_minor: 5605691, change_minor: 2013155, cash_flow_minor: 2014155, openings_minor: 0, moved_minor: -1000 }),
    );
    show('/reports/net-worth');
    const bridge = screen.getByRole('region', { name: 'Why it moved' });
    expect(bridge).toHaveTextContent('+$20,141.55');
    expect(bridge).toHaveTextContent('−$10.00');
    expect(within(bridge).getByText('Change in net worth').closest('tr')).toHaveTextContent('+$20,131.55');
  });

  it('lists what each account added, and names accounts left out of net worth', () => {
    useNetWorthByAccount.mockReturnValue(
      loaded([
        { account_id: 'home', name: 'Home deposit', type: 'savings', is_liability: false, include_in_net_worth: true, archived_at: null, start_minor: 900000, end_minor: 1500000, change_minor: 600000 },
        { account_id: 'visa', name: 'Visa card', type: 'credit_card', is_liability: true, include_in_net_worth: true, archived_at: null, start_minor: -132692, end_minor: -138948, change_minor: -6256 },
        { account_id: 'held', name: 'Held for a friend', type: 'other_asset', is_liability: false, include_in_net_worth: false, archived_at: null, start_minor: 0, end_minor: 14800, change_minor: 14800 },
      ]),
    );
    show('/reports/net-worth');
    const accounts = screen.getByRole('region', { name: 'What changed, by account' });
    const rows = within(accounts).getAllByRole('listitem');
    expect(rows.map((row) => row.querySelector('.change-name')?.firstChild?.textContent)).toEqual(['Home deposit', 'Visa card']);
    expect(rows[1]).toHaveTextContent('−$62.56');
    expect(accounts).toHaveTextContent('Not in net worth: Held for a friend');
  });

  it('has no accounts filter, since net worth covers every account counted in it', () => {
    show('/reports/net-worth');
    expect(screen.queryByRole('button', { name: /Accounts/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Period/ })).toBeInTheDocument();
  });
});
