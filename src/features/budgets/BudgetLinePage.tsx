import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { Check, Gauge } from 'lucide-react';
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
import { budgetLineFindings } from '../../lib/standsOut';
import { Amount } from '../../ui/Amount';
import { Button } from '../../ui/Button';
import { DetailHeader, DetailNotFound, SectionHead } from '../../ui/Detail';
import { MonthBars } from '../../ui/MonthChart';
import { Notice } from '../../ui/Notice';
import { PaceCapsule } from '../../ui/PaceCapsule';
import { RunningTotalChart } from '../../ui/RunningTotalChart';
import { StandsOut } from '../../ui/StandsOut';
import { dataErrorMessage } from '../auth/errors';
import { useAccounts } from '../accounts/queries';
import { useCategory, useCategoryGroups, useCategoryMonths, useCategoryStats, type Category } from '../categories/queries';
import { useDailySpending } from '../months/queries';
import { useBudgetPace } from '../overview/queries';
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
  // The 12 months before this one: what "realistic" is judged on.
  const before = lastTwelveMonths(addMonths(month, -1));
  const budgets = useBudgets(month);
  const pace = useBudgetPace(month);
  const daily = useDailySpending(month, category.id);
  const history = useBudgetHistory(category.id, before[0]!, addMonths(month, -1));
  const spentByMonth = useCategoryMonths(category.id, before[0]!);
  const stats = useCategoryStats(category.id, month);
  const groups = useCategoryGroups();
  const setBudget = useSetBudget();
  const range = monthRange(month);

  const line = (budgets.data ?? []).find((b) => b.category_id === category.id);
  const paceRow = (pace.data ?? []).find((p) => p.category_id === category.id) ?? null;
  const spentRow = (spentByMonth.data ?? []).find((m) => m.month === month);
  // With no plan there is no budget row, so spent comes from the category's own total.
  const spent = line?.spent_minor ?? spentRow?.total_minor ?? 0;
  // The budgets query settles after this component mounts, so the plan cannot
  // be captured in state at mount: it would freeze at "" and an empty field
  // means "remove the plan". `draft` is null until the person types, and the
  // field falls through to whatever the server last said.
  const [draft, setDraft] = useState<string | null>(null);
  const planOnServer = line ? toAmountInput(line.planned_minor, currency) : '';
  const planText = draft ?? planOnServer;
  const [error, setError] = useState<string | null>(null);
  const group = (groups.data ?? []).find((g) => g.id === category.group_id)?.name;

  const plans = useMemo(() => new Map((history.data ?? []).map((b) => [b.month, b.planned_minor])), [history.data]);
  const spends = useMemo(() => new Map((spentByMonth.data ?? []).map((m) => [m.month, m.total_minor])), [spentByMonth.data]);
  const series = before.map((m) => ({ month: m, value: spends.get(m) ?? 0, plan: plans.get(m) ?? null }));
  const planned = (history.data ?? []).length;
  const within = (history.data ?? []).filter((b) => b.spent_minor <= b.planned_minor).length;
  const typical = stats.data?.typical_minor ?? null;
  // A suggested plan only when the plan missed in more than half of the
  // months that had one, and only as a choice: never applied by itself.
  const suggest = planned >= 3 && (planned - within) * 2 > planned && typical !== null && typical !== line?.planned_minor ? typical : null;
  const current = month === thisMonth;
  const monthWord = formatMonth(month).split(' ')[0]!;

  const savePlan = async (amountMinor: number | null) => {
    setError(null);
    // An empty field removes the plan, so saving before the month's plans have
    // arrived could remove one this page hasn't shown yet. `data` is undefined
    // until the first read lands, which is exactly that window.
    if (budgets.data === undefined) {
      setError('Still reading this month’s plan. Try again in a moment.');
      return;
    }
    await setBudget
      .mutateAsync({ budgetId: line?.budget_id, categoryId: category.id, month, amountMinor })
      .then(() => setDraft(null))
      .catch((cause) => setError(dataErrorMessage(cause)));
  };

  const save = async () => {
    const text = planText.trim();
    if (text === '') return savePlan(null);
    const parsed = parseMoney(text, currency);
    if (!parsed.ok) return setError(parsed.message);
    return savePlan(parsed.minor);
  };

  return (
    <div className="page">
      <DetailHeader
        back={{ to: budgetMonthPath(month), label: formatMonth(month) }}
        title={`${category.name} · ${formatMonth(month)}`}
        subtitle={
          <>
            {group && `${group} · `}
            <Link to={monthPath(month)}>The month</Link>
            {' · '}
            <Link to={categoryPath(category.id)}>All months for this category</Link>
          </>
        }
        actions={
          <Button variant="secondary" onClick={() => document.getElementById('plan-amount')?.focus()}>
            {line ? 'Edit plan' : 'Set a plan'}
          </Button>
        }
      />

      {error && <Notice tone="err">{error}</Notice>}
      {stats.data && (
        <StandsOut
          currency={currency}
          findings={budgetLineFindings(category.name, current ? paceRow : null, { within, planned, typical_minor: typical })}
        />
      )}

      <section className="group fig-band" aria-label="This budget line">
        <div className="fig-cell">
          <h2 className="caption">{!line ? 'Spent this month' : line.left_minor < 0 ? 'Over plan by' : 'Left to spend'}</h2>
          <p className="fig flush">
            <span className="bracket">
              <Amount minor={line ? Math.abs(line.left_minor) : spent} currency={currency} />
            </span>
          </p>
          {line && (
            <>
              <PaceCapsule spent={spent} planned={line.planned_minor} pace={current ? paceRow?.pace_minor : null} />
              {current && paceRow && paceRow.status !== 'over' && (
                <p className="status-line flush">
                  {paceRow.gap_minor > 0 ? (
                    <>
                      <Gauge strokeWidth={1.75} aria-hidden />
                      <Amount minor={paceRow.gap_minor} currency={currency} /> ahead of pace
                    </>
                  ) : (
                    <>
                      <Check strokeWidth={1.75} aria-hidden />
                      <Amount minor={-paceRow.gap_minor} currency={currency} /> under pace
                    </>
                  )}
                </p>
              )}
            </>
          )}
          <p className="footnote flush">
            {line ? (
              <>
                <Amount minor={spent} currency={currency} /> of <Amount minor={line.planned_minor} currency={currency} />
                {current && paceRow && ` · ${paceRow.days_left === 1 ? '1 day' : `${paceRow.days_left} days`} left`}
              </>
            ) : (
              'No plan yet. Set one below.'
            )}
          </p>
        </div>
        <div className="fig-cell">
          <h2 className="caption">To stay within plan</h2>
          <p className="card-figure flush">
            {current && paceRow && paceRow.per_day_minor !== null && paceRow.status !== 'over' ? (
              <>
                <Amount minor={paceRow.per_day_minor} currency={currency} /> a day
              </>
            ) : (
              '—'
            )}
          </p>
          <p className="footnote flush">
            {!line
              ? 'No plan to stay within'
              : !current
                ? month < thisMonth
                  ? 'The month has ended'
                  : 'The month has not begun'
                : paceRow?.status === 'over'
                  ? 'Nothing left to spend this month'
                  : `for the ${paceRow?.days_left ?? 0} days left`}
          </p>
        </div>
        <div className="fig-cell">
          <h2 className="caption">Within plan</h2>
          <p className="card-figure flush">{planned > 0 ? `${within} of ${planned}` : '—'}</p>
          <p className="footnote flush">{planned > 0 ? 'of the 12 months before, with a plan' : 'No plans in the 12 months before'}</p>
        </div>
        <div className="fig-cell">
          <h2 className="caption">Typical month</h2>
          <p className="card-figure flush">{typical !== null ? <Amount minor={typical} currency={currency} /> : '—'}</p>
          <p className="footnote flush">
            {typical !== null && line ? (
              <>
                <Amount minor={typical - line.planned_minor} currency={currency} signed /> against the plan
              </>
            ) : (
              'Over the 12 complete months before'
            )}
          </p>
        </div>
      </section>

      <div className="report-pair wide-left">
        <div className="stack">
          {daily.data && (
            <RunningTotalChart
              title={current ? `${monthWord} so far` : formatMonth(month)}
              caption={line ? 'Spending added up day by day, against an even path to the plan.' : 'Spending added up day by day.'}
              days={daily.data}
              currency={currency}
              valueLabel="Spent"
              typicalLabel="Typical month"
              showTypical={false}
              plan={line?.planned_minor ?? null}
            />
          )}
        </div>
        <div className="stack">
          <MonthBars
            title="Is the plan realistic?"
            caption={`${formatMonth(before[0]!)} – ${formatMonth(before[before.length - 1]!)}. Hatched: over plan.`}
            rows={series}
            currency={currency}
            currentMonth={thisMonth}
            tone="out"
            valueLabel="Spent"
            planLabel="The plan"
            typical={typical}
            typicalLabel="Typical"
            hatchOverPlan
            linkFor={(m) => `/budgets/${m.slice(0, 7)}/${category.id}`}
          />
          <section className="group stack-tight" aria-labelledby="line-realistic">
            <h2 className="headline" id="line-realistic">
              {suggest !== null ? 'A plan nearer the usual' : 'The plan'}
            </h2>
            <p className="flush">
              {planned > 0 ? `Within plan ${within} of ${planned} months` : 'No plans in the 12 months before'}
              {typical !== null && (
                <>
                  ; typical month <Amount minor={typical} currency={currency} />
                </>
              )}
              .{' '}
              {suggest !== null
                ? `The plan was missed in more than half of those months, so the 12-month average may hold better.`
                : planned >= 3
                  ? 'The plan is about right: no change suggested.'
                  : ''}
            </p>
            {suggest !== null && (
              <div className="actions">
                <Button variant="secondary" busy={setBudget.isPending} onClick={() => void savePlan(suggest)}>
                  Use <Amount minor={suggest} currency={currency} /> for {monthWord}
                </Button>
              </div>
            )}
          </section>
        </div>
      </div>

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
          onChange={(e) => setDraft(e.target.value)}
        />
        <Button type="submit" dimmed={budgets.data === undefined} busy={setBudget.isPending}>
          Save plan
        </Button>
        <p className="footnote flush">Leave it empty to remove the plan. It applies to {formatMonth(month)} only.</p>
      </form>

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
    kind: row.kind,
  }));
  return (
    <ActivityRows
      rows={rows}
      caption="Expenses in this category this month, newest first"
      empty="Nothing spent in this category this month."
    />
  );
}
