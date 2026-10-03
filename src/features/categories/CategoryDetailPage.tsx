import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useCurrency, useProfile } from '../../lib/profile';
import { addMonths, formatMonth, monthStartInZone, todayInZone } from '../../lib/dates';
import { activityPath, budgetLinePath, isUuid, lastTwelveMonths, monthRange } from '../../lib/routes';
import { categoryFindings } from '../../lib/standsOut';
import { percentChange, share } from '../../lib/percent';
import { Amount } from '../../ui/Amount';
import { Button } from '../../ui/Button';
import { DetailHeader, DetailNotFound, SectionHead } from '../../ui/Detail';
import { MonthBars } from '../../ui/MonthChart';
import { Notice } from '../../ui/Notice';
import { RangeBar } from '../../ui/RangeBar';
import { StandsOut } from '../../ui/StandsOut';
import { dataErrorMessage } from '../auth/errors';
import { useAccounts } from '../accounts/queries';
import { useBudgetHistory } from '../budgets/queries';
import {
  ActivityRows,
  QuickAdd,
  describeTransaction,
  signedAmount,
  type ActivityRow,
} from '../transactions/DetailActivity';
import { DEFAULT_FILTERS, useTransactions } from '../transactions/queries';
import { CategorySheet } from './CategoryManager';
import {
  useCategories,
  useCategory,
  useCategoryGroups,
  useCategoryMonths,
  useCategoryStats,
  useCategoryUsage,
  useTopDescriptions,
  type Category,
} from './queries';

// A category holds exactly one kind, and the database holds every transaction
// in it to that kind. So this page has one activity table, not three tabs:
// Income and Transfers could never fill here.
export function CategoryDetailPage() {
  const { id } = useParams();
  const valid = isUuid(id);
  const category = useCategory(valid ? id : undefined);
  const back = { to: '/categories', label: 'Categories' };

  if (!valid || (category.isSuccess && !category.data)) return <DetailNotFound what="category" back={back} />;
  if (category.isError)
    return (
      <div className="page">
        <Notice tone="err">{dataErrorMessage(category.error)}</Notice>
      </div>
    );
  if (!category.data)
    return (
      <div className="page">
        <p className="secondary">Loading the category…</p>
      </div>
    );
  return <CategoryDetail category={category.data} />;
}

function CategoryDetail({ category }: { category: Category }) {
  const currency = useCurrency();
  const profile = useProfile();
  const thisMonth = monthStartInZone(profile.data?.timezone);
  const today = todayInZone(profile.data?.timezone);
  const window = lastTwelveMonths(thisMonth);
  const from = window[0]!;
  const expense = category.kind === 'expense';

  const months = useCategoryMonths(category.id, from);
  const stats = useCategoryStats(category.id, thisMonth);
  const top = useTopDescriptions(category.id, from, addMonths(thisMonth, 1));
  const plans = useBudgetHistory(expense ? category.id : undefined, from, thisMonth);
  const groups = useCategoryGroups();
  const siblings = useCategories();
  const usage = useCategoryUsage();
  const [editing, setEditing] = useState(false);

  const byMonth = useMemo(() => new Map((months.data ?? []).map((m) => [m.month, m])), [months.data]);
  const planBy = useMemo(() => new Map((plans.data ?? []).map((p) => [p.month, p.planned_minor])), [plans.data]);
  const series = window.map((month) => ({
    month,
    value: byMonth.get(month)?.total_minor ?? 0,
    ...(expense ? { plan: planBy.get(month) ?? null } : {}),
  }));
  const st = stats.data ?? null;
  const group = (groups.data ?? []).find((g) => g.id === category.group_id)?.name;
  const useCount = useMemo(() => new Map((usage.data ?? []).map((u) => [u.category_id, u.use_count])), [usage.data]);
  const topMax = Math.max(1, ...(top.data ?? []).map((t) => t.total_minor));
  const monthWord = formatMonth(thisMonth).split(' ')[0];
  const day = Number(today.slice(8, 10));
  const pastPlans = [...(plans.data ?? [])].filter((p) => p.month < thisMonth).reverse();

  return (
    <div className="page">
      <DetailHeader
        back={{ to: '/categories', label: 'Categories' }}
        title={category.name}
        subtitle={
          <>
            {expense ? 'Expense category' : 'Income category'}
            {group && ` · ${group}`}
            {` · ${useCount.get(category.id) ?? 0} transactions`}
            {category.archived_at && ' · Archived'}
          </>
        }
        actions={<Button onClick={() => setEditing(true)}>Edit</Button>}
      />

      {stats.isError && <Notice tone="err">{dataErrorMessage(stats.error)}</Notice>}
      {st && <StandsOut currency={currency} findings={categoryFindings(category.name, category.kind, st, st.plan_minor)} />}

      <section className={`group fig-band category-band${expense ? '' : ' three'}`} aria-label="This category">
        <div className="fig-cell category-now">
          <h2 className="caption">{expense ? 'Spent this month' : 'Received this month'}</h2>
          <p className="fig flush">
            <span className="bracket">
              <Amount minor={st?.this_month_minor ?? 0} currency={currency} />
            </span>
          </p>
          {st && st.months > 0 && st.low_minor !== null && st.high_minor !== null && (
            <RangeBar value={st.this_month_minor} low={st.low_minor} high={st.high_minor} typical={st.typical_minor} currency={currency} />
          )}
          <p className="footnote flush">
            {st && st.typical_minor !== null
              ? `${monthWord} 1–${day} · so far ${st.this_month_minor <= st.typical_minor ? 'below' : 'above'} the typical month`
              : 'Not used in the last 12 months'}
          </p>
        </div>
        {expense && (
          <div className="fig-cell">
            <h2 className="caption">Plan</h2>
            <p className="card-figure flush">
              {st?.plan_minor !== null && st?.plan_minor !== undefined ? <Amount minor={st.plan_minor} currency={currency} /> : 'No plan'}
            </p>
            <p className="footnote flush">
              {st && st.planned_months > 0 ? (
                `Over plan in ${st.over_plan_months} of the last ${st.planned_months} ${st.planned_months === 1 ? 'month' : 'months'} with one`
              ) : (
                <Link to={budgetLinePath(thisMonth, category.id)}>{st?.plan_minor ? 'See this month’s line' : 'Plan this month'}</Link>
              )}
            </p>
          </div>
        )}
        <div className="fig-cell">
          <h2 className="caption">Last 3 months</h2>
          <p className="card-figure flush">
            <Amount minor={st?.last3_minor ?? 0} currency={currency} />
          </p>
          <p className="footnote flush">
            {st && st.prev3_minor > 0 ? `${percentChange(st.last3_minor, st.prev3_minor)} on the 3 months before` : 'Nothing in the 3 months before'}
          </p>
        </div>
        <div className="fig-cell">
          <h2 className="caption">{expense ? 'Share of spending' : 'Share of income'}</h2>
          <p className="card-figure flush">{st ? share(st.total_minor, st.kind_total_minor) : '—'}</p>
          <p className="footnote flush">
            {st && st.rank !== null ? `#${st.rank} of ${st.ranked} categories · last 12 months` : 'Last 12 months'}
          </p>
        </div>
      </section>

      <div className="report-pair wide-left">
        <div className="stack">
          {months.isError && <Notice tone="err">{dataErrorMessage(months.error)}</Notice>}
          <MonthBars
            title={expense ? 'Spent each month' : 'Received each month'}
            caption={
              expense
                ? 'Grey: spent. Rule: the plan. Dashed: a typical month. Hatched: the part over plan. A bar opens that month’s budget line.'
                : 'Ink: received. Dashed: a typical month. A bar opens that month in Activity.'
            }
            rows={series}
            currency={currency}
            currentMonth={thisMonth}
            tone={expense ? 'out' : 'in'}
            valueLabel={expense ? 'Spent' : 'Received'}
            planLabel={expense ? 'Plan' : undefined}
            typical={st?.typical_minor ?? null}
            typicalLabel={st?.typical_minor !== null && st?.typical_minor !== undefined ? 'Typical' : undefined}
            hatchOverPlan={expense}
            partialLabel={`${monthWord} so far`}
            linkFor={(month) =>
              expense
                ? budgetLinePath(month, category.id)
                : activityPath({ categoryId: category.id, from: month, to: monthRange(month).to })
            }
          />
        </div>

        <div className="stack">
          <section className="group stack-tight" aria-labelledby="category-where">
            <div>
              <h2 className="headline" id="category-where">
                {expense ? 'Where it goes' : 'Where it comes from'}
              </h2>
              <p className="footnote flush">Last 12 months, grouped on the exact description</p>
            </div>
            {top.isError && <Notice tone="err">{dataErrorMessage(top.error)}</Notice>}
            {top.data && top.data.length === 0 && <p className="secondary flush">Nothing in the last 12 months.</p>}
            {top.data && top.data.length > 0 && (
              <table className="ledger compact category-top">
                <tbody>
                  {top.data.map((t) => (
                    <tr key={t.description}>
                      <th scope="row">
                        {t.description}
                        <small>
                          {' '}
                          · {t.txn_count} × <Amount minor={Math.round(t.total_minor / Math.max(1, t.txn_count))} currency={currency} />
                        </small>
                      </th>
                      <td className="month-cat-bar" aria-hidden="true">
                        <span className="bar-track">
                          <i style={{ width: `${Math.max(2, Math.round((t.total_minor / topMax) * 100))}%` }} />
                        </span>
                      </td>
                      <td className="num">
                        <Amount minor={t.total_minor} currency={currency} />
                      </td>
                      <td className="num secondary">{st ? share(t.total_minor, st.total_minor) : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          {expense && (
            <section className="group stack-tight" aria-labelledby="category-plans">
              <h2 className="headline" id="category-plans">
                Plans
              </h2>
              {plans.data && pastPlans.length === 0 ? (
                <p className="secondary flush">No plans in the last 12 months.</p>
              ) : (
                <table className="ledger compact">
                  <thead>
                    <tr>
                      <th scope="col">Month</th>
                      <th scope="col" className="num">
                        Planned
                      </th>
                      <th scope="col" className="num">
                        Spent
                      </th>
                      <th scope="col" className="num">
                        Left
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {pastPlans.map((p) => (
                      <tr key={p.month}>
                        <th scope="row">
                          <Link to={budgetLinePath(p.month, category.id)}>{formatMonth(p.month)}</Link>
                        </th>
                        <td className="num">
                          <Amount minor={p.planned_minor} currency={currency} />
                        </td>
                        <td className="num">
                          <Amount minor={p.spent_minor} currency={currency} />
                        </td>
                        <td className="num">
                          <Amount minor={p.left_minor} currency={currency} signed />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          )}
        </div>
      </div>

      <section className="stack" aria-labelledby="category-activity">
        <SectionHead
          id="category-activity"
          title="Activity"
          link={{ to: activityPath({ categoryId: category.id }), label: 'See all in Activity' }}
        />
        <div className="kind-panel">
          <QuickAdd
            scope={{
              kind: category.kind,
              categoryId: category.id,
              categoryName: category.name,
              defaultDate: today,
            }}
          />
          <CategoryRows categoryId={category.id} />
        </div>
      </section>

      {editing && (
        <CategorySheet
          category={category}
          siblings={siblings.data ?? []}
          useCount={useCount}
          onClose={() => setEditing(false)}
        />
      )}
    </div>
  );
}

function CategoryRows({ categoryId }: { categoryId: string }) {
  const page = useTransactions({ ...DEFAULT_FILTERS, categoryId });
  const accounts = useAccounts();
  const names = useMemo(() => new Map((accounts.data ?? []).map((a) => [a.account_id, a.name])), [accounts.data]);

  if (page.isError) return <Notice tone="err">{dataErrorMessage(page.error)}</Notice>;
  if (!page.data || page.isPlaceholderData) return <p className="activity-empty secondary">Loading…</p>;

  const rows: ActivityRow[] = page.data.rows.map((row) => ({
    id: row.id,
    occurred_on: row.occurred_on,
    description: row.description,
    // The category is the page itself, so only the account is worth saying.
    detail: describeTransaction(row, (id) => names.get(id ?? '') ?? '—', () => null),
    amount: signedAmount(row),
    signed: row.kind === 'income',
    kind: row.kind,
  }));

  return (
    <>
      <ActivityRows rows={rows} caption="Transactions in this category, newest first" empty="Nothing in this category yet. Add one above." />
      {page.data.total > rows.length && (
        <p className="footnote flush activity-more">
          Showing the latest {rows.length} of {page.data.total}.{' '}
          <Link to={activityPath({ categoryId })}>See the rest in Activity</Link>
        </p>
      )}
    </>
  );
}
