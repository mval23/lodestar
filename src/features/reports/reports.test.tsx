import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { addMonths } from '../../lib/dates';
import { ReportsPage, typicalBasis } from './ReportsPage';
import {
  averagePerMonth,
  fillMonths,
  reportStart,
  summarizeCashFlow,
  type CashFlowMonth,
  type NetWorthMonth,
  type ReportMonth,
} from './queries';

const useCashFlowReport = vi.fn();
const useCurrentMonthFlow = vi.fn();
const useNetWorthReport = vi.fn();

vi.mock('./queries', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./queries')>();
  return {
    ...actual,
    useCashFlowReport: (months: number, currentMonth: string) => useCashFlowReport(months, currentMonth),
    useCurrentMonthFlow: () => useCurrentMonthFlow(),
    useNetWorthReport: () => useNetWorthReport(),
  };
});

vi.mock('../../lib/profile', () => ({
  useCurrency: () => 'USD',
  useProfile: () => ({ data: { timezone: 'UTC' } }),
}));

const THIS_MONTH = `${new Date().toISOString().slice(0, 7)}-01`;

function flow(month: string, moneyIn: number, moneyOut: number): CashFlowMonth {
  return { month, money_in_minor: moneyIn, money_out_minor: moneyOut, net_minor: moneyIn - moneyOut };
}

function month(m: string, moneyIn: number, moneyOut: number, active = true): ReportMonth {
  return { ...flow(m, moneyIn, moneyOut), active };
}

function worth(m: string, assets: number, liabilities: number): NetWorthMonth {
  return { month: m, assets_minor: assets, liabilities_minor: liabilities, net_worth_minor: assets + liabilities };
}

function loaded<T>(data: T) {
  return { data, isPending: false, isError: false, isSuccess: true };
}

beforeEach(() => {
  useCashFlowReport.mockReturnValue(loaded([]));
  useCurrentMonthFlow.mockReturnValue(loaded(null));
  useNetWorthReport.mockReturnValue(loaded([]));
});

describe('summarizeCashFlow', () => {
  it('adds the months up exactly, with no floating point in sight', () => {
    const totals = summarizeCashFlow([flow('2026-07-01', 250000, 120055), flow('2026-08-01', 250000, 98045)]);
    expect(totals).toEqual({ moneyIn: 500000, moneyOut: 218100, net: 281900, months: 2 });
  });

  it('is all zeros with nothing to add', () => {
    expect(summarizeCashFlow([])).toEqual({ moneyIn: 0, moneyOut: 0, net: 0, months: 0 });
  });
});

describe('reportStart', () => {
  it('goes back the chosen number of calendar months from the current one', () => {
    expect(reportStart('2026-10-01', 12, '2024-03-01')).toBe('2025-10-01');
    expect(reportStart('2026-10-01', 6, '2024-03-01')).toBe('2026-04-01');
    expect(reportStart('2026-10-01', 24, '2024-03-01')).toBe('2024-10-01');
  });

  it('starts no earlier than the first month with activity', () => {
    expect(reportStart('2026-10-01', 12, '2026-06-01')).toBe('2026-06-01');
  });
});

describe('fillMonths', () => {
  it('gives every calendar month a slot, with an empty month as zeros', () => {
    const rows = fillMonths([flow('2026-07-01', 100, 40), flow('2026-09-01', 300, 90)], '2026-07-01', '2026-10-01');
    expect(rows).toEqual([
      { ...flow('2026-07-01', 100, 40), active: true },
      { month: '2026-08-01', money_in_minor: 0, money_out_minor: 0, net_minor: 0, active: false },
      { ...flow('2026-09-01', 300, 90), active: true },
    ]);
  });

  it('never includes the month it stops at, so the partial current month stays out', () => {
    const rows = fillMonths([flow('2026-09-01', 300, 90), flow('2026-10-01', 50, 20)], '2026-09-01', '2026-10-01');
    expect(rows.map((row) => row.month)).toEqual(['2026-09-01']);
  });

  it('always covers exactly the number of months asked for', () => {
    for (const months of [6, 12, 24]) {
      const from = addMonths('2026-10-01', -months);
      expect(fillMonths([], from, '2026-10-01')).toHaveLength(months);
    }
  });
});

describe('averagePerMonth', () => {
  it('averages the months with activity, and counts the empty ones it left out', () => {
    const typical = averagePerMonth([
      month('2026-07-01', 200000, 100000),
      month('2026-08-01', 0, 0, false),
      month('2026-09-01', 200000, 100000),
    ]);
    expect(typical).toEqual({ moneyIn: 200000, moneyOut: 100000, net: 100000, months: 2, emptyMonths: 1 });
  });

  it('has nothing to say when every month is empty', () => {
    expect(averagePerMonth([month('2026-09-01', 0, 0, false)])).toBeNull();
  });

  it('says what the average is of', () => {
    expect(typicalBasis({ moneyIn: 0, moneyOut: 0, net: 0, months: 12, emptyMonths: 0 })).toBe('average of 12 months');
    expect(typicalBasis({ moneyIn: 0, moneyOut: 0, net: 0, months: 11, emptyMonths: 1 })).toBe(
      'average of 11 months with activity; 1 empty month left out',
    );
  });
});

describe('ReportsPage', () => {
  it('explains what to do when there is nothing to report', () => {
    render(<MemoryRouter><ReportsPage /></MemoryRouter>);
    expect(screen.getByText('Nothing to report yet')).toBeInTheDocument();
  });

  it('asks for the range by complete months, ending before the current month', () => {
    render(<MemoryRouter><ReportsPage /></MemoryRouter>);
    expect(useCashFlowReport).toHaveBeenCalledWith(12, THIS_MONTH);
  });

  it('shows the totals across the complete months of the range', () => {
    useCashFlowReport.mockReturnValue(loaded([month('2026-07-01', 250000, 120000), month('2026-08-01', 250000, 100000)]));
    render(<MemoryRouter><ReportsPage /></MemoryRouter>);
    expect(screen.getByText('Net over 2 complete months')).toBeInTheDocument();
    expect(screen.getAllByText('$5,000.00').length).toBeGreaterThan(0);
    expect(screen.getAllByText('$2,200.00').length).toBeGreaterThan(0);
    expect(screen.getAllByText('+$2,800.00').length).toBeGreaterThan(0);
  });

  it('keeps an empty month in the range and says it was left out of the typical month', () => {
    useCashFlowReport.mockReturnValue(
      loaded([month('2026-07-01', 300000, 100000), month('2026-08-01', 0, 0, false), month('2026-09-01', 300000, 100000)]),
    );
    render(<MemoryRouter><ReportsPage /></MemoryRouter>);
    expect(screen.getByText('Net over 3 complete months')).toBeInTheDocument();
    expect(screen.getByText(/average of 2 months with activity; 1 empty month left out/)).toBeInTheDocument();
  });

  it('shows the current month on its own line, outside the totals', () => {
    useCashFlowReport.mockReturnValue(loaded([month('2026-08-01', 250000, 100000)]));
    useCurrentMonthFlow.mockReturnValue(loaded(flow(THIS_MONTH, 90000, 10000)));
    render(<MemoryRouter><ReportsPage /></MemoryRouter>);
    expect(screen.getByText(/So far this month/)).toBeInTheDocument();
    expect(screen.getAllByText('+$800.00').length).toBeGreaterThan(0);
    // The net over the range is August alone.
    expect(screen.getAllByText('+$1,500.00').length).toBeGreaterThan(0);
  });

  it('says so when nothing is recorded this month yet', () => {
    useCashFlowReport.mockReturnValue(loaded([month('2026-08-01', 250000, 100000)]));
    render(<MemoryRouter><ReportsPage /></MemoryRouter>);
    expect(screen.getByText('Nothing recorded this month yet.')).toBeInTheDocument();
  });

  it('shows a new account its month so far before any month is complete', () => {
    useCurrentMonthFlow.mockReturnValue(loaded(flow(THIS_MONTH, 90000, 10000)));
    render(<MemoryRouter><ReportsPage /></MemoryRouter>);
    expect(screen.queryByText('Nothing to report yet')).not.toBeInTheDocument();
    expect(screen.getByText('So far this month')).toBeInTheDocument();
    expect(screen.getByText(/Reports count complete months/)).toBeInTheDocument();
  });

  it('offers a table for the chart, with the same figures in it', async () => {
    useCashFlowReport.mockReturnValue(loaded([month('2026-08-01', 250000, 100000)]));
    render(<MemoryRouter><ReportsPage /></MemoryRouter>);

    const chart = screen.getByRole('img', { name: /Money in and out/ });
    expect(chart).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Show as table' }));
    const table = screen.getByRole('table');
    expect(within(table).getByText('August 2026')).toBeInTheDocument();
    expect(within(table).getAllByText('$2,500.00').length).toBeGreaterThan(0);
    expect(screen.queryByRole('img', { name: /Money in and out/ })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Show as chart' }));
    expect(screen.getByRole('img', { name: /Money in and out/ })).toBeInTheDocument();
  });

  // A chart used to show only a shape; reading an amount meant switching to
  // the table. Now it labels its amounts, and pointing at a month shows that
  // month's exact figures. The readout repeats the table, so it is hidden
  // from screen readers, who have the table itself.
  it('labels its amounts, and shows the exact figures for the month under the pointer', () => {
    useCashFlowReport.mockReturnValue(loaded([month('2026-08-01', 250000, 100000)]));
    const { container } = render(<MemoryRouter><ReportsPage /></MemoryRouter>);

    const chart = screen.getByRole('img', { name: /Money in and out/ });
    expect(within(chart).getByText('$2.5K')).toBeInTheDocument();
    expect(container.querySelector('.chart-readout')).toBeNull();

    fireEvent.pointerMove(chart, { clientX: 10, clientY: 10 });
    const readout = container.querySelector('.chart-readout');
    expect(readout).not.toBeNull();
    expect(readout).toHaveAttribute('aria-hidden', 'true');
    expect(readout).toHaveTextContent('August 2026');
    expect(readout).toHaveTextContent('$2,500.00');
    expect(readout).toHaveTextContent('$1,000.00');
    expect(readout).toHaveTextContent('+$1,500.00');

    fireEvent.pointerLeave(chart);
    expect(container.querySelector('.chart-readout')).toBeNull();
  });

  it('draws net worth with its own table, including a negative stretch', async () => {
    useCashFlowReport.mockReturnValue(loaded([month('2026-08-01', 250000, 100000)]));
    useNetWorthReport.mockReturnValue(loaded([worth('2026-07-01', 100000, -150000), worth('2026-08-01', 300000, -150000)]));
    render(<MemoryRouter><ReportsPage /></MemoryRouter>);

    expect(screen.getByRole('img', { name: /Net worth over/ })).toBeInTheDocument();
    const [, netWorthToggle] = screen.getAllByRole('button', { name: 'Show as table' });
    await userEvent.click(netWorthToggle!);
    const tables = screen.getAllByRole('table');
    const table = tables[tables.length - 1]!;
    // July is 100,000 − 150,000 = −50,000.
    // Each amount renders twice: printed, and spoken for screen readers.
    expect(within(table).getAllByText('−$500.00').length).toBeGreaterThan(0);
    expect(within(table).getAllByText('$1,500.00').length).toBeGreaterThan(0);
  });

  it('names money in, money out and the latest complete month in the legend', () => {
    useCashFlowReport.mockReturnValue(loaded([month('2026-08-01', 250000, 100000)]));
    render(<MemoryRouter><ReportsPage /></MemoryRouter>);
    expect(screen.getByText('Money in')).toBeInTheDocument();
    expect(screen.getByText('Money out')).toBeInTheDocument();
    expect(screen.getByText('Latest complete month')).toBeInTheDocument();
  });
});
