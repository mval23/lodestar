import { Link } from 'react-router';
import { useCurrency } from '../../lib/profile';
import { formatDate, formatMonth } from '../../lib/dates';
import { share } from '../../lib/percent';
import { goalPath } from '../../lib/routes';
import { savingsFindings } from '../../lib/standsOut';
import { Amount } from '../../ui/Amount';
import { Notice } from '../../ui/Notice';
import { PaceCapsule } from '../../ui/PaceCapsule';
import { SavingsBars } from '../../ui/SavingsBars';
import { dataErrorMessage } from '../auth/errors';
import { accountTypeLabel, useAccounts, type AccountType } from '../accounts/queries';
import { useGoals, type GoalProgress } from '../goals/queries';
import { rangeLabel } from './filters';
import { useGoalPaces, useReportCashFlow, useReportSummary, type GoalPace } from './queries';
import { ReportClosing, ReportHead, useReportRange } from './ReportParts';

// Savings rate and goals: what went into goal accounts each month and what
// came back out, the rate that leaves of money in, and each goal's progress
// with an estimate only where there is a pace to make one from. Saving is a
// transfer into a goal's account, never a category; every figure is summed
// in Postgres, and the rate is one total over another.

export function SavingsReportPage() {
  const currency = useCurrency();
  const report = useReportRange();
  const { range, compareFrom } = report;
  // Saving moves money between your own accounts, so it is measured across
  // all of them: the accounts filter does not apply here.
  const summary = useReportSummary(range.from, range.to, compareFrom, null);
  const flow = useReportCashFlow(range.from, range.to, null);
  const goals = useGoals();
  const paces = useGoalPaces();
  const accounts = useAccounts();

  const now = summary.data?.current;
  const before = summary.data?.compare;
  const comparable = Boolean(before && before.active_months > 0);
  const net = now ? now.to_goals_minor - now.from_goals_minor : 0;
  const active = (goals.data ?? []).filter((g) => !g.archived_at);
  const balances = active.reduce((sum, g) => sum + g.balance_minor, 0);
  // Each goal's monthly plan, together: what a month "on plan" puts in.
  const plans = active.filter((g) => g.monthly_plan_minor !== null);
  const plan = plans.length > 0 ? plans.reduce((sum, g) => sum + (g.monthly_plan_minor ?? 0), 0) : null;
  const months = (flow.data ?? []).map((m) => ({
    month: m.month,
    in_minor: m.to_goals_minor,
    out_minor: m.from_goals_minor,
    money_in_minor: m.money_in_minor,
  }));
  const onPlan = plan !== null ? months.filter((m) => m.in_minor >= plan).length : null;
  const paceOf = new Map((paces.data ?? []).map((p) => [p.goal_id, p]));
  const accountOf = new Map((accounts.data ?? []).map((a) => [a.account_id, a]));
  const error = summary.error ?? flow.error ?? goals.error;

  return (
    <div className="page">
      <ReportHead
        back={report.search}
        title="Savings rate and goals"
        showScope={false}
        subtitle={`${rangeLabel(range)} · complete months${comparable ? ` · compared with ${rangeLabel({ from: before!.period_from, to: before!.period_to })}` : ''}`}
      />

      {error && <Notice tone="err">{dataErrorMessage(error)}</Notice>}
      {!report.ready && <p className="secondary">Working out your figures…</p>}
      {report.ready && report.nothingYet && <p className="secondary">There are no complete months to report yet.</p>}

      {now && flow.data && !report.nothingYet && (
        <>
          <section className="group fig-band fig-band-5" aria-label="This period">
            <div className="fig-cell">
              <h2 className="caption">Saved into goals</h2>
              <p className="fig flush">
                <span className="bracket">
                  <Amount minor={net} currency={currency} signed={net < 0} />
                </span>
              </p>
              <p className="footnote flush">
                <Amount minor={now.to_goals_minor} currency={currency} /> in · <Amount minor={now.from_goals_minor} currency={currency} /> taken out
              </p>
            </div>
            <div className="fig-cell">
              <h2 className="caption">Savings rate</h2>
              <p className="card-figure flush">{share(net, now.money_in_minor)}</p>
              <p className="footnote flush">
                of money in
                {comparable && ` · ${share(before!.to_goals_minor - before!.from_goals_minor, before!.money_in_minor)} the period before`}
              </p>
            </div>
            <div className="fig-cell">
              <h2 className="caption">Kept from income</h2>
              <p className="card-figure flush">{share(now.net_minor, now.money_in_minor)}</p>
              <p className="footnote flush">Money in less money out, of money in</p>
            </div>
            <div className="fig-cell">
              <h2 className="caption">Goal balances</h2>
              <p className="card-figure flush">
                <Amount minor={balances} currency={currency} />
              </p>
              <p className="footnote flush">
                {active.length} {active.length === 1 ? 'goal' : 'goals'}, one account each
              </p>
            </div>
            <div className="fig-cell">
              <h2 className="caption">Months on plan</h2>
              <p className="card-figure flush">{onPlan !== null ? `${onPlan} of ${months.length}` : '—'}</p>
              <p className="footnote flush">
                {plan !== null ? (
                  <>
                    <Amount minor={plan} currency={currency} /> a month, as planned
                  </>
                ) : (
                  'No goal has a monthly plan'
                )}
              </p>
            </div>
          </section>

          <div className="report-pair wide-left">
            <SavingsBars
              title="Put into goals each month"
              caption="Above zero: transfers into goal accounts. Below: money taken back out. Over each bar: that month’s savings rate."
              months={months}
              plan={plan}
              currency={currency}
            />
            <section className="group stack-tight" aria-labelledby="savings-goals">
              <div>
                <h2 className="headline" id="savings-goals">
                  Goal progress
                </h2>
                <p className="footnote flush">Balances as of today</p>
              </div>
              {active.length === 0 ? (
                <p className="secondary flush">
                  No goals yet. <Link to="/goals">Add a goal</Link>
                </p>
              ) : (
                <ul className="savings-goals">
                  {active.map((goal) => (
                    <GoalLine
                      key={goal.goal_id}
                      goal={goal}
                      pace={paceOf.get(goal.goal_id)}
                      kind={accountOf.get(goal.account_id)?.type as AccountType | undefined}
                    />
                  ))}
                </ul>
              )}
            </section>
          </div>

          <ReportClosing
            currency={currency}
            findings={savingsFindings(now.to_goals_minor, now.from_goals_minor, now.money_in_minor, onPlan !== null ? { on: onPlan, of: months.length } : null)}
            about={[
              'Saving is a transfer into a goal’s account, never a category.',
              'Estimates use the last 6 months’ pace, need 3 or more months with money put in, and assume nothing is taken out.',
              'An investment account moves only by transfers; market gains are not recorded.',
            ]}
          />
        </>
      )}
    </div>
  );
}

function GoalLine({ goal, pace, kind }: { goal: GoalProgress; pace: GoalPace | undefined; kind: AccountType | undefined }) {
  const currency = useCurrency();
  const target = goal.target_minor;
  const remaining = target !== null ? Math.max(0, target - goal.balance_minor) : null;
  return (
    <li>
      <div className="savings-goal-head">
        <span>
          <Link to={goalPath(goal.goal_id)}>{goal.name}</Link>
          {kind && <small> {accountTypeLabel(kind).toLowerCase()} account</small>}
        </span>
        <span className="num">
          <strong>
            <Amount minor={goal.balance_minor} currency={currency} />
          </strong>
          {target !== null && (
            <span className="secondary">
              {' of '}
              <Amount minor={target} currency={currency} />
            </span>
          )}
        </span>
      </div>
      {target !== null ? (
        <PaceCapsule spent={goal.balance_minor} planned={target} tone="save" />
      ) : (
        <div className="savings-no-target" aria-hidden="true" />
      )}
      {target !== null && remaining !== null && remaining > 0 && pace?.estimated_month && (
        <p className="footnote flush">
          <span className="estimate-tag">Estimate</span> Reached around <strong>{formatMonth(pace.estimated_month)}</strong> at{' '}
          <Amount minor={pace.avg_put_in_minor} currency={currency} /> a month
        </p>
      )}
      <p className="footnote flush">
        {target === null ? (
          <>
            No target set, so no completion date
            {pace && pace.avg_put_in_minor > 0 && (
              <>
                {' · '}
                <Amount minor={pace.avg_put_in_minor} currency={currency} /> a month recently
              </>
            )}
          </>
        ) : remaining === 0 ? (
          'Target reached'
        ) : (
          <>
            <Amount minor={remaining ?? 0} currency={currency} /> to go ·{' '}
            {goal.target_date ? `target date ${formatDate(goal.target_date)}` : 'no target date'}
            {pace && !pace.estimated_month && ' · too few months with money put in for an estimate'}
          </>
        )}
      </p>
    </li>
  );
}
