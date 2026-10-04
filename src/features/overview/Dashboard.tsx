import { Link } from 'react-router';
import { Check, CircleAlert, Gauge } from 'lucide-react';
import { describeMoney, type Currency } from '../../lib/money';
import { addMonths, formatDateShort, formatMonth } from '../../lib/dates';
import { budgetLinePath, budgetMonthPath, goalPath, monthPath, monthRange } from '../../lib/routes';
import { overviewFindings } from '../../lib/standsOut';
import { Amount } from '../../ui/Amount';
import { Comparison } from '../../ui/Comparison';
import { PaceCapsule } from '../../ui/PaceCapsule';
import { Sparkline } from '../../ui/Sparkline';
import { Notice } from '../../ui/Notice';
import { StandsOut } from '../../ui/StandsOut';
import { dataErrorMessage } from '../auth/errors';
import { netWorthOf, type AccountBalance } from '../accounts/queries';
import { useGoals } from '../goals/queries';
import { useNetWorth } from '../reports/queries';
import { TitleLink } from './TitleLink';
import { byNeed, useAccountClosings, useBudgetPace, useMonthToDate, type BudgetPace } from './queries';

// The Overview's parts, shared by the wide layout and the phone's. Each one
// puts a figure in context: against the plan, against a typical month, or
// against last month's end. Every sum comes from the database; adding up a
// few already-summed balances or lines for a subtotal is the most done here.

const monthShort = (month: string) => formatMonth(month).slice(0, 3);
const lastDayOf = (month: string) => monthRange(month).to;

// ---------------------------------------------------------------------------
// What stands out: a sentence or two, only when something is unusual.
// ---------------------------------------------------------------------------
export function OverviewStandsOut({ month, currency }: { month: string; currency: Currency }) {
  const pace = useBudgetPace(month);
  const soFar = useMonthToDate(month);
  // The month's figures failed to load: said once, here, above them.
  const error = pace.error ?? soFar.error;
  if (error) return <Notice tone="err">{dataErrorMessage(error)}</Notice>;
  if (!pace.data || soFar.data === undefined) return null;
  return <StandsOut findings={overviewFindings(pace.data, soFar.data, monthShort(month))} currency={currency} />;
}

function PaceStatus({ row, currency }: { row: Pick<BudgetPace, 'status' | 'spent_minor' | 'planned_minor' | 'gap_minor'>; currency: Currency }) {
  if (row.status === 'over') {
    return (
      <span className="status-line status-strong">
        <CircleAlert strokeWidth={1.75} aria-hidden />
        Over plan by <Amount minor={row.spent_minor - row.planned_minor} currency={currency} />
      </span>
    );
  }
  if (row.status === 'ahead') {
    return (
      <span className="status-line status-strong">
        <Gauge strokeWidth={1.75} aria-hidden />
        <Amount minor={row.gap_minor} currency={currency} /> ahead of pace
      </span>
    );
  }
  return (
    <span className="status-line">
      <Check strokeWidth={1.75} aria-hidden />
      {row.gap_minor < 0 ? (
        <>
          <Amount minor={-row.gap_minor} currency={currency} /> under pace
        </>
      ) : (
        'On pace'
      )}
    </span>
  );
}

// ---------------------------------------------------------------------------
// This month: left to spend (the page's one bracket), the month so far
// against a typical month, what went into goals, and net worth.
// ---------------------------------------------------------------------------
export function ThisMonthBand({ accounts, month, currency }: { accounts: AccountBalance[]; month: string; currency: Currency }) {
  const pace = useBudgetPace(month);
  const soFar = useMonthToDate(month);
  const goals = useGoals();
  const netWorth = useNetWorth(12);

  const lines = pace.data ?? [];
  const planned = lines.reduce((sum, l) => sum + l.planned_minor, 0);
  const spent = lines.reduce((sum, l) => sum + l.spent_minor, 0);
  const onPace = lines.reduce((sum, l) => sum + l.pace_minor, 0);
  const over = spent > planned;
  const total = { status: over ? 'over' : spent > onPace ? 'ahead' : 'on_pace', spent_minor: spent, planned_minor: planned, gap_minor: spent - onPace } as const;
  const daysLeft = lines[0]?.days_left ?? null;

  const mtd = soFar.data ?? null;
  // A no-break space and a word joiner keep "Oct 1–24" on one line.
  const against = mtd ? `vs a typical ${monthShort(month)}\u00a01–\u2060${mtd.day_of_month}` : '';
  const comparable = mtd !== null && mtd.typical_months > 0;

  const plans = (goals.data ?? []).filter((g) => !g.archived_at).reduce((sum, g) => sum + (g.monthly_plan_minor ?? 0), 0);

  const worth = netWorthOf(accounts);
  const points = (netWorth.data ?? []).map((row) => row.net_worth_minor);
  const lastMonth = (netWorth.data ?? []).find((row) => row.month === addMonths(month, -1));

  return (
    <section className="group fig-band fig-band-5" aria-label="This month">
      <div className="fig-cell">
        <h2 className="caption">
          <TitleLink to={budgetMonthPath(month)}>{`${over ? 'Over plan by' : 'Left to spend'} · ${formatMonth(month).split(' ')[0]}`}</TitleLink>
        </h2>
        {pace.isError ? (
          <p className="footnote flush">Not available</p>
        ) : pace.isPending ? (
          <p className="footnote flush">Loading…</p>
        ) : lines.length === 0 ? (
          <p className="footnote flush">
            <span>No plan for this month yet.</span> <Link to={budgetMonthPath(month)}>Plan this month</Link>
          </p>
        ) : (
          <>
            <p className="fig flush">
              <span className="bracket">
                <Amount minor={Math.abs(planned - spent)} currency={currency} />
              </span>
            </p>
            <PaceCapsule spent={spent} planned={planned} pace={onPace} />
            <PaceStatus row={total} currency={currency} />
            <p className="footnote flush">
              <Amount minor={spent} currency={currency} /> of <Amount minor={planned} currency={currency} />
              {daysLeft !== null && ` · ${daysLeft <= 0 ? 'last day of the month' : daysLeft === 1 ? '1 day left' : `${daysLeft} days left`}`}
            </p>
          </>
        )}
      </div>

      <div className="fig-cell">
        <h2 className="caption">
          <TitleLink to={monthPath(month)}>Money in so far</TitleLink>
        </h2>
        {soFar.isError ? (
          <p className="footnote flush">Not available</p>
        ) : soFar.isPending ? (
          <p className="footnote flush">Loading…</p>
        ) : (
          <>
            <p className="card-figure flush">
              <Amount minor={mtd?.money_in_minor ?? 0} currency={currency} />
            </p>
            <p className="footnote flush">
              {comparable ? (
                <Comparison delta={mtd.money_in_minor - mtd.typical_in_minor} currency={currency} against={against} />
              ) : (
                'No earlier months to compare yet'
              )}
            </p>
          </>
        )}
      </div>

      <div className="fig-cell">
        <h2 className="caption">
          <TitleLink to={monthPath(month)}>Money out so far</TitleLink>
        </h2>
        {soFar.isError ? (
          <p className="footnote flush">Not available</p>
        ) : soFar.isPending ? (
          <p className="footnote flush">Loading…</p>
        ) : (
          <>
            <p className="card-figure flush">
              <Amount minor={mtd?.money_out_minor ?? 0} currency={currency} />
            </p>
            <p className="footnote flush">
              {comparable ? (
                <Comparison delta={mtd.money_out_minor - mtd.typical_out_minor} currency={currency} against={against} />
              ) : (
                'No earlier months to compare yet'
              )}
            </p>
          </>
        )}
      </div>

      <div className="fig-cell">
        <h2 className="caption">
          <TitleLink to="/goals">Into goals this month</TitleLink>
        </h2>
        {soFar.isError ? (
          <p className="footnote flush">Not available</p>
        ) : soFar.isPending ? (
          <p className="footnote flush">Loading…</p>
        ) : (
          <>
            <p className="card-figure flush">
              <Amount minor={mtd?.to_goals_minor ?? 0} currency={currency} />
            </p>
            <p className="footnote flush">
              {plans === 0 ? (
                'No monthly plans set'
              ) : (mtd?.to_goals_minor ?? 0) >= plans ? (
                <>
                  On plan: <Amount minor={plans} currency={currency} /> a month
                </>
              ) : (
                <>
                  <Amount minor={plans - (mtd?.to_goals_minor ?? 0)} currency={currency} /> to go of{' '}
                  <Amount minor={plans} currency={currency} /> planned
                </>
              )}
            </p>
          </>
        )}
      </div>

      <div className="fig-cell">
        <h2 className="caption">Net worth</h2>
        <p className="card-figure flush">
          <Amount minor={worth.net} currency={currency} />
        </p>
        {points.length >= 2 && (
          <Sparkline
            values={points}
            label={`Net worth over the last ${points.length} months, from ${describeMoney(points[0]!, currency)} to ${describeMoney(points[points.length - 1]!, currency)}.`}
            small
          />
        )}
        <p className="footnote flush">
          {lastMonth && (
            <>
              <Comparison
                delta={worth.net - lastMonth.net_worth_minor}
                currency={currency}
                against={`since ${formatDateShort(lastDayOf(lastMonth.month))}`}
              />
              {' · '}
            </>
          )}
          <Link to="/reports">Reports</Link>
        </p>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Budgets: every line planned this month, over plan first, then ahead of
// pace, then the rest by share of the plan used.
// ---------------------------------------------------------------------------
export function BudgetsGroup({ month, currency, columns = false }: { month: string; currency: Currency; columns?: boolean }) {
  const pace = useBudgetPace(month);
  const rows = [...(pace.data ?? [])].sort(byNeed);

  return (
    <section className="group wide-group" aria-labelledby="overview-needs">
      <div className="wide-head">
        <h2 className="headline" id="overview-needs">
          Budgets
        </h2>
        <Link className="footnote" to={budgetMonthPath(month)}>
          {formatMonth(month).split(' ')[0]}
        </Link>
      </div>
      {pace.isError ? (
        <p className="footnote wide-empty">Not available</p>
      ) : pace.isPending ? (
        <p className="footnote wide-empty">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="footnote wide-empty">
          Plan an amount for the categories you want to keep an eye on, and they show here.{' '}
          <Link to={budgetMonthPath(month)}>Plan this month</Link>
        </p>
      ) : (
        <>
          {/* A long list reads two across, still in order of need, row by row. */}
          <div className={columns ? 'need-columns' : 'need-list'}>
            {rows.map((row) => (
              <Link key={row.category_id} className="need-row" to={budgetLinePath(month, row.category_id)}>
                <span className="need-top">
                  <span className="need-name">{row.category_name}</span>
                  <span className="num">
                    <Amount minor={row.spent_minor} currency={currency} />{' '}
                    <span className="secondary">
                      of <Amount minor={row.planned_minor} currency={currency} />
                    </span>
                  </span>
                </span>
                <PaceCapsule spent={row.spent_minor} planned={row.planned_minor} pace={row.pace_minor} />
                <span className="need-foot">
                  <PaceStatus row={row} currency={currency} />
                  {row.status !== 'over' && (
                    <span className="footnote num">
                      <Amount minor={row.planned_minor - row.spent_minor} currency={currency} /> left
                    </span>
                  )}
                </span>
              </Link>
            ))}
          </div>
          <p className="caption need-note">
            Blue tick: where spending would be today, with bills on their due dates and the rest spread evenly.
          </p>
        </>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Where you stand: cash, savings, and cards and loans, each with its total,
// a line over the last 12 month ends, and the change since last month's end.
// ---------------------------------------------------------------------------
const GROUPS: { title: string; types: AccountBalance['type'][]; debt?: boolean }[] = [
  { title: 'Cash', types: ['checking', 'cash'] },
  { title: 'Savings', types: ['savings', 'investment', 'other_asset'] },
  { title: 'Cards and loans', types: ['credit_card', 'loan'], debt: true },
];

function namesOf(rows: AccountBalance[]): string {
  const names = rows.map((r) => r.name);
  return names.length <= 2 ? names.join(', ') : `${names.slice(0, 2).join(', ')} and ${names.length - 2} more`;
}

export function WhereYouStand({ accounts, month, currency }: { accounts: AccountBalance[]; month: string; currency: Currency }) {
  const closings = useAccountClosings(month);
  const open = accounts.filter((a) => !a.archived_at);
  // The subtotals add up to net worth, so an account left out of it is named
  // under them instead of counted in them.
  const counted = open.filter((a) => a.include_in_net_worth);
  const leftOut = open.filter((a) => !a.include_in_net_worth);
  const previous = addMonths(month, -1);
  const since = formatDateShort(lastDayOf(previous));
  const months = Array.from({ length: 12 }, (_, i) => addMonths(month, i - 11));

  const groups = GROUPS.map((group) => {
    const rows = counted.filter((a) => group.types.includes(a.type));
    const ids = new Set(rows.map((r) => r.account_id));
    // Already-summed month-end balances of a few accounts, added for a subtotal.
    const closingIn = (m: string) =>
      (closings.data ?? []).filter((c) => c.month === m && ids.has(c.account_id)).reduce((sum, c) => sum + c.closing_balance_minor, 0);
    const now = rows.reduce((sum, r) => sum + r.balance_minor, 0);
    const series = months.filter((m) => (closings.data ?? []).some((c) => c.month === m && ids.has(c.account_id))).map(closingIn);
    const hadPrevious = (closings.data ?? []).some((c) => c.month === previous && ids.has(c.account_id));
    return { ...group, rows, now, series, change: hadPrevious ? now - closingIn(previous) : null };
  }).filter((group) => group.rows.length > 0);

  if (groups.length === 0 && leftOut.length === 0) return null;

  return (
    <section className="group wide-group" aria-labelledby="overview-stand">
      <div className="wide-head">
        <h2 className="headline" id="overview-stand">
          Where you stand
        </h2>
        <Link className="footnote" to="/accounts">
          {open.length > 1 ? `All ${open.length} accounts` : 'Accounts'}
        </Link>
      </div>
      {groups.map((group) => (
        <Link key={group.title} className="stand-row" to="/accounts">
          <span className="stand-name">
            <span className="need-name">{group.title}</span>
            <small>{namesOf(group.rows)}</small>
          </span>
          {group.series.length >= 2 ? (
            <Sparkline
              tiny
              values={group.series}
              label={`${group.title} at each month end, from ${describeMoney(group.series[0]!, currency)} to ${describeMoney(group.series[group.series.length - 1]!, currency)}.`}
            />
          ) : (
            <span />
          )}
          <span className="stand-amount">
            <Amount minor={group.now} currency={currency} className="need-name" />
            {group.change !== null && (
              <small>
                {group.debt ? (
                  group.change === 0 ? (
                    `Same as ${since}`
                  ) : (
                    <>
                      <Amount minor={Math.abs(group.change)} currency={currency} /> {group.change > 0 ? 'less' : 'more'} owed
                      than {since}
                    </>
                  )
                ) : (
                  <Comparison delta={group.change} currency={currency} against={`since ${since}`} />
                )}
              </small>
            )}
          </span>
        </Link>
      ))}
      {leftOut.length > 0 && (
        <p className="caption need-note">
          Not in net worth: {leftOut.map((a) => a.name).join(', ')} (
          <Amount minor={leftOut.reduce((sum, a) => sum + a.balance_minor, 0)} currency={currency} />)
        </p>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Goals: progress, and where this month stands against each monthly plan.
// ---------------------------------------------------------------------------
const GOALS_SHOWN = 4;

export function GoalsGroup({ currency }: { currency: Currency }) {
  const goals = useGoals();
  const rows = (goals.data ?? []).filter((goal) => !goal.archived_at);
  if (goals.isPending || rows.length === 0) return null;

  return (
    <section className="group wide-group" aria-labelledby="overview-goals">
      <div className="wide-head">
        <h2 className="headline" id="overview-goals">
          Goals
        </h2>
        <Link className="footnote" to="/goals">
          All goals
        </Link>
      </div>
      {rows.slice(0, GOALS_SHOWN).map((goal) => {
        const target = goal.target_minor;
        const plan = goal.monthly_plan_minor;
        const put = goal.this_month_contributed_minor;
        return (
          <Link key={goal.goal_id} className="need-row" to={goalPath(goal.goal_id)}>
            <span className="need-top">
              <span className="need-name">{goal.name}</span>
              <span className="num">
                <Amount minor={goal.balance_minor} currency={currency} />
                {target !== null && (
                  <span className="secondary">
                    {' '}
                    of <Amount minor={target} currency={currency} />
                  </span>
                )}
              </span>
            </span>
            {target !== null ? (
              <PaceCapsule spent={goal.balance_minor} planned={target} tone="save" />
            ) : (
              <span className="prog prog-none" role="presentation" />
            )}
            <span className="need-foot">
              <span className="status-line">
                {plan === null || plan === 0 ? (
                  'No monthly plan'
                ) : put >= plan ? (
                  <>
                    <Check strokeWidth={1.75} aria-hidden />
                    On plan · <Amount minor={put} currency={currency} /> put in
                  </>
                ) : (
                  <>
                    <Amount minor={plan - put} currency={currency} /> to go this month
                  </>
                )}
              </span>
              <span className="footnote num">
                {target === null
                  ? 'No target'
                  : goal.balance_minor >= target
                    ? 'Target reached'
                    : `${Math.round((goal.balance_minor / target) * 100)}%`}
              </span>
            </span>
          </Link>
        );
      })}
    </section>
  );
}
