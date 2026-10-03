import { useCurrency } from '../../lib/profile';
import type { Currency } from '../../lib/money';
import { addMonths, formatDateShort, formatMonth } from '../../lib/dates';
import { cashFlowFindings } from '../../lib/standsOut';
import { ScrollTable } from '../../ui/ScrollTable';
import { Amount } from '../../ui/Amount';
import { Comparison } from '../../ui/Comparison';
import { Notice } from '../../ui/Notice';
import { dataErrorMessage } from '../auth/errors';
import { CashFlowChart } from './CashFlowChart';
import { rangeLabel } from './filters';
import {
  transfersOf,
  typicalBasis,
  typicalNet,
  useCurrentMonthFlow,
  useReportCashFlow,
  useReportSummary,
  type ReportTotals,
} from './queries';
import { REFUND_NOTE, ReportClosing, ReportHead, percentChange, share, useReportRange } from './ReportParts';

// Cash flow: money in and out each month with the net drawn on the chart,
// last year's net beside it, the period against the comparison period, and
// the transfers that are left out of both, so it is plain why.
export function CashFlowReportPage() {
  const currency = useCurrency();
  const report = useReportRange();
  const { range, compareFrom, accountIds, against } = report;
  const summary = useReportSummary(range.from, range.to, compareFrom, accountIds);
  const flow = useReportCashFlow(range.from, range.to, accountIds);
  // The same months a year earlier, for the dashed line.
  const lastYear = useReportCashFlow(addMonths(range.from, -12), addMonths(range.to, -12), accountIds);
  const soFar = useCurrentMonthFlow(report.currentMonth);

  const totals = summary.data?.current;
  const before = summary.data?.compare;
  const rows = flow.data ?? [];
  const prior = lastYear.data ?? [];
  const previousNet = prior.some((row) => row.active) ? prior.map((row) => (row.active ? row.net_minor : null)) : undefined;
  const typical = totals ? typicalNet(totals) : null;
  const error = summary.error ?? flow.error;
  // A comparison period with nothing in it says so, rather than "+everything".
  const comparable = Boolean(before && before.active_months > 0);

  return (
    <div className="page">
      <ReportHead
        back={report.search}
        title="Cash flow"
        subtitle={`${rangeLabel(range)} · complete months · the current month is shown on its own`}
      />

      {error && <Notice tone="err">{dataErrorMessage(error)}</Notice>}
      {!report.ready && <p className="secondary">Working out your figures…</p>}
      {report.ready && report.nothingYet && (
        <p className="secondary">There are no complete months to report yet.</p>
      )}

      {totals && before && (
        <>
          <section className="group fig-band fig-band-5" aria-label="This period">
            <div className="fig-cell">
              <h2 className="caption">Money in</h2>
              <p className="card-figure flush">
                <Amount minor={totals.money_in_minor} currency={currency} />
              </p>
              <p className="footnote flush">
                {comparable ? (
                  <Comparison delta={totals.money_in_minor - before.money_in_minor} currency={currency} against={against} />
                ) : (
                  'Nothing earlier to compare with'
                )}
              </p>
            </div>
            <div className="fig-cell">
              <h2 className="caption">Money out</h2>
              <p className="card-figure flush">
                <Amount minor={totals.money_out_minor} currency={currency} />
              </p>
              <p className="footnote flush">
                {comparable ? (
                  <Comparison delta={totals.money_out_minor - before.money_out_minor} currency={currency} against={against} />
                ) : (
                  'Nothing earlier to compare with'
                )}
              </p>
            </div>
            <div className="fig-cell">
              <h2 className="caption">Net cash flow</h2>
              <p className="fig flush">
                <span className="bracket">
                  <Amount minor={totals.net_minor} currency={currency} signed />
                </span>
              </p>
              <p className="footnote flush">
                {comparable ? (
                  <Comparison delta={totals.net_minor - before.net_minor} currency={currency} against={against} />
                ) : (
                  'Nothing earlier to compare with'
                )}
              </p>
            </div>
            <div className="fig-cell">
              <h2 className="caption">Typical month</h2>
              <p className="card-figure flush">
                {typical === null ? '—' : <Amount minor={typical} currency={currency} signed />}
              </p>
              <p className="footnote flush">{typicalBasis(totals)}</p>
            </div>
            <div className="fig-cell">
              <h2 className="caption">Saved into goals</h2>
              <p className="card-figure flush">
                <Amount minor={totals.to_goals_minor - totals.from_goals_minor} currency={currency} />
              </p>
              <p className="footnote flush">
                {share(totals.to_goals_minor - totals.from_goals_minor, totals.money_in_minor)} of money in
              </p>
            </div>
          </section>

          {rows.length > 0 && (
            <CashFlowChart
              rows={rows}
              currency={currency}
              currentMonth={addMonths(range.to, -1)}
              nowLabel="Latest complete month"
              netLine
              previousNet={previousNet}
            />
          )}

          <p className="footnote flush">
            {soFar.data ? (
              <>
                So far this month ({formatDateShort(report.currentMonth)} – {formatDateShort(report.today)}):{' '}
                <Amount minor={soFar.data.net_minor} currency={currency} signed />, not counted above.
              </>
            ) : (
              'Nothing recorded this month yet.'
            )}
          </p>

          <div className="report-pair">
            {comparable ? (
              <ComparisonTable totals={totals} before={before} currency={currency} />
            ) : (
              <section className="group stack-tight" aria-labelledby="cash-compare">
                <h2 className="headline" id="cash-compare">
                  Against the comparison period
                </h2>
                <p className="footnote flush">
                  Nothing was recorded in {rangeLabel({ from: before.period_from, to: before.period_to })}, so there is nothing to
                  compare with yet.
                </p>
              </section>
            )}
            <TransfersTable totals={totals} before={before} currency={currency} />
          </div>

          <ReportClosing
            currency={currency}
            findings={cashFlowFindings(
              totals,
              comparable ? before : null,
              rows,
              rangeLabel({ from: before.period_from, to: before.period_to }),
              formatMonth,
            )}
            about={[
              'Months follow each transaction’s date, in your time zone. A month with nothing recorded counts as zero here and is left out of the typical month.',
              'Card purchases count once, when they are made; paying the card is a transfer.',
              REFUND_NOTE,
              'Loan interest is in spending only if it is recorded as its own expense.',
            ]}
          />
        </>
      )}
    </div>
  );
}

function ComparisonTable({ totals, before, currency }: { totals: ReportTotals; before: ReportTotals; currency: Currency }) {
  const lines: [string, number, number, boolean][] = [
    ['Money in', before.money_in_minor, totals.money_in_minor, false],
    ['Money out', before.money_out_minor, totals.money_out_minor, false],
    ['Net cash flow', before.net_minor, totals.net_minor, true],
  ];
  return (
    <section className="group stack-tight" aria-labelledby="cash-compare">
      <h2 className="headline" id="cash-compare">
        Against the comparison period
      </h2>
      <ScrollTable label="Comparison table">
        <table className="ledger compact">
          <thead>
            <tr>
              <th scope="col">
                <span className="visually-hidden">Figure</span>
              </th>
              <th scope="col" className="num">
                {rangeLabel({ from: before.period_from, to: before.period_to })}
              </th>
              <th scope="col" className="num">
                {rangeLabel({ from: totals.period_from, to: totals.period_to })}
              </th>
              <th scope="col" className="num">
                Change
              </th>
            </tr>
          </thead>
          <tbody>
            {lines.map(([label, was, now, signed]) => (
              <tr key={label}>
                <th scope="row">{label}</th>
                <td className="num">
                  <Amount minor={was} currency={currency} signed={signed} />
                </td>
                <td className="num">
                  <Amount minor={now} currency={currency} signed={signed} />
                </td>
                <td className="num">
                  <Amount minor={now - was} currency={currency} signed />
                  {percentChange(now, was) && <small> {percentChange(now, was)}</small>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </ScrollTable>
    </section>
  );
}

function TransfersTable({ totals, before, currency }: { totals: ReportTotals; before: ReportTotals; currency: Currency }) {
  const now = transfersOf(totals);
  const was = transfersOf(before);
  return (
    <section className="group stack-tight" aria-labelledby="cash-transfers">
      <h2 className="headline" id="cash-transfers">
        Left out of both: transfers
      </h2>
      <ScrollTable label="Transfers table">
        <table className="ledger compact">
          <thead>
            <tr>
              <th scope="col">
                <span className="visually-hidden">Transfer</span>
              </th>
              <th scope="col" className="num">
                Before
              </th>
              <th scope="col" className="num">
                This period
              </th>
            </tr>
          </thead>
          <tbody>
            {now.map((line, i) => (
              <tr key={line.label}>
                <th scope="row">
                  {line.label}
                  {line.note && <small> · {line.note}</small>}
                </th>
                <td className="num">
                  <Amount minor={was[i]!.minor} currency={currency} />
                </td>
                <td className="num">
                  <Amount minor={line.minor} currency={currency} />
                </td>
              </tr>
            ))}
            <tr className="ledger-total">
              <th scope="row">Every transfer</th>
              <td className="num">
                <Amount minor={before.transfers_minor} currency={currency} />
              </td>
              <td className="num">
                <Amount minor={totals.transfers_minor} currency={currency} />
              </td>
            </tr>
          </tbody>
        </table>
      </ScrollTable>
    </section>
  );
}
