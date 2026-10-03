import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Check, CircleAlert } from 'lucide-react';
import { useCurrency, useProfile } from '../../lib/profile';
import { addMonths, formatMonth, monthStartInZone } from '../../lib/dates';
import { share, signedShare } from '../../lib/percent';
import { budgetLinePath, budgetMonthPath } from '../../lib/routes';
import { budgetFindings } from '../../lib/standsOut';
import { Amount } from '../../ui/Amount';
import { Notice } from '../../ui/Notice';
import { ScrollTable } from '../../ui/ScrollTable';
import { PlanGrid, type PlanRow } from '../../ui/PlanGrid';
import { Select } from '../../ui/Select';
import { dataErrorMessage } from '../auth/errors';
import { useCategories } from '../categories/queries';
import { filterSearch, useReportFilters } from './filters';
import { useBudgetResults, useBudgetSummary, type BudgetResult } from './queries';
import { ReportClosing, ReportHead } from './ReportParts';

// Budget vs actual: one month's plans against what was spent, and twelve
// months of which plans held. A month is picked here rather than a period,
// since plans are monthly. Spent counts expenses only and agrees with the
// Budgets page to the cent; every total comes from Postgres.

const MONTHS_OFFERED = 24;

export function BudgetsReportPage() {
  const currency = useCurrency();
  const profile = useProfile();
  const currentMonth = monthStartInZone(profile.data?.timezone);
  const [params, setParams] = useSearchParams();
  const [filters] = useReportFilters();
  const asked = params.get('month');
  const offered = Array.from({ length: MONTHS_OFFERED }, (_, i) => addMonths(currentMonth, -i));
  const month = asked && offered.includes(asked) ? asked : currentMonth;
  const inProgress = month === currentMonth;
  const from = addMonths(month, -11);
  const summary = useBudgetSummary(month);
  const results = useBudgetResults(from, addMonths(month, 1));
  const categories = useCategories();
  const names = useMemo(() => new Map((categories.data ?? []).map((c) => [c.id, c.name])), [categories.data]);
  const nameOf = (id: string | null) => (id ? (names.get(id) ?? 'Category') : 'Uncategorized');

  const all = results.data ?? [];
  const thisMonth = all.filter((r) => r.month === month && r.planned_minor !== null);
  const months = Array.from({ length: 12 }, (_, i) => addMonths(from, i));
  const s = summary.data;
  const left = s ? s.planned_minor - s.spent_planned_minor : 0;
  const error = summary.error ?? results.error;

  // Every category with a plan in the 12 months, its months in order.
  const grid: PlanRow[] = (() => {
    const planned = [...new Set(all.filter((r) => r.planned_minor !== null).map((r) => r.category_id!))];
    return planned.map((id) => ({
      key: id,
      label: nameOf(id),
      cells: months.map((m) => {
        const r = all.find((x) => x.category_id === id && x.month === m && x.planned_minor !== null);
        return { month: m, state: !r ? ('none' as const) : r.within_plan ? ('within' as const) : ('over' as const) };
      }),
    }));
  })();
  const worst = grid
    .map((row) => ({
      name: row.label,
      over: row.cells.filter((c) => c.state === 'over').length,
      planned: row.cells.filter((c) => c.state !== 'none').length,
    }))
    .sort((a, b) => b.over - a.over)[0];
  const monthWord = formatMonth(month).split(' ')[0]!;

  return (
    <div className="page">
      <ReportHead
        back={filterSearch(filters)}
        title="Budget vs actual"
        subtitle={`${formatMonth(month)}${inProgress ? ' so far' : ''} · monthly plans${
          s?.first_month ? ` · plans since ${formatMonth(s.first_month)}` : ''
        }`}
        controls={
          <div className="report-filters">
            <div className="report-filter">
              <span className="report-filter-name" aria-hidden>
                Month
              </span>
              <Select
                label="Month"
                value={month}
                onChange={(next) => setParams(new URLSearchParams({ ...Object.fromEntries(params), month: next }), { replace: true })}
                options={offered.map((m) => ({ value: m, label: m === currentMonth ? `${formatMonth(m)} so far` : formatMonth(m) }))}
              />
            </div>
          </div>
        }
      />

      {error && <Notice tone="err">{dataErrorMessage(error)}</Notice>}
      {(!summary.data || !results.data) && !error && <p className="secondary">Working out your figures…</p>}

      {s && results.data && s.lines === 0 && (
        <p className="secondary">
          No plans for {formatMonth(month)}. <Link to={budgetMonthPath(month)}>Plan this month</Link>
        </p>
      )}

      {s && results.data && s.lines > 0 && (
        <>
          <section className="group fig-band fig-band-5" aria-label="This month">
            <div className="fig-cell">
              <h2 className="caption">Planned</h2>
              <p className="card-figure flush">
                <Amount minor={s.planned_minor} currency={currency} />
              </p>
              <p className="footnote flush">
                {s.lines} expense {s.lines === 1 ? 'category' : 'categories'}
              </p>
            </div>
            <div className="fig-cell">
              <h2 className="caption">Spent</h2>
              <p className="card-figure flush">
                <Amount minor={s.spent_planned_minor} currency={currency} />
              </p>
              <p className="footnote flush">
                {share(s.spent_planned_minor, s.planned_minor)} of plan
                {s.uncategorized_minor + s.unplanned_minor > 0 && (
                  <>
                    {' · plus '}
                    <Amount minor={s.uncategorized_minor + s.unplanned_minor} currency={currency} /> without a plan
                  </>
                )}
              </p>
            </div>
            <div className="fig-cell">
              <h2 className="caption">{left >= 0 ? 'Left to spend' : 'Over plan by'}</h2>
              <p className="fig flush">
                <span className="bracket">
                  <Amount minor={Math.abs(left)} currency={currency} />
                </span>
              </p>
              <p className="footnote flush">
                {share(Math.abs(left), s.planned_minor)} {left >= 0 ? 'under' : 'over'} plan overall
              </p>
            </div>
            <div className="fig-cell">
              <h2 className="caption">Within plan</h2>
              <p className="card-figure flush">
                {s.within} of {s.lines}
              </p>
              <p className="footnote flush">categories {inProgress ? 'so far' : 'this month'}</p>
            </div>
            <div className="fig-cell">
              <h2 className="caption">Plan accuracy, 12 months</h2>
              <p className="card-figure flush">{share(s.history_within, s.history_lines)}</p>
              <p className="footnote flush">
                {s.history_within} of {s.history_lines} category-months within plan
              </p>
            </div>
          </section>

          <div className="report-pair wide-left">
            <PlannedSpent month={month} rows={thisMonth} nameOf={nameOf} total={{ planned: s.planned_minor, spent: s.spent_planned_minor }} />
            <section className="group stack-tight" aria-labelledby="budgets-grid">
              <div>
                <h2 className="headline" id="budgets-grid">
                  Within plan, month by month
                </h2>
                <p className="footnote flush">Solid: within plan. Hatched: over. Outlined: no plan.</p>
              </div>
              <PlanGrid rows={grid} months={months} caption={`Plans held, ${formatMonth(from)} to ${formatMonth(month)}`} />
            </section>
          </div>

          <ReportClosing
            currency={currency}
            findings={budgetFindings(monthWord, inProgress, left, s.within, s.lines, worst ? { ...worst, average_minor: null, plan_minor: null } : null)}
            about={[
              'Spent counts the calendar month’s expenses; transfers never count.',
              'Spending without a plan, and spending with no category, is shown apart from the plans.',
              'Bars use a square-root scale, so small plans stay readable.',
            ]}
          />
        </>
      )}
    </div>
  );
}

function PlannedSpent({
  month,
  rows,
  nameOf,
  total,
}: {
  month: string;
  rows: BudgetResult[];
  nameOf: (id: string | null) => string;
  total: { planned: number; spent: number };
}) {
  const currency = useCurrency();
  // A square-root scale keeps a 30.00 plan readable beside a 1,650.00 one.
  const largest = Math.sqrt(Math.max(1, ...rows.map((r) => Math.max(r.spent_minor, r.planned_minor ?? 0))));
  const at = (minor: number) => (Math.sqrt(Math.max(0, minor)) / largest) * 100;
  const left = total.planned - total.spent;
  return (
    <section className="group stack-tight" aria-labelledby="budgets-month">
      <div>
        <h2 className="headline" id="budgets-month">
          Planned and spent, {formatMonth(month)}
        </h2>
        <p className="footnote flush">Grey bar: spent. Tick: the plan. Hatching: the part over plan. Variance is what is left (+) or over (−).</p>
      </div>
      <ScrollTable label="Plans against spending, table">
        <table className="ledger compact plan-table">
          <thead>
            <tr>
              <th scope="col">Category</th>
              <th scope="col">
                <span className="visually-hidden">Spent against plan</span>
              </th>
              <th scope="col" className="num">
                Planned
              </th>
              <th scope="col" className="num">
                Spent
              </th>
              <th scope="col" className="num">
                Variance
              </th>
              <th scope="col" className="num">
                %
              </th>
              <th scope="col">
                <span className="visually-hidden">Result</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const planned = r.planned_minor ?? 0;
              const variance = planned - r.spent_minor;
              const over = !r.within_plan;
              return (
                <tr key={r.category_id ?? 'none'}>
                  <th scope="row">
                    {r.category_id ? <Link to={budgetLinePath(month, r.category_id)}>{nameOf(r.category_id)}</Link> : nameOf(null)}
                  </th>
                  <td className="plan-bar-cell" aria-hidden="true">
                    <span className="plan-bar">
                      <i className="plan-bar-spent" style={{ width: `${at(Math.min(r.spent_minor, planned))}%` }} />
                      {over && (
                        <i
                          className="plan-bar-over"
                          style={{ left: `${at(planned)}%`, width: `${at(r.spent_minor) - at(planned)}%` }}
                        />
                      )}
                      <i className="plan-bar-tick" style={{ left: `${at(planned)}%` }} />
                    </span>
                  </td>
                  <td className="num">
                    <Amount minor={planned} currency={currency} />
                  </td>
                  <td className="num">
                    <Amount minor={r.spent_minor} currency={currency} />
                  </td>
                  <td className={`num${over ? ' strong' : ''}`}>
                    <Amount minor={variance} currency={currency} signed />
                  </td>
                  <td className="num secondary">{planned > 0 ? signedShare(variance, planned) : '—'}</td>
                  <td className="plan-result">
                    {over ? (
                      <span className="status-line status-strong">
                        <CircleAlert strokeWidth={1.75} aria-hidden />
                        Over plan
                      </span>
                    ) : (
                      <span className="status-line">
                        <Check strokeWidth={1.75} aria-hidden />
                        Within plan
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
            <tr className="ledger-total">
              <th scope="row">Total</th>
              <td />
              <td className="num">
                <Amount minor={total.planned} currency={currency} />
              </td>
              <td className="num">
                <Amount minor={total.spent} currency={currency} />
              </td>
              <td className="num">
                <Amount minor={left} currency={currency} signed />
              </td>
              <td className="num">{total.planned > 0 ? signedShare(left, total.planned) : '—'}</td>
              <td />
            </tr>
          </tbody>
        </table>
      </ScrollTable>
    </section>
  );
}
