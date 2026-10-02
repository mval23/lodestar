import { useState } from 'react';
import { ChartColumn } from 'lucide-react';
import { useCurrency, useProfile } from '../../lib/profile';
import { addMonths, formatDate, formatDateShort, formatMonthShort, monthStartInZone, todayInZone } from '../../lib/dates';
import { Amount } from '../../ui/Amount';
import { EmptyState } from '../../ui/EmptyState';
import { Notice } from '../../ui/Notice';
import { Select } from '../../ui/Select';
import { dataErrorMessage } from '../auth/errors';
import { CashFlowChart } from './CashFlowChart';
import { NetWorthChart } from './NetWorthChart';
import {
  averagePerMonth,
  summarizeCashFlow,
  useCashFlowReport,
  useCurrentMonthFlow,
  useNetWorthReport,
  type TypicalMonth,
} from './queries';

const RANGES = [
  { value: '6', label: 'Last 6 months' },
  { value: '12', label: 'Last 12 months' },
  { value: '24', label: 'Last 24 months' },
];

// What a typical month is the average of, in words.
export function typicalBasis(typical: TypicalMonth): string {
  const months = `${typical.months} ${typical.months === 1 ? 'month' : 'months'}`;
  if (typical.emptyMonths === 0) return `average of ${months}`;
  const empty = `${typical.emptyMonths} empty ${typical.emptyMonths === 1 ? 'month' : 'months'}`;
  return `average of ${months} with activity; ${empty} left out`;
}

export function ReportsPage() {
  const currency = useCurrency();
  const profile = useProfile();
  const [range, setRange] = useState('12');
  const months = Number(range);

  // A range is made of complete calendar months; the current month is still
  // partial, so it is shown on its own line and never added to the totals.
  const timezone = profile.data?.timezone;
  const currentMonth = monthStartInZone(timezone);
  const today = todayInZone(timezone);
  const cashFlow = useCashFlowReport(months, currentMonth);
  const thisMonth = useCurrentMonthFlow(currentMonth);
  const netWorth = useNetWorthReport(months, currentMonth);

  const rows = cashFlow.data ?? [];
  const totals = summarizeCashFlow(rows);
  const typical = averagePerMonth(rows);
  const soFar = thisMonth.data ?? null;
  const empty = cashFlow.isSuccess && thisMonth.isSuccess && rows.length === 0 && !soFar;
  const first = rows[0];
  const last = rows[rows.length - 1];

  const soFarLine = soFar ? (
    <>
      So far this month ({formatDateShort(currentMonth)} – {formatDateShort(today)}):{' '}
      <Amount minor={soFar.net_minor} currency={currency} signed />
    </>
  ) : (
    'Nothing recorded this month yet.'
  );

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1 className="large-title">Reports</h1>
          <p className="footnote flush">
            Every figure is summed in the database from the same rows as Activity. Ranges count complete calendar
            months.
          </p>
        </div>
        <div className="control-select">
          <Select label="Range" value={range} onChange={setRange} options={RANGES} />
        </div>
      </header>

      {cashFlow.isError && <Notice tone="err">{dataErrorMessage(cashFlow.error)}</Notice>}
      {thisMonth.isError && <Notice tone="err">{dataErrorMessage(thisMonth.error)}</Notice>}
      {netWorth.isError && <Notice tone="err">{dataErrorMessage(netWorth.error)}</Notice>}
      {cashFlow.isPending && <p className="secondary">Working out your figures…</p>}

      {empty && (
        <EmptyState icon={ChartColumn} title="Nothing to report yet">
          Reports draw on your transactions. Add a few, or import a statement, and the months will fill in here.
        </EmptyState>
      )}

      {first && last && (
        <section className="group figure-group">
          <h2 className="caption">
            Net over {rows.length} complete {rows.length === 1 ? 'month' : 'months'}
          </h2>
          <p className="fig flush">
            <span className="bracket">
              <Amount minor={totals.net} currency={currency} signed />
            </span>
          </p>
          <p className="footnote flush">
            {formatMonthShort(first.month)} – {formatMonthShort(last.month)} ·{' '}
            <Amount minor={totals.moneyIn} currency={currency} /> in ·{' '}
            <Amount minor={totals.moneyOut} currency={currency} /> out
          </p>
          {typical && (
            <p className="footnote flush">
              <Amount minor={typical.net} currency={currency} signed /> in a typical month · {typicalBasis(typical)}
            </p>
          )}
          <p className="footnote flush">{soFarLine}</p>
        </section>
      )}

      {/* A new account's first month: nothing is complete yet, but the month
          so far is still worth showing. */}
      {rows.length === 0 && soFar && (
        <section className="group figure-group">
          <h2 className="caption">So far this month</h2>
          <p className="fig flush">
            <span className="bracket">
              <Amount minor={soFar.net_minor} currency={currency} signed />
            </span>
          </p>
          <p className="footnote flush">
            Reports count complete months; your first one appears on {formatDate(addMonths(currentMonth, 1))}.
          </p>
        </section>
      )}

      {rows.length > 0 && (
        <CashFlowChart
          rows={rows}
          currency={currency}
          currentMonth={addMonths(currentMonth, -1)}
          nowLabel="Latest complete month"
        />
      )}
      {!empty && (netWorth.data ?? []).length > 0 && (
        <NetWorthChart rows={netWorth.data ?? []} currency={currency} currentMonth={currentMonth} />
      )}
    </div>
  );
}
