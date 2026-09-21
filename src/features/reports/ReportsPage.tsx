import { useState } from 'react';
import { ChartColumn } from 'lucide-react';
import { useCurrency, useProfile } from '../../lib/profile';
import { monthStartInZone } from '../../lib/dates';
import { Amount } from '../../ui/Amount';
import { EmptyState } from '../../ui/EmptyState';
import { Notice } from '../../ui/Notice';
import { Select } from '../../ui/Select';
import { dataErrorMessage } from '../auth/errors';
import { CashFlowChart } from './CashFlowChart';
import { NetWorthChart } from './NetWorthChart';
import { averagePerMonth, summarizeCashFlow, useCashFlow, useNetWorth } from './queries';

const RANGES = [
  { value: '6', label: 'Last 6 months' },
  { value: '12', label: 'Last 12 months' },
  { value: '24', label: 'Last 24 months' },
];

export function ReportsPage() {
  const currency = useCurrency();
  const profile = useProfile();
  const [range, setRange] = useState('12');
  const months = Number(range);
  const cashFlow = useCashFlow(months);
  const netWorth = useNetWorth(months);

  const currentMonth = monthStartInZone(profile.data?.timezone);
  const rows = cashFlow.data ?? [];
  const totals = summarizeCashFlow(rows);
  const typical = averagePerMonth(rows, currentMonth);
  const empty = cashFlow.isSuccess && rows.length === 0;

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1 className="large-title">Reports</h1>
          <p className="footnote flush">Every figure is summed in the database from the same rows as Activity.</p>
        </div>
        <div className="control-select">
          <Select label="Range" value={range} onChange={setRange} options={RANGES} />
        </div>
      </header>

      {cashFlow.isError && <Notice tone="err">{dataErrorMessage(cashFlow.error)}</Notice>}
      {netWorth.isError && <Notice tone="err">{dataErrorMessage(netWorth.error)}</Notice>}
      {cashFlow.isPending && <p className="secondary">Working out your figures…</p>}

      {empty && (
        <EmptyState icon={ChartColumn} title="Nothing to report yet">
          Reports draw on your transactions. Add a few, or import a statement, and the months will fill in here.
        </EmptyState>
      )}

      {rows.length > 0 && (
        <>
          <section className="group figure-group">
            <h2 className="caption">Net over {totals.months} {totals.months === 1 ? 'month' : 'months'}</h2>
            <p className="fig flush">
              <span className="bracket">
                <Amount minor={totals.net} currency={currency} signed />
              </span>
            </p>
            <p className="footnote flush">
              <Amount minor={totals.moneyIn} currency={currency} /> in ·{' '}
              <Amount minor={totals.moneyOut} currency={currency} /> out
              {typical && (
                <>
                  {' · '}
                  <Amount minor={typical.net} currency={currency} signed /> in a typical month
                </>
              )}
            </p>
          </section>

          <CashFlowChart rows={rows} currency={currency} currentMonth={currentMonth} />
          {(netWorth.data ?? []).length > 0 && (
            <NetWorthChart rows={netWorth.data ?? []} currency={currency} currentMonth={currentMonth} />
          )}
        </>
      )}
    </div>
  );
}
