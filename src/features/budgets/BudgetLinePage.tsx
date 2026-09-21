import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useCurrency, useProfile } from '../../lib/profile';
import { parseMoney, toAmountInput } from '../../lib/money';
import { addMonths, formatMonth, monthStartInZone, todayInZone } from '../../lib/dates';
import {
  activityPath,
  budgetMonthPath,
  categoryPath,
  isUuid,
  lastTwelveMonths,
  monthFromParam,
  monthPath,
  monthRange,
} from '../../lib/routes';
import { Amount } from '../../ui/Amount';
import { Button } from '../../ui/Button';
import { DetailHeader, DetailNotFound, Facet, Facets, FigureRow, KeyFigure, SectionHead } from '../../ui/Detail';
import { MonthBars } from '../../ui/MonthChart';
import { Notice } from '../../ui/Notice';
import { dataErrorMessage } from '../auth/errors';
import { useAccounts } from '../accounts/queries';
import { useCategory, useCategoryGroups, useCategoryMonths, type Category } from '../categories/queries';
import {
  ActivityRows,
  QuickAdd,
  describeTransaction,
  signedAmount,
  type ActivityRow,
} from '../transactions/DetailActivity';
import { DEFAULT_FILTERS, useTransactions } from '../transactions/queries';
import { useBudgetHistory, useBudgets, useSetBudget } from './queries';

// One category in one month. Addressed by category and month, not by the
// budget row: a category with spending and no plan has no budget row, and
// "no plan yet" is a state of this page, not an error.
export function BudgetLinePage() {
  const { month: param, categoryId } = useParams();
  const month = monthFromParam(param);
  const valid = month !== null && isUuid(categoryId);
  const category = useCategory(valid ? categoryId : undefined);
  const back = { to: month ? budgetMonthPath(month) : '/budgets', label: 'Budgets' };

  // Budgets plan expense categories only.
  if (!valid || (category.isSuccess && (!category.data || category.data.kind !== 'expense')))
    return <DetailNotFound what="budget line" back={back} />;
  if (category.isError)
    return (
      <div className="page">
        <Notice tone="err">{dataErrorMessage(category.error)}</Notice>
      </div>
    );
  if (!category.data)
    return (
      <div className="page">
        <p className="secondary">Loading the budget…</p>
      </div>
    );
  return <BudgetLine key={`${month}-${category.data.id}`} month={month!} category={category.data} />;
}

function BudgetLine({ month, category }: { month: string; category: Category }) {
  const currency = useCurrency();
  const profile = useProfile();
  const thisMonth = monthStartInZone(profile.data?.timezone);
  const today = todayInZone(profile.data?.timezone);
  const span = lastTwelveMonths(month);
  const budgets = useBudgets(month);
  const history = useBudgetHistory(category.id, span[0]!, month);
  const spentByMonth = useCategoryMonths(category.id, span[0]!);
  const groups = useCategoryGroups();
  const setBudget = useSetBudget();
  const range = monthRange(month);

  const line = (budgets.data ?? []).find((b) => b.category_id === category.id);
  const spentRow = (spentByMonth.data ?? []).find((m) => m.month === month);
  // With no plan there is no budget row, so spent comes from the category's own total.
  const spent = line?.spent_minor ?? spentRow?.total_minor ?? 0;
  const [planText, setPlanText] = useState(line ? toAmountInput(line.planned_minor, currency) : '');
  const [error, setError] = useState<string | null>(null);
  const group = (groups.data ?? []).find((g) => g.id === category.group_id)?.name;

  const plans = useMemo(() => new Map((history.data ?? []).map((b) => [b.month, b.planned_minor])), [history.data]);
  const spends = useMemo(
    () => new Map((spentByMonth.data ?? []).map((m) => [m.month, m.total_minor])),
    [spentByMonth.data],
  );
  const series = span.map((m) => ({ month: m, value: spends.get(m) ?? 0, plan: plans.get(m) ?? null }));

  // Pace is only meaningful for the month you are in.
  const current = month === thisMonth;
  const daysInMonth = Number(range.to.slice(8, 10));
  const dayOfMonth = Number(today.slice(8, 10));
  const daysLeft = current ? daysInMonth - dayOfMonth : null;
  const perDay = current && dayOfMonth > 0 ? Math.round(spent / dayOfMonth) : null;
  const projected = perDay !== null ? perDay * daysInMonth : null;

  const save = async () => {
    setError(null);
    const text = planText.trim();
    if (text === '') {
      await setBudget
        .mutateAsync({ budgetId: line?.budget_id, categoryId: category.id, month, amountMinor: null })
        .catch((cause) => setError(dataErrorMessage(cause)));
      return;
    }
    const parsed = parseMoney(text, currency);
    if (!parsed.ok) return setError(parsed.message);
    await setBudget
      .mutateAsync({ budgetId: line?.budget_id, categoryId: category.id, month, amountMinor: parsed.minor })
      .catch((cause) => setError(dataErrorMessage(cause)));
  };

  return (
    <div className="page">
      <DetailHeader
        back={{ to: budgetMonthPath(month), label: formatMonth(month) }}
        title={category.name}
        subtitle={
          <>
            <Link to={monthPath(month)}>{formatMonth(month)}</Link>
            {group && ` · ${group}`}
            {' · '}
            <Link to={categoryPath(category.id)}>All months for this category</Link>
          </>
        }
      />

      {error && <Notice tone="err">{error}</Notice>}

      <FigureRow>
        {line ? (
          <KeyFigure
            label={line.left_minor < 0 ? 'Over plan by' : 'Left this month'}
            footnote={
              <>
                <Amount minor={spent} currency={currency} /> spent of a{' '}
                <Amount minor={line.planned_minor} currency={currency} /> plan
              </>
            }
          >
            <Amount minor={Math.abs(line.left_minor)} currency={currency} />
          </KeyFigure>
        ) : (
          <KeyFigure label="Spent this month" footnote="No plan yet. Set one below.">
            <Amount minor={spent} currency={currency} />
          </KeyFigure>
        )}
        <Facets label="This month">
          {daysLeft !== null && <Facet label="Days remaining">{daysLeft}</Facet>}
          {perDay !== null && (
            <Facet label="Per day so far">
              <Amount minor={perDay} currency={currency} />
            </Facet>
          )}
        </Facets>
      </FigureRow>

      {line && (
        <div className={`prog${line.left_minor < 0 ? ' over' : ''}`} role="presentation">
          <i
            style={{
              width: `${line.planned_minor > 0 ? Math.min(100, Math.round((spent / line.planned_minor) * 100)) : 100}%`,
            }}
          />
        </div>
      )}

      {line && projected !== null && (
        <section className="group pace">
          <p className="flush">
            At this rate, about{' '}
            <strong>
              <Amount minor={projected} currency={currency} />
            </strong>{' '}
            by the {daysInMonth}
            {ordinal(daysInMonth)}
            {projected > line.planned_minor ? (
              <>
                {' — '}
                <Amount minor={projected - line.planned_minor} currency={currency} /> over the plan.
              </>
            ) : (
              <>, within the plan.</>
            )}
          </p>
        </section>
      )}

      <form
        className="group plan-form"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <label htmlFor="plan-amount" className="headline">
          {line ? 'Change the plan' : 'Set a plan'}
        </label>
        <input
          id="plan-amount"
          className="num"
          inputMode="decimal"
          placeholder="No plan"
          value={planText}
          onChange={(e) => setPlanText(e.target.value)}
        />
        <Button type="submit" busy={setBudget.isPending}>
          Save plan
        </Button>
        <p className="footnote flush">Leave it empty to remove the plan. It applies to {formatMonth(month)} only.</p>
      </form>

      <MonthBars
        title="Planned against spent"
        caption={`Twelve months to ${formatMonth(month)}`}
        rows={series}
        currency={currency}
        currentMonth={thisMonth}
        tone="out"
        valueLabel="Spent"
        planLabel="The plan"
        linkFor={(m) => `/budgets/${m.slice(0, 7)}/${category.id}`}
      />

      <section className="stack" aria-labelledby="line-activity">
        <SectionHead
          id="line-activity"
          title={`What made up the ${formatMonth(month)} total`}
          link={{
            to: activityPath({ categoryId: category.id, kind: 'expense', from: range.from, to: range.to }),
            label: 'See all in Activity',
          }}
        />
        <div className="kind-panel">
          <QuickAdd
            scope={{
              kind: 'expense',
              categoryId: category.id,
              categoryName: category.name,
              defaultDate: current ? today : month < thisMonth ? range.to : range.from,
            }}
          />
          <LineRows categoryId={category.id} from={range.from} to={range.to} />
        </div>
      </section>

      {month !== thisMonth && (
        <p className="footnote flush">
          <Link to={`/budgets/${addMonths(month, -1).slice(0, 7)}/${category.id}`}>Previous month</Link>
          {' · '}
          <Link to={`/budgets/${addMonths(month, 1).slice(0, 7)}/${category.id}`}>Next month</Link>
        </p>
      )}
    </div>
  );
}

function ordinal(day: number): string {
  if (day % 100 >= 11 && day % 100 <= 13) return 'th';
  return ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[day % 10] ?? 'th';
}

function LineRows({ categoryId, from, to }: { categoryId: string; from: string; to: string }) {
  const page = useTransactions({ ...DEFAULT_FILTERS, categoryId, kind: 'expense', from, to });
  const accounts = useAccounts();
  const names = useMemo(() => new Map((accounts.data ?? []).map((a) => [a.account_id, a.name])), [accounts.data]);
  if (page.isError) return <Notice tone="err">{dataErrorMessage(page.error)}</Notice>;
  if (!page.data || page.isPlaceholderData) return <p className="activity-empty secondary">Loading…</p>;
  const rows: ActivityRow[] = page.data.rows.map((row) => ({
    id: row.id,
    occurred_on: row.occurred_on,
    description: row.description,
    detail: describeTransaction(row, (id) => names.get(id ?? '') ?? '—', () => null),
    amount: signedAmount(row),
    signed: false,
    pending: row.status === 'pending',
  }));
  return (
    <ActivityRows
      rows={rows}
      caption="Expenses in this category this month, newest first"
      empty="Nothing spent in this category this month."
    />
  );
}
