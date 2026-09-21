import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useCurrency, useProfile } from '../../lib/profile';
import { addMonths, formatMonth, monthStartInZone, todayInZone } from '../../lib/dates';
import { activityPath, budgetLinePath, isUuid, lastTwelveMonths, monthRange } from '../../lib/routes';
import { Amount } from '../../ui/Amount';
import { Button } from '../../ui/Button';
import { DetailHeader, DetailNotFound, Facet, Facets, FigureRow, KeyFigure, SectionHead } from '../../ui/Detail';
import { MonthBars } from '../../ui/MonthChart';
import { Notice } from '../../ui/Notice';
import { dataErrorMessage } from '../auth/errors';
import { useAccounts } from '../accounts/queries';
import { useBudgetHistory, useBudgets } from '../budgets/queries';
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
  const back = { to: '/budgets', label: 'Budgets' };

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
  const top = useTopDescriptions(category.id, from, addMonths(thisMonth, 1));
  const plans = useBudgetHistory(expense ? category.id : undefined, addMonths(thisMonth, -5), thisMonth);
  const thisBudget = useBudgets(thisMonth);
  const groups = useCategoryGroups();
  const siblings = useCategories();
  const usage = useCategoryUsage();
  const [editing, setEditing] = useState(false);

  const byMonth = useMemo(() => new Map((months.data ?? []).map((m) => [m.month, m])), [months.data]);
  const series = window.map((month) => ({ month, value: byMonth.get(month)?.total_minor ?? 0 }));
  const current = byMonth.get(thisMonth)?.total_minor ?? 0;
  const lastYear = series.reduce((sum, m) => sum + m.value, 0);
  // A typical month leaves out the current one, which is always partial, and
  // the months before the category was first used.
  const firstUsed = series.findIndex((m) => m.value > 0);
  const complete = firstUsed === -1 ? [] : series.slice(firstUsed, -1);
  const typical = complete.length > 0 ? Math.round(complete.reduce((s, m) => s + m.value, 0) / complete.length) : null;
  const plan = (thisBudget.data ?? []).find((b) => b.category_id === category.id);
  const group = (groups.data ?? []).find((g) => g.id === category.group_id)?.name;
  const useCount = useMemo(() => new Map((usage.data ?? []).map((u) => [u.category_id, u.use_count])), [usage.data]);
  const topMax = Math.max(1, ...(top.data ?? []).map((t) => t.total_minor));

  return (
    <div className="page">
      <DetailHeader
        back={{ to: '/budgets', label: 'Budgets' }}
        title={category.name}
        subtitle={
          <>
            {expense ? 'Expense' : 'Income'}
            {group && ` · ${group}`}
            {` · ${useCount.get(category.id) ?? 0} transactions`}
            {category.archived_at && ' · Archived'}
          </>
        }
        actions={<Button onClick={() => setEditing(true)}>Edit</Button>}
      />

      <FigureRow>
        <KeyFigure
          label={expense ? 'Spent this month' : 'Received this month'}
          footnote={
            plan ? (
              <>
                Plan <Amount minor={plan.planned_minor} currency={currency} /> ·{' '}
                <Link to={budgetLinePath(thisMonth, category.id)}>
                  {plan.left_minor < 0 ? (
                    <>
                      Over plan by <Amount minor={-plan.left_minor} currency={currency} />
                    </>
                  ) : (
                    <>
                      <Amount minor={plan.left_minor} currency={currency} /> left
                    </>
                  )}
                </Link>
              </>
            ) : expense ? (
              <Link to={budgetLinePath(thisMonth, category.id)}>No plan this month</Link>
            ) : undefined
          }
        >
          <Amount minor={current} currency={currency} />
        </KeyFigure>
        <Facets label="Totals">
          <Facet label="Last 12 months">
            <Amount minor={lastYear} currency={currency} />
          </Facet>
          <Facet label="A typical month">
            {typical === null ? '—' : <Amount minor={typical} currency={currency} />}
          </Facet>
        </Facets>
      </FigureRow>

      {months.isError && <Notice tone="err">{dataErrorMessage(months.error)}</Notice>}
      <MonthBars
        title={expense ? 'Spent each month' : 'Received each month'}
        caption={expense ? 'A bar opens that month’s budget line' : 'A bar opens that month in Activity'}
        rows={series}
        currency={currency}
        currentMonth={thisMonth}
        tone={expense ? 'out' : 'in'}
        valueLabel={expense ? 'Spent' : 'Received'}
        linkFor={(month) =>
          expense
            ? budgetLinePath(month, category.id)
            : activityPath({ categoryId: category.id, from: month, to: monthRange(month).to })
        }
      />

      <div className="detail-pair">
        <section className="group stack-tight" aria-labelledby="category-where">
          <div>
            <h2 className="headline" id="category-where">
              {expense ? 'Where it goes' : 'Where it comes from'}
            </h2>
            <p className="footnote flush">Last 12 months, grouped on the exact description</p>
          </div>
          {top.isError && <Notice tone="err">{dataErrorMessage(top.error)}</Notice>}
          {top.data && top.data.length === 0 && <p className="secondary flush">Nothing in the last 12 months.</p>}
          <ul className="bar-list">
            {(top.data ?? []).map((t) => (
              <li key={t.description}>
                <div className="bar-list-row">
                  <span>{t.description}</span>
                  <Amount minor={t.total_minor} currency={currency} />
                </div>
                <div className="bar-track" role="presentation">
                  <i style={{ width: `${Math.max(2, Math.round((t.total_minor / topMax) * 100))}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </section>

        {expense && (
          <section className="group stack-tight" aria-labelledby="category-plans">
            <h2 className="headline" id="category-plans">
              Plan against actual
            </h2>
            {plans.data && plans.data.length === 0 ? (
              <p className="secondary flush">No plans in the last six months.</p>
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
                      Difference
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {(plans.data ?? []).map((p) => (
                    <tr key={p.month}>
                      <th scope="row">
                        <Link to={budgetLinePath(p.month, category.id)}>{formatMonth(p.month).slice(0, 3)}</Link>
                      </th>
                      <td className="num">
                        <Amount minor={p.planned_minor} currency={currency} />
                      </td>
                      <td className="num">
                        <Amount minor={p.spent_minor} currency={currency} />
                      </td>
                      <td className="num">
                        {p.left_minor < 0 ? (
                          <strong>
                            Over by <Amount minor={-p.left_minor} currency={currency} />
                          </strong>
                        ) : (
                          <span className="secondary">
                            <Amount minor={p.left_minor} currency={currency} /> left
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        )}
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
    pending: row.status === 'pending',
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
