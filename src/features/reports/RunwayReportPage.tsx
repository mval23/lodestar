import { useSearchParams } from 'react-router';
import { useCurrency } from '../../lib/profile';
import { addMonths, formatMonth } from '../../lib/dates';
import { runwayFindings } from '../../lib/standsOut';
import { Amount } from '../../ui/Amount';
import { MonthBars } from '../../ui/MonthChart';
import { Notice } from '../../ui/Notice';
import { RunwayBar, formatMonths } from '../../ui/RunwayBar';
import { Select } from '../../ui/Select';
import { dataErrorMessage } from '../auth/errors';
import { useCategoryGroups } from '../categories/queries';
import { filterSearch, useReportFilters } from './filters';
import { useCashRunway, useReportCashFlow, type RunwayLine } from './queries';
import { ReportClosing, ReportHead, useReportRange } from './ReportParts';

// Cash runway: how many months cash and goal savings would cover spending if
// nothing came in, at the recent average. Every figure, months included, is
// a line of cash_runway, so the table and the figures above it are the same
// numbers. It is an estimate, and says so.

const BASIS_MONTHS = 6;

export function RunwayReportPage() {
  const currency = useCurrency();
  const report = useReportRange();
  const [filters] = useReportFilters();
  const [params, setParams] = useSearchParams();
  const groups = useCategoryGroups();
  const groupId = (groups.data ?? []).some((g) => g.id === params.get('group')) ? params.get('group') : null;
  const group = (groups.data ?? []).find((g) => g.id === groupId) ?? null;
  const runway = useCashRunway(BASIS_MONTHS, groupId);
  const recent = useReportCashFlow(addMonths(report.currentMonth, -12), report.currentMonth, null);

  const lines = runway.data ?? [];
  const one = (line: RunwayLine['line']) => lines.find((l) => l.line === line) ?? null;
  const available = one('available');
  const goals = one('goals');
  const spending = one('spending');
  const total = one('runway');
  const withLoans = one('runway_loans');
  const loans = one('loan_payments');
  const groupSpending = one('group_spending');
  const groupRunway = one('group_runway');
  const accounts = lines.filter((l) => l.line === 'account');
  const goalLines = lines.filter((l) => l.line === 'goal');
  const blocks = [
    ...(available && available.months !== null && available.months > 0
      ? [{ key: 'available', label: 'Available cash', months: available.months, minor: available.amount_minor }]
      : []),
    ...goalLines
      .filter((g) => g.months !== null && g.months > 0)
      .map((g) => ({ key: g.account_id ?? g.name ?? '', label: g.name ?? 'Goal', months: g.months!, minor: g.amount_minor })),
  ];
  const basisFrom = addMonths(report.currentMonth, -BASIS_MONTHS);
  const basisTo = addMonths(report.currentMonth, -1);

  return (
    <div className="page">
      <ReportHead
        back={filterSearch(filters)}
        title="Cash runway"
        subtitle={`Balances today · spending average ${formatMonth(basisFrom)} – ${formatMonth(basisTo)}`}
        controls={
          <div className="report-filters">
            <div className="report-filter">
              <span className="report-filter-name" aria-hidden>
                Essentials
              </span>
              <Select
                label="Category group for essentials"
                value={groupId ?? ''}
                onChange={(next) => {
                  const nextParams = new URLSearchParams(params);
                  if (next) nextParams.set('group', next);
                  else nextParams.delete('group');
                  setParams(nextParams, { replace: true });
                }}
                options={[{ value: '', label: 'No group' }, ...(groups.data ?? []).map((g) => ({ value: g.id, label: g.name }))]}
              />
            </div>
          </div>
        }
      />

      {runway.isError && <Notice tone="err">{dataErrorMessage(runway.error)}</Notice>}
      {!runway.data && !runway.isError && <p className="secondary">Working out your figures…</p>}

      {runway.data && total && (
        <>
          <section className="group fig-band fig-band-5" aria-label="Runway">
            <div className="fig-cell">
              <h2 className="caption">
                Months of runway <span className="estimate-tag">Estimate</span>
              </h2>
              <p className="fig flush">
                <span className="bracket">{total.months !== null ? `${formatMonths(total.months)} months` : '—'}</span>
              </p>
              <p className="footnote flush">Cash and goal savings, over average monthly spending</p>
            </div>
            <div className="fig-cell">
              <h2 className="caption">Available cash</h2>
              <p className="card-figure flush">
                <Amount minor={available?.amount_minor ?? 0} currency={currency} />
              </p>
              <p className="footnote flush">
                Checking and cash, after card balances
                {available?.months !== null && available?.months !== undefined && ` · ${formatMonths(available.months)} months`}
              </p>
            </div>
            <div className="fig-cell">
              <h2 className="caption">Goal savings accounts</h2>
              <p className="card-figure flush">
                <Amount minor={goals?.amount_minor ?? 0} currency={currency} />
              </p>
              <p className="footnote flush">{goalLines.length > 0 ? goalLines.map((g) => g.name).join(', ') : 'No goal savings accounts'}</p>
            </div>
            <div className="fig-cell">
              <h2 className="caption">Average monthly spending</h2>
              <p className="card-figure flush">
                <Amount minor={spending?.amount_minor ?? 0} currency={currency} />
              </p>
              <p className="footnote flush">
                {spending?.n ?? 0} {spending?.n === 1 ? 'month' : 'months'} with activity · all expenses
              </p>
            </div>
            <div className="fig-cell">
              <h2 className="caption">
                {group ? `${group.name} only` : 'Essentials only'} <span className="estimate-tag">Estimate</span>
              </h2>
              <p className="card-figure flush">
                {groupRunway?.months !== null && groupRunway?.months !== undefined ? `${formatMonths(groupRunway.months)} months` : '—'}
              </p>
              <p className="footnote flush">
                {group && groupSpending ? (
                  <>
                    at <Amount minor={groupSpending.amount_minor} currency={currency} /> a month on {group.name}
                  </>
                ) : (
                  'Pick a category group above'
                )}
              </p>
            </div>
          </section>

          <div className="report-pair wide-left">
            <section className="group stack-tight" aria-labelledby="runway-cover">
              <div>
                <h2 className="headline" id="runway-cover">
                  How long cash and savings would cover spending
                </h2>
                <p className="footnote flush">
                  If no money came in and spending stayed at the {BASIS_MONTHS}-month average. Each block is one account group, used in order.
                </p>
              </div>
              <RunwayBar blocks={blocks} total={total.months ?? 0} currency={currency} />

              <h3 className="headline">Calculation basis</h3>
              <table className="ledger compact runway-basis">
                <tbody>
                  {accounts.map((a) => (
                    <tr key={a.account_id ?? a.name}>
                      <th scope="row">{a.name}</th>
                      <td className="num">
                        <Amount minor={a.amount_minor} currency={currency} />
                      </td>
                      <td className="secondary">{a.amount_minor < 0 ? 'Card balance owed' : ''}</td>
                    </tr>
                  ))}
                  <tr className="ledger-total">
                    <th scope="row">Available cash</th>
                    <td className="num">
                      <Amount minor={available?.amount_minor ?? 0} currency={currency} />
                    </td>
                    <td className="secondary">Checking, cash and savings without a goal, less what cards owe</td>
                  </tr>
                  <tr>
                    <th scope="row">+ Goal savings accounts</th>
                    <td className="num">
                      <Amount minor={goals?.amount_minor ?? 0} currency={currency} />
                    </td>
                    <td className="secondary">Savings accounts that back a goal; investments are not counted as cash</td>
                  </tr>
                  <tr>
                    <th scope="row">÷ Average monthly spending</th>
                    <td className="num">
                      <Amount minor={spending?.amount_minor ?? 0} currency={currency} />
                    </td>
                    <td className="secondary">
                      All expenses, the last {BASIS_MONTHS} complete months; months with no activity left out ({spending?.n ?? 0} used)
                    </td>
                  </tr>
                  <tr className="ledger-total">
                    <th scope="row">Runway</th>
                    <td className="num">{total.months !== null ? `${formatMonths(total.months)} months` : '—'}</td>
                    <td className="secondary">
                      {withLoans?.months !== null && withLoans?.months !== undefined && loans && loans.amount_minor > 0 ? (
                        <>
                          {formatMonths(withLoans.months)} months if the <Amount minor={loans.amount_minor} currency={currency} /> of loan
                          payments a month are also counted
                        </>
                      ) : (
                        ''
                      )}
                    </td>
                  </tr>
                </tbody>
              </table>
            </section>

            {recent.data && (
              <MonthBars
                title="Recent spending"
                caption={`The last 12 complete months; the dashed line is the ${BASIS_MONTHS}-month average.`}
                rows={recent.data.map((m) => ({ month: m.month, value: m.money_out_minor }))}
                currency={currency}
                currentMonth={addMonths(report.currentMonth, -1)}
                tone="out"
                valueLabel="Spent"
                typical={spending?.amount_minor ?? null}
                typicalLabel={`${BASIS_MONTHS}-month average`}
              />
            )}
          </div>

          <ReportClosing
            currency={currency}
            findings={runwayFindings(
              total.months,
              available?.months ?? null,
              group && groupRunway?.months !== null && groupRunway?.months !== undefined ? { name: group.name, months: groupRunway.months } : null,
            )}
            about={[
              'An estimate, not a forecast: no income, and spending as steady as the recent average.',
              'Loan payments are transfers, so they are not in the spending average.',
              'Goal savings show what they could cover, not a plan to spend them.',
            ]}
          />
        </>
      )}
    </div>
  );
}
