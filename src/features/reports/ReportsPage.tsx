import { Link } from 'react-router';
import { CalendarClock, ChartColumn, ChartColumnStacked, ChartLine, ChevronRight, Hourglass, ListChecks, PiggyBank, TrendingDown } from 'lucide-react';
import { PHONE, useMediaQuery } from '../../lib/media';
import { useCurrency } from '../../lib/profile';
import { addMonths, formatDate } from '../../lib/dates';
import { Amount } from '../../ui/Amount';
import { Comparison } from '../../ui/Comparison';
import { EmptyState } from '../../ui/EmptyState';
import { Notice } from '../../ui/Notice';
import { dataErrorMessage } from '../auth/errors';
import { CashFlowChart } from './CashFlowChart';
import { NetWorthChart } from './NetWorthChart';
import { rangeLabel } from './filters';
import {
  useBudgetSummary,
  useCashRunway,
  useCurrentMonthFlow,
  useDebtSummary,
  useNetWorthRange,
  useRecurringCosts,
  useReportCashFlow,
  useReportSummary,
} from './queries';
import { formatMonths } from '../../ui/RunwayBar';
import { ReportHead, monthEnd, share, useReportRange } from './ReportParts';

// The Reports hub: the period's figures against a comparison period, the two
// charts every month is read by, and every report, each with its headline.
// The filters live in the address and travel with every link from here.
export function ReportsPage() {
  const currency = useCurrency();
  const report = useReportRange();
  const { range, compareFrom, accountIds, search, against } = report;
  const summary = useReportSummary(range.from, range.to, compareFrom, accountIds);
  const flow = useReportCashFlow(range.from, range.to, accountIds);
  const worth = useNetWorthRange(range.from, range.to);
  const soFar = useCurrentMonthFlow(report.currentMonth);
  const plans = useBudgetSummary(report.currentMonth);
  const recurring = useRecurringCosts();
  const runway = useCashRunway(6, null);
  const debts = useDebtSummary(range.from, range.to);
  const runwayMonths = (runway.data ?? []).find((l) => l.line === 'runway')?.months ?? null;
  const owed = debts.data?.[0]?.total_end_minor ?? null;

  const totals = summary.data?.current;
  const before = summary.data?.compare;
  const rows = worth.data ?? [];
  const start = rows.find((row) => row.month === addMonths(range.from, -1)) ?? null;
  const chartRows = rows.filter((row) => row.month >= range.from);
  const end = chartRows[chartRows.length - 1] ?? null;
  const saved = totals ? totals.to_goals_minor - totals.from_goals_minor : 0;
  const savedBefore = before ? before.to_goals_minor - before.from_goals_minor : 0;
  const error = summary.error ?? flow.error ?? worth.error;
  // A comparison period with nothing in it says so, rather than "+everything".
  const comparable = Boolean(before && before.active_months > 0);
  // A phone tile has room for "vs before", not the comparison period's dates.
  const phone = useMediaQuery(PHONE);
  const versus = phone ? 'vs before' : against;

  return (
    <div className="page">
      <ReportHead
        title="Reports"
        subtitle={
          report.nothingYet
            ? 'Every figure is summed in the database from the same rows as Activity.'
            : `${rangeLabel(range)} · complete months`
        }
      />

      {error && <Notice tone="err">{dataErrorMessage(error)}</Notice>}
      {!report.ready && <p className="secondary">Working out your figures…</p>}

      {report.ready && report.nothingYet && (
        <EmptyState icon={ChartColumn} title="Nothing to report yet">
          {soFar.data
            ? `Reports count complete months; your first one appears on ${formatDate(addMonths(report.currentMonth, 1))}.`
            : 'Reports draw on your transactions. Add a few, or import a statement, and the months will fill in here.'}
        </EmptyState>
      )}

      {report.ready && !report.nothingYet && (
        <>
          {/* Net worth leads, as the one bracketed figure; the period's four
              flows sit under it in pairs, and debt closes them on one line. */}
          <section className="group fig-band hub-figures" aria-label="This period">
            <div className="fig-cell hub-hero">
              <h2 className="caption">{end ? `Net worth, ${monthEnd(end.month)}` : 'Net worth'}</h2>
              <p className="fig flush">
                <span className="bracket">
                  <Amount minor={end?.net_worth_minor ?? 0} currency={currency} />
                </span>
              </p>
              {end && start && (
                <p className="footnote flush">
                  <Comparison
                    delta={end.net_worth_minor - start.net_worth_minor}
                    currency={currency}
                    against={`since ${monthEnd(start.month)}`}
                  />
                </p>
              )}
            </div>
            <div className="fig-cell">
              <h2 className="caption">Money in</h2>
              <p className="card-figure flush">
                <Amount minor={totals?.money_in_minor ?? 0} currency={currency} />
              </p>
              {totals && before && (
                <p className="footnote flush">
                  {comparable ? (
                    <Comparison delta={totals.money_in_minor - before.money_in_minor} currency={currency} against={versus} />
                  ) : (
                    'Nothing earlier to compare with'
                  )}
                </p>
              )}
            </div>
            <div className="fig-cell">
              <h2 className="caption">Money out</h2>
              <p className="card-figure flush">
                <Amount minor={totals?.money_out_minor ?? 0} currency={currency} />
              </p>
              {totals && before && (
                <p className="footnote flush">
                  {comparable ? (
                    <Comparison delta={totals.money_out_minor - before.money_out_minor} currency={currency} against={versus} />
                  ) : (
                    'Nothing earlier to compare with'
                  )}
                </p>
              )}
            </div>
            <div className="fig-cell">
              <h2 className="caption">Net cash flow</h2>
              <p className="card-figure flush">
                <Amount minor={totals?.net_minor ?? 0} currency={currency} signed />
              </p>
              {totals && before && (
                <p className="footnote flush">
                  {comparable ? (
                    <Comparison delta={totals.net_minor - before.net_minor} currency={currency} against={versus} />
                  ) : (
                    'Nothing earlier to compare with'
                  )}
                </p>
              )}
            </div>
            <div className="fig-cell">
              <h2 className="caption">Saved into goals</h2>
              <p className="card-figure flush">
                <Amount minor={saved} currency={currency} />
              </p>
              {totals && (
                <p className="footnote flush">
                  {share(saved, totals.money_in_minor)} of money in
                  {!phone && comparable && before && before.money_in_minor > 0 && ` · ${share(savedBefore, before.money_in_minor)} before`}
                </p>
              )}
            </div>
            <div className="fig-cell hub-wide">
              <div>
                <h2 className="caption">Debt</h2>
                {end && start && (
                  <p className="footnote flush">
                    <Amount minor={start.liabilities_minor} currency={currency} /> at {monthEnd(start.month)}
                  </p>
                )}
              </div>
              <p className="card-figure flush">
                <Amount minor={end?.liabilities_minor ?? 0} currency={currency} />
              </p>
            </div>
          </section>

          <div className="report-pair">
            {(flow.data ?? []).length > 0 && (
              <CashFlowChart
                rows={flow.data ?? []}
                currency={currency}
                currentMonth={addMonths(range.to, -1)}
                nowLabel="Latest complete month"
                netLine
              />
            )}
            {chartRows.length > 0 && (
              <NetWorthChart
                rows={chartRows}
                currency={currency}
                currentMonth={addMonths(range.to, -1)}
                nowLabel="Latest complete month"
                start={start ? { label: `Where the period began, ${monthEnd(start.month)}`, value: start.net_worth_minor } : null}
              />
            )}
          </div>

          <section className="stack-tight" aria-labelledby="all-reports">
            <h2 className="headline" id="all-reports">
              All reports
            </h2>
            <ul className="rows-list report-list">
              <li>
                <Link className="row-button" to={`/reports/cash-flow${search}`}>
                  <ChartColumn className="row-icon" strokeWidth={1.75} aria-hidden />
                  <span className="row-label row-grow">
                    Cash flow
                    <small>Money in and out each month, the net, and the transfers left out</small>
                  </span>
                  <span className="report-figure">
                    <Amount minor={totals?.net_minor ?? 0} currency={currency} signed />
                    <small>net</small>
                  </span>
                  <ChevronRight className="row-chevron" strokeWidth={1.75} aria-hidden />
                </Link>
              </li>
              <li>
                <Link className="row-button" to={`/reports/spending${search}`}>
                  <ChartColumnStacked className="row-icon" strokeWidth={1.75} aria-hidden />
                  <span className="row-label row-grow">
                    Spending by category
                    <small>Each month split by category, and every category ranked</small>
                  </span>
                  <span className="report-figure">
                    <Amount minor={totals?.money_out_minor ?? 0} currency={currency} />
                    <small>spent</small>
                  </span>
                  <ChevronRight className="row-chevron" strokeWidth={1.75} aria-hidden />
                </Link>
              </li>
              <li>
                <Link className="row-button" to={`/reports/budgets${search}`}>
                  <ListChecks className="row-icon" strokeWidth={1.75} aria-hidden />
                  <span className="row-label row-grow">
                    Budget vs actual
                    <small>One month’s plans against spending, and which plans held</small>
                  </span>
                  <span className="report-figure">
                    {plans.data && plans.data.lines > 0 ? `${plans.data.within} of ${plans.data.lines}` : '—'}
                    <small>within plan this month</small>
                  </span>
                  <ChevronRight className="row-chevron" strokeWidth={1.75} aria-hidden />
                </Link>
              </li>
              <li>
                <Link className="row-button" to={`/reports/savings${search}`}>
                  <PiggyBank className="row-icon" strokeWidth={1.75} aria-hidden />
                  <span className="row-label row-grow">
                    Savings rate and goals
                    <small>What went into goals each month, and each goal’s progress</small>
                  </span>
                  <span className="report-figure">
                    {totals ? share(saved, totals.money_in_minor) : '—'}
                    <small>savings rate</small>
                  </span>
                  <ChevronRight className="row-chevron" strokeWidth={1.75} aria-hidden />
                </Link>
              </li>
              <li>
                <Link className="row-button" to={`/reports/recurring${search}`}>
                  <CalendarClock className="row-icon" strokeWidth={1.75} aria-hidden />
                  <span className="row-label row-grow">
                    Recurring payments
                    <small>Bills and subscriptions a year, and payments that look recurring</small>
                  </span>
                  <span className="report-figure">
                    <Amount minor={recurring.data?.[0]?.total_yearly_minor ?? 0} currency={currency} />
                    <small>a year</small>
                  </span>
                  <ChevronRight className="row-chevron" strokeWidth={1.75} aria-hidden />
                </Link>
              </li>
              <li>
                <Link className="row-button" to={`/reports/runway${search}`}>
                  <Hourglass className="row-icon" strokeWidth={1.75} aria-hidden />
                  <span className="row-label row-grow">
                    Cash runway
                    <small>How long cash and savings would cover spending</small>
                  </span>
                  <span className="report-figure">
                    {runwayMonths !== null ? `${formatMonths(runwayMonths)} months` : '—'}
                    <small>estimate</small>
                  </span>
                  <ChevronRight className="row-chevron" strokeWidth={1.75} aria-hidden />
                </Link>
              </li>
              <li>
                <Link className="row-button" to={`/reports/debt${search}`}>
                  <TrendingDown className="row-icon" strokeWidth={1.75} aria-hidden />
                  <span className="row-label row-grow">
                    Debt repayment
                    <small>What cards and loans owe, payments, and a payoff estimate</small>
                  </span>
                  <span className="report-figure">
                    {owed !== null ? <Amount minor={owed} currency={currency} /> : '—'}
                    <small>owed</small>
                  </span>
                  <ChevronRight className="row-chevron" strokeWidth={1.75} aria-hidden />
                </Link>
              </li>
              <li>
                <Link className="row-button" to={`/reports/net-worth${search}`}>
                  <ChartLine className="row-icon" strokeWidth={1.75} aria-hidden />
                  <span className="row-label row-grow">
                    Net worth
                    <small>Month-end net worth, and what each account added</small>
                  </span>
                  <span className="report-figure">
                    <Amount minor={end?.net_worth_minor ?? 0} currency={currency} />
                    <small>{end ? monthEnd(end.month) : ''}</small>
                  </span>
                  <ChevronRight className="row-chevron" strokeWidth={1.75} aria-hidden />
                </Link>
              </li>
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
