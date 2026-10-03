import { useMemo } from 'react';
import { Link } from 'react-router';
import { useCurrency } from '../../lib/profile';
import { addMonths } from '../../lib/dates';
import { percentChange, share } from '../../lib/percent';
import { activityPath, categoryPath, monthRange } from '../../lib/routes';
import { spendingFindings } from '../../lib/standsOut';
import { ScrollTable } from '../../ui/ScrollTable';
import { Amount } from '../../ui/Amount';
import { Notice } from '../../ui/Notice';
import { StackedMonthBars, type StackSeries, type StackTone } from '../../ui/StackedMonthBars';
import { dataErrorMessage } from '../auth/errors';
import { useBills } from '../bills/queries';
import { useCategories, useCategoryGroups } from '../categories/queries';
import { monthsBetween, rangeLabel } from './filters';
import { useReportCashFlow, useReportCategoryMonths, useReportCategoryTotals, useReportSummary, type CategoryTotal } from './queries';
import { ReportClosing, ReportHead, useReportRange } from './ReportParts';

// Spending by category: each month split by category, the largest fixed
// cost as the grey base, and every category ranked with its share and its
// change on the comparison period. Every amount is summed in Postgres; the
// categories add up to the period's money out.

const NAMED: StackTone[] = ['c2', 'c3', 'c4', 'c5', 'c6', 'c7'];

export function SpendingReportPage() {
  const currency = useCurrency();
  const report = useReportRange();
  const { range, compareFrom, accountIds } = report;
  const totals = useReportCategoryTotals(range.from, range.to, compareFrom, accountIds);
  const byMonth = useReportCategoryMonths(range.from, range.to, accountIds);
  const flow = useReportCashFlow(range.from, range.to, accountIds);
  const summary = useReportSummary(range.from, range.to, compareFrom, accountIds);
  const categories = useCategories();
  const groups = useCategoryGroups();
  const bills = useBills();

  const names = useMemo(() => new Map((categories.data ?? []).map((c) => [c.id, c])), [categories.data]);
  // A category a bill or subscription pays is fixed: the grey base.
  const billed = useMemo(
    () => new Set((bills.data ?? []).filter((b) => !b.archived_at && b.kind === 'expense' && b.category_id).map((b) => b.category_id!)),
    [bills.data],
  );
  const nameOf = (row: { category_id: string | null }) =>
    row.category_id ? (names.get(row.category_id)?.name ?? 'Category') : 'Uncategorized';

  const rows = (totals.data ?? []).filter((r) => r.total_minor > 0);
  const categorized = rows.filter((r) => r.category_id !== null);
  const uncategorized = rows.find((r) => r.category_id === null) ?? null;
  const fixed = categorized.find((r) => billed.has(r.category_id!)) ?? null;
  const flexible = categorized.filter((r) => r !== fixed);
  const total = summary.data?.current.money_out_minor ?? 0;
  const before = summary.data?.compare;
  const comparable = Boolean(before && before.active_months > 0);
  const months = Array.from({ length: monthsBetween(range.from, range.to) }, (_, i) => addMonths(range.from, i));
  const monthTotals = new Map((flow.data ?? []).map((m) => [m.month, m.money_out_minor]));
  // Activity's dates are inclusive: the last day of the period's last month.
  const lastDay = monthRange(addMonths(range.to, -1)).to;
  const error = totals.error ?? byMonth.error ?? summary.error ?? flow.error;

  // Bottom to top: the fixed base, the six largest flexible categories in
  // the breakdown colours, the rest together in the last one, then spending
  // with no category, hatched.
  const series: StackSeries[] = (() => {
    const values = (id: string | null) =>
      new Map((byMonth.data ?? []).filter((r) => r.category_id === id).map((r) => [r.month, r.total_minor]));
    const smaller = flexible.slice(NAMED.length);
    return [
      ...(fixed ? [{ key: fixed.category_id!, label: `${nameOf(fixed)} (fixed)`, tone: 'fixed' as const, values: values(fixed.category_id) }] : []),
      ...flexible.slice(0, NAMED.length).map((r, i) => ({ key: r.category_id!, label: nameOf(r), tone: NAMED[i]!, values: values(r.category_id) })),
      ...smaller.map((r) => ({
        key: r.category_id!,
        label: nameOf(r),
        tone: 'c8' as const,
        values: values(r.category_id),
        group: `${smaller.length} smaller ${smaller.length === 1 ? 'category' : 'categories'}`,
      })),
      ...(uncategorized ? [{ key: 'none', label: 'Uncategorized', tone: 'none' as const, values: values(null) }] : []),
    ];
  })();
  const toneOf = new Map(series.map((s) => [s.key, s.tone]));

  const largest = categorized[0] ?? null;
  const increase = [...flexible]
    .filter((r) => r.compare_minor > 0 || r.total_minor > 0)
    .sort((a, b) => b.total_minor - b.compare_minor - (a.total_minor - a.compare_minor))[0];
  const usedGroups = new Set(categorized.map((r) => names.get(r.category_id!)?.group_id).filter(Boolean));
  const groupNames = (groups.data ?? []).filter((g) => usedGroups.has(g.id)).map((g) => g.name);

  return (
    <div className="page">
      <ReportHead
        back={report.search}
        title="Spending by category"
        subtitle={`${rangeLabel(range)} · complete months${comparable ? ` · compared with ${rangeLabel({ from: before!.period_from, to: before!.period_to })}` : ''}`}
      />

      {error && <Notice tone="err">{dataErrorMessage(error)}</Notice>}
      {!report.ready && <p className="secondary">Working out your figures…</p>}
      {report.ready && report.nothingYet && <p className="secondary">There are no complete months to report yet.</p>}

      {totals.data && summary.data && !report.nothingYet && (
        <>
          <section className="group fig-band fig-band-5" aria-label="This period">
            <div className="fig-cell">
              <h2 className="caption">Total spending</h2>
              <p className="fig flush">
                <span className="bracket">
                  <Amount minor={total} currency={currency} />
                </span>
              </p>
              <p className="footnote flush">
                {comparable ? `${percentChange(total, before!.money_out_minor)} ${report.against}` : 'Nothing earlier to compare with'}
              </p>
            </div>
            <div className="fig-cell">
              <h2 className="caption">Largest category</h2>
              <p className="card-figure flush">{largest ? `${nameOf(largest)} ${share(largest.total_minor, total)}` : '—'}</p>
              <p className="footnote flush">
                {largest && (
                  <>
                    <Amount minor={largest.total_minor} currency={currency} />
                    {fixed === largest && ' · paid by a bill'}
                  </>
                )}
              </p>
            </div>
            <div className="fig-cell">
              <h2 className="caption">Biggest increase</h2>
              <p className="card-figure flush">
                {comparable && increase && increase.total_minor > increase.compare_minor ? nameOf(increase) : '—'}
              </p>
              <p className="footnote flush">
                {comparable && increase && increase.total_minor > increase.compare_minor ? (
                  <>
                    <Amount minor={increase.total_minor - increase.compare_minor} currency={currency} signed /> {report.against}
                  </>
                ) : (
                  'No flexible category grew'
                )}
              </p>
            </div>
            <div className="fig-cell">
              <h2 className="caption">Uncategorized</h2>
              <p className="card-figure flush">
                <Amount minor={uncategorized?.total_minor ?? 0} currency={currency} />
              </p>
              <p className="footnote flush">
                {uncategorized ? (
                  <Link to={activityPath({ kind: 'expense', categoryId: 'none', from: range.from, to: lastDay })}>
                    {uncategorized.txn_count} {uncategorized.txn_count === 1 ? 'expense needs' : 'expenses need'} a category
                  </Link>
                ) : (
                  'Every expense has a category'
                )}
              </p>
            </div>
            <div className="fig-cell">
              <h2 className="caption">Categories used</h2>
              <p className="card-figure flush">{categorized.length}</p>
              <p className="footnote flush">
                {groupNames.length > 0
                  ? `${groupNames.length} ${groupNames.length === 1 ? 'group' : 'groups'} · ${groupNames.join(' and ')}`
                  : 'No groups'}
              </p>
            </div>
          </section>

          <div className="report-pair wide-left">
            <StackedMonthBars
              title="Spending by category, by month"
              caption={
                fixed
                  ? `Each bar adds up to that month’s spending. ${nameOf(fixed)}, the fixed base, is grey.`
                  : 'Each bar adds up to that month’s spending.'
              }
              months={months}
              series={series}
              totals={monthTotals}
              currency={currency}
              currentMonth={months[months.length - 1] ?? ''}
            />
            <RankedTable
              rows={rows}
              total={total}
              compareTotal={comparable ? before!.money_out_minor : null}
              nameOf={nameOf}
              toneOf={toneOf}
              uncategorizedLink={activityPath({ kind: 'expense', categoryId: 'none', from: range.from, to: lastDay })}
              against={report.against}
            />
          </div>

          <ReportClosing
            currency={currency}
            findings={spendingFindings(
              total,
              categorized.map((r) => ({
                name: nameOf(r),
                total_minor: r.total_minor,
                compare_minor: comparable ? r.compare_minor : 0,
                fixed: r === fixed,
              })),
              { minor: uncategorized?.total_minor ?? 0, count: uncategorized?.txn_count ?? 0 },
            )}
            about={[
              'One category per expense, as you assigned it; there is no merchant data.',
              'Card payments and money into goals are transfers, not spending.',
              'Shares are rounded, so they may not add to exactly 100%.',
            ]}
          />
        </>
      )}
    </div>
  );
}

function RankedTable({
  rows,
  total,
  compareTotal,
  nameOf,
  toneOf,
  uncategorizedLink,
  against,
}: {
  rows: CategoryTotal[];
  total: number;
  compareTotal: number | null;
  nameOf: (row: CategoryTotal) => string;
  toneOf: Map<string, StackTone>;
  uncategorizedLink: string;
  against: string;
}) {
  const currency = useCurrency();
  return (
    <section className="group stack-tight" aria-labelledby="spending-ranked">
      <div>
        <h2 className="headline" id="spending-ranked">
          Ranked
        </h2>
        {compareTotal !== null && <p className="footnote flush">Change {against}</p>}
      </div>
      <ScrollTable label="Ranked table">
        <table className="ledger compact ranked">
          <thead>
            <tr>
              <th scope="col">Category</th>
              <th scope="col" className="num">
                Share
              </th>
              <th scope="col" className="num">
                Amount
              </th>
              {compareTotal !== null && (
                <th scope="col" className="num">
                  Change
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.category_id ?? 'none'}>
                <th scope="row">
                  <span className={`swatch stack-swatch-${toneOf.get(r.category_id ?? 'none') ?? 'c8'}`} aria-hidden />{' '}
                  {r.category_id ? <Link to={categoryPath(r.category_id)}>{nameOf(r)}</Link> : <Link to={uncategorizedLink}>{nameOf(r)}</Link>}
                </th>
                <td className="num">{share(r.total_minor, total)}</td>
                <td className="num">
                  <Amount minor={r.total_minor} currency={currency} />
                </td>
                {compareTotal !== null && <td className="num secondary">{r.compare_minor > 0 ? percentChange(r.total_minor, r.compare_minor) : '—'}</td>}
              </tr>
            ))}
            <tr className="ledger-total">
              <th scope="row">Total</th>
              <td className="num">{total > 0 ? '100%' : '—'}</td>
              <td className="num">
                <Amount minor={total} currency={currency} />
              </td>
              {compareTotal !== null && <td className="num">{percentChange(total, compareTotal)}</td>}
            </tr>
          </tbody>
        </table>
      </ScrollTable>
    </section>
  );
}
