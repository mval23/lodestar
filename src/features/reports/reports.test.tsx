import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { ReportsPage } from './ReportsPage';
import { averagePerMonth, summarizeCashFlow, type CashFlowMonth, type NetWorthMonth } from './queries';

const useCashFlow = vi.fn();
const useNetWorth = vi.fn();

vi.mock('./queries', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./queries')>();
  return { ...actual, useCashFlow: () => useCashFlow(), useNetWorth: () => useNetWorth() };
});

vi.mock('../../lib/profile', () => ({
  useCurrency: () => 'USD',
  useProfile: () => ({ data: { timezone: 'UTC' } }),
}));

const THIS_MONTH = `${new Date().toISOString().slice(0, 7)}-01`;

function flow(month: string, moneyIn: number, moneyOut: number): CashFlowMonth {
  return { month, money_in_minor: moneyIn, money_out_minor: moneyOut, net_minor: moneyIn - moneyOut };
}

function worth(month: string, assets: number, liabilities: number): NetWorthMonth {
  return {
    month,
    assets_minor: assets,
    liabilities_minor: liabilities,
    net_worth_minor: assets + liabilities,
  };
}

beforeEach(() => {
  useCashFlow.mockReturnValue({ data: [], isPending: false, isError: false, isSuccess: true });
  useNetWorth.mockReturnValue({ data: [], isPending: false, isError: false, isSuccess: true });
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

describe('averagePerMonth', () => {
  it('leaves the current month out, because it is only half over', () => {
    const typical = averagePerMonth(
      [flow('2026-07-01', 200000, 100000), flow('2026-08-01', 200000, 100000), flow(THIS_MONTH, 10000, 5000)],
      THIS_MONTH,
    );
    expect(typical).toEqual({ moneyIn: 200000, moneyOut: 100000, net: 100000, months: 2 });
  });

  it('has nothing to say when the only month is the current one', () => {
    expect(averagePerMonth([flow(THIS_MONTH, 10000, 5000)], THIS_MONTH)).toBeNull();
  });
});

describe('ReportsPage', () => {
  it('explains what to do when there is nothing to report', () => {
    render(<MemoryRouter><ReportsPage /></MemoryRouter>);
    expect(screen.getByText('Nothing to report yet')).toBeInTheDocument();
  });

  it('shows the totals across the range', () => {
    useCashFlow.mockReturnValue({
      data: [flow('2026-07-01', 250000, 120000), flow('2026-08-01', 250000, 100000)],
      isPending: false,
      isError: false,
      isSuccess: true,
    });
    render(<MemoryRouter><ReportsPage /></MemoryRouter>);
    expect(screen.getAllByText('$5,000.00').length).toBeGreaterThan(0);
    expect(screen.getAllByText('$2,200.00').length).toBeGreaterThan(0);
    expect(screen.getAllByText('+$2,800.00').length).toBeGreaterThan(0);
  });

  it('offers a table for the chart, with the same figures in it', async () => {
    useCashFlow.mockReturnValue({
      data: [flow('2026-08-01', 250000, 100000)],
      isPending: false,
      isError: false,
      isSuccess: true,
    });
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
    useCashFlow.mockReturnValue({
      data: [flow('2026-08-01', 250000, 100000)],
      isPending: false,
      isError: false,
      isSuccess: true,
    });
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
    useCashFlow.mockReturnValue({
      data: [flow('2026-08-01', 250000, 100000)],
      isPending: false,
      isError: false,
      isSuccess: true,
    });
    useNetWorth.mockReturnValue({
      data: [worth('2026-07-01', 100000, -150000), worth('2026-08-01', 300000, -150000)],
      isPending: false,
      isError: false,
      isSuccess: true,
    });
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

  it('names money in, money out and this month in the legend', () => {
    useCashFlow.mockReturnValue({
      data: [flow('2026-08-01', 250000, 100000)],
      isPending: false,
      isError: false,
      isSuccess: true,
    });
    render(<MemoryRouter><ReportsPage /></MemoryRouter>);
    expect(screen.getByText('Money in')).toBeInTheDocument();
    expect(screen.getByText('Money out')).toBeInTheDocument();
    expect(screen.getAllByText('This month').length).toBeGreaterThan(0);
  });
});
