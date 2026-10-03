import { Link } from 'react-router';
import { useCurrency } from '../../lib/profile';
import type { Currency } from '../../lib/money';
import { addMonths } from '../../lib/dates';
import { accountPath } from '../../lib/routes';
import { Amount } from '../../ui/Amount';
import { Comparison } from '../../ui/Comparison';
import { Notice } from '../../ui/Notice';
import { dataErrorMessage } from '../auth/errors';
import { accountTypeLabel, type AccountType } from '../accounts/queries';
import { NetWorthChart } from './NetWorthChart';
import { rangeLabel } from './filters';
import { useNetWorthByAccount, useNetWorthChange, useNetWorthRange, type AccountChange } from './queries';
import { AboutFigures, ReportHead, monthEnd, percentChange, useReportRange } from './ReportParts';

// Net worth: each month end over the period, what you own above zero and
// what you owe below; what each account added; and the change explained in
// parts that add up to it. Net worth covers every account counted in it, so
// the accounts filter doesn't apply here.
export function NetWorthReportPage() {
  const currency = useCurrency();
  const report = useReportRange();
  const { range } = report;
  const worth = useNetWorthRange(range.from, range.to);
  const accounts = useNetWorthByAccount(range.from, range.to);
  const bridge = useNetWorthChange(range.from, range.to);
  // The period before, for how this period's growth compares.
  const lastYear = useNetWorthChange(report.compareFrom, addMonths(report.compareFrom, monthsIn(range)));

  const rows = worth.data ?? [];
  const start = rows.find((row) => row.month === addMonths(range.from, -1)) ?? null;
  const chartRows = rows.filter((row) => row.month >= range.from);
  const end = chartRows[chartRows.length - 1] ?? null;
  const change = bridge.data;
  const counted = (accounts.data ?? []).filter((a) => a.include_in_net_worth && !(a.archived_at && a.change_minor === 0));
  const leftOut = (accounts.data ?? []).filter((a) => !a.include_in_net_worth && !(a.archived_at && a.change_minor === 0));
  const error = worth.error ?? accounts.error ?? bridge.error;
  // Growth as a share of where the period began, and the comparison
  // period's change, when there was anything in it.
  const percent = change ? percentChange(change.end_minor, change.start_minor) : '';
  const hadBefore = Boolean(lastYear.data && (lastYear.data.start_minor !== 0 || lastYear.data.end_minor !== 0));

  return (
    <div className="page">
      <ReportHead
        back={report.search}
        title="Net worth"
        showScope={false}
        subtitle={`${rangeLabel(range)} · balances at each month end · every account counted in net worth`}
      />

      {error && <Notice tone="err">{dataErrorMessage(error)}</Notice>}
      {!report.ready && <p className="secondary">Working out your figures…</p>}
      {report.ready && report.nothingYet && <p className="secondary">There are no complete months to report yet.</p>}

      {end && change && (
        <>
          <section className="group fig-band" aria-label="This period">
            <div className="fig-cell">
              <h2 className="caption">Net worth, {monthEnd(end.month)}</h2>
              <p className="fig flush">
                <span className="bracket">
                  <Amount minor={end.net_worth_minor} currency={currency} />
                </span>
              </p>
              <p className="footnote flush">What you own, plus what you owe as a negative</p>
            </div>
            <div className="fig-cell">
              <h2 className="caption">What you own</h2>
              <p className="card-figure flush">
                <Amount minor={end.assets_minor} currency={currency} />
              </p>
              {start && (
                <p className="footnote flush">
                  <Comparison delta={end.assets_minor - start.assets_minor} currency={currency} against={`since ${monthEnd(start.month)}`} />
                </p>
              )}
            </div>
            <div className="fig-cell">
              <h2 className="caption">Cards and loans</h2>
              <p className="card-figure flush">
                <Amount minor={end.liabilities_minor} currency={currency} />
              </p>
              {start && (
                <p className="footnote flush">
                  <Amount minor={start.liabilities_minor} currency={currency} /> at {monthEnd(start.month)}
                </p>
              )}
            </div>
            <div className="fig-cell">
              <h2 className="caption">Change over the period</h2>
              <p className="card-figure flush">
                <Amount minor={change.change_minor} currency={currency} signed />
              </p>
              <p className="footnote flush">
                {percent || (!hadBefore && 'Since tracking began')}
                {percent && hadBefore && ' · '}
                {hadBefore && lastYear.data && (
                  <>
                    <Amount minor={lastYear.data.change_minor} currency={currency} signed /> {report.against.replace(/^vs/, 'in')}
                  </>
                )}
              </p>
            </div>
          </section>

          <NetWorthChart
            rows={chartRows}
            currency={currency}
            currentMonth={addMonths(range.to, -1)}
            nowLabel="Latest complete month"
            detailed
            start={start ? { label: `Where the period began, ${monthEnd(start.month)}`, value: start.net_worth_minor } : null}
          />

          <div className="report-pair">
            <section className="group stack-tight" aria-labelledby="worth-accounts">
              <h2 className="headline" id="worth-accounts">
                What changed, by account
              </h2>
              <p className="footnote flush">
                Each balance from {start ? monthEnd(start.month) : 'the start'} to {monthEnd(end.month)}.
              </p>
              <ChangeList rows={counted} currency={currency} />
              {leftOut.length > 0 && (
                <p className="footnote flush">
                  Not in net worth:{' '}
                  {leftOut.map((a, i) => (
                    <span key={a.account_id}>
                      {i > 0 && ', '}
                      <Link to={accountPath(a.account_id)}>{a.name}</Link>
                    </span>
                  ))}
                </p>
              )}
            </section>

            <section className="group stack-tight" aria-labelledby="worth-bridge">
              <h2 className="headline" id="worth-bridge">
                Why it moved
              </h2>
              <table className="ledger compact">
                <tbody>
                  <tr>
                    <th scope="row">Net cash flow, money in less money out</th>
                    <td className="num">
                      <Amount minor={change.cash_flow_minor} currency={currency} signed />
                    </td>
                  </tr>
                  <tr>
                    <th scope="row">Opening balances of accounts that began</th>
                    <td className="num">
                      <Amount minor={change.openings_minor} currency={currency} signed />
                    </td>
                  </tr>
                  <tr>
                    <th scope="row">Moved to or from accounts left out of net worth</th>
                    <td className="num">
                      <Amount minor={change.moved_minor} currency={currency} signed />
                    </td>
                  </tr>
                  <tr className="ledger-total">
                    <th scope="row">Change in net worth</th>
                    <td className="num">
                      <Amount minor={change.change_minor} currency={currency} signed />
                    </td>
                  </tr>
                </tbody>
              </table>
              <p className="footnote flush">These add up to the change to the cent; nothing else moves net worth in Lodestar.</p>
            </section>
          </div>

          <AboutFigures
            items={[
              'Only accounts in Lodestar count: a home or car you own is not included unless you add it as an account.',
              'An investment account is one balance with no prices: it changes only by transactions, so market gains are not shown.',
              'Cards and loans are negative balances, so net worth is a plain sum of balances.',
            ]}
          />
        </>
      )}
    </div>
  );
}

function monthsIn(range: { from: string; to: string }): number {
  const [fy, fm] = range.from.split('-').map(Number);
  const [ty, tm] = range.to.split('-').map(Number);
  return ((ty ?? 0) - (fy ?? 0)) * 12 + ((tm ?? 0) - (fm ?? 0));
}

// One row per account: its change as a bar from a zero line, more owed or
// less owned to the left, in grey; more owned or less owed to the right, in
// ink. The amount carries the sign, so the direction never rests on colour.
function ChangeList({ rows, currency }: { rows: AccountChange[]; currency: Currency }) {
  if (rows.length === 0) return <p className="footnote flush">No account changed.</p>;
  const up = Math.max(0, ...rows.map((r) => r.change_minor));
  const down = Math.max(0, ...rows.map((r) => -r.change_minor));
  // Where zero sits: enough room on the left for the largest fall.
  const zero = up + down === 0 ? 50 : Math.max(8, (down / (up + down)) * 100);
  return (
    <ul className="change-list">
      {rows.map((row) => {
        const width = row.change_minor >= 0 ? (up ? (row.change_minor / up) * (100 - zero) : 0) : (-row.change_minor / down) * zero;
        return (
          <li key={row.account_id}>
            <Link className="change-row" to={accountPath(row.account_id)}>
              <span className="change-name">
                {row.name}
                <small>{accountTypeLabel(row.type as AccountType)}</small>
              </span>
              <span className="change-track" aria-hidden>
                <span className="change-axis" style={{ left: `${zero}%` }} />
                <span
                  className={row.change_minor < 0 ? 'change-bar down' : 'change-bar'}
                  style={row.change_minor < 0 ? { right: `${100 - zero}%`, width: `${width}%` } : { left: `${zero}%`, width: `${width}%` }}
                />
              </span>
              <Amount minor={row.change_minor} currency={currency} signed />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
