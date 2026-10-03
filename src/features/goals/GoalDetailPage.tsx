import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useCurrency, useProfile } from '../../lib/profile';
import { addMonths, formatDate, formatMonth, monthStartInZone } from '../../lib/dates';
import { accountPath, isUuid } from '../../lib/routes';
import { goalFindings } from '../../lib/standsOut';
import { Amount } from '../../ui/Amount';
import { Button } from '../../ui/Button';
import { DetailHeader, DetailNotFound, SectionHead } from '../../ui/Detail';
import { MonthLine } from '../../ui/MonthChart';
import { Notice } from '../../ui/Notice';
import { PaceCapsule } from '../../ui/PaceCapsule';
import { SavingsBars } from '../../ui/SavingsBars';
import { StandsOut } from '../../ui/StandsOut';
import { dataErrorMessage } from '../auth/errors';
import { accountTypeLabel, useAccountLedger, useAccounts } from '../accounts/queries';
import { ActivityRows, type ActivityRow } from '../transactions/DetailActivity';
import { TransactionSheet } from '../transactions/TransactionSheet';
import { GoalSheet } from './GoalSheet';
import { useGoal, useGoalMonths, useGoalPace, type GoalProgress } from './queries';

// A goal is its fund account with an intention attached. Everything here is
// that account's history, read against the target.
export function GoalDetailPage() {
  const { id } = useParams();
  const valid = isUuid(id);
  const goal = useGoal(valid ? id : undefined);
  const back = { to: '/goals', label: 'Goals' };

  if (!valid || (goal.isSuccess && !goal.data)) return <DetailNotFound what="goal" back={back} />;
  if (goal.isError)
    return (
      <div className="page">
        <Notice tone="err">{dataErrorMessage(goal.error)}</Notice>
      </div>
    );
  if (!goal.data)
    return (
      <div className="page">
        <p className="secondary">Loading the goal…</p>
      </div>
    );
  return <GoalDetail goal={goal.data} />;
}

function GoalDetail({ goal }: { goal: GoalProgress }) {
  const currency = useCurrency();
  const profile = useProfile();
  const thisMonth = monthStartInZone(profile.data?.timezone);
  const months = useGoalMonths(goal.goal_id);
  const pace = useGoalPace(goal.goal_id);
  const accounts = useAccounts();
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);

  const fund = (accounts.data ?? []).find((a) => a.account_id === goal.account_id);
  const history = months.data ?? [];
  const p = pace.data ?? null;
  const target = goal.target_minor;
  const remaining = target !== null ? Math.max(0, target - goal.balance_minor) : null;
  const share = target && target > 0 ? Math.min(100, Math.round((goal.balance_minor / target) * 100)) : 0;
  const targetMonth = goal.target_date ? `${goal.target_date.slice(0, 7)}-01` : null;
  // What the projection moves at: the plan when there is one, else the pace.
  const perMonth = goal.monthly_plan_minor ?? p?.avg_put_in_minor ?? 0;
  // A projection needs a target, money still to go, and 3 months of pace.
  const projects = target !== null && remaining !== null && remaining > 0 && (p?.months_put_in ?? 0) >= 3 && perMonth > 0;
  const ahead = projects ? projection(goal.balance_minor, target!, perMonth, thisMonth, targetMonth) : [];
  const monthsToTarget = targetMonth ? monthsBetweenStarts(thisMonth, targetMonth) : null;

  return (
    <div className="page">
      <DetailHeader
        back={{ to: '/goals', label: 'Goals' }}
        title={goal.name}
        subtitle={
          <>
            Goal · <Link to={accountPath(goal.account_id)}>{fund?.name ?? 'its account'}</Link>
            {fund && ` (${accountTypeLabel(fund.type).toLowerCase()} account)`}
            {goal.achieved_at && ` · Reached ${formatDate(goal.achieved_at.slice(0, 10))}`}
            {goal.archived_at && ` · Archived ${formatDate(goal.archived_at.slice(0, 10))}`}
          </>
        }
        actions={
          <>
            <Button variant="secondary" onClick={() => setEditing(true)}>
              Edit
            </Button>
            <Button onClick={() => setAdding(true)}>Add money</Button>
          </>
        }
      />

      {pace.isError && <Notice tone="err">{dataErrorMessage(pace.error)}</Notice>}
      {p && (
        <StandsOut
          currency={currency}
          findings={goalFindings(goal.name, p, targetMonth, {
            estimate: p.estimated_month ? formatMonth(p.estimated_month) : null,
            target: goal.target_date ? formatDate(goal.target_date) : null,
          })}
        />
      )}

      <section className="group fig-band" aria-label="This goal">
        <div className="fig-cell">
          <h2 className="caption">Saved so far</h2>
          <p className="fig flush">
            <span className="bracket">
              <Amount minor={goal.balance_minor} currency={currency} />
            </span>
          </p>
          {target !== null ? <PaceCapsule spent={goal.balance_minor} planned={target} tone="save" /> : <div className="savings-no-target" aria-hidden="true" />}
          <p className="footnote flush">
            {target === null ? (
              'No target: a fund that grows with every transfer in'
            ) : remaining === 0 ? (
              <>
                Target <Amount minor={target} currency={currency} /> reached
              </>
            ) : (
              <>
                of <Amount minor={target} currency={currency} /> · <Amount minor={remaining ?? 0} currency={currency} /> to go ({share}%)
              </>
            )}
          </p>
        </div>
        <div className="fig-cell">
          <h2 className="caption">Needed to arrive on time</h2>
          <p className="card-figure flush">
            {p?.needed_monthly_minor !== null && p?.needed_monthly_minor !== undefined && remaining ? (
              <>
                <Amount minor={p.needed_monthly_minor} currency={currency} /> a month
              </>
            ) : (
              '—'
            )}
          </p>
          <p className="footnote flush">
            {!goal.target_date || target === null
              ? 'No target date'
              : remaining === 0
                ? 'Already there'
                : monthsToTarget !== null && monthsToTarget > 0
                  ? `${formatMonth(thisMonth).slice(0, 3)} ${thisMonth.slice(0, 4)} – ${formatMonth(targetMonth!)}, ${monthsToTarget} ${monthsToTarget === 1 ? 'month' : 'months'}`
                  : 'The target date has passed'}
          </p>
        </div>
        <div className="fig-cell">
          <h2 className="caption">Plan and recent pace</h2>
          <p className="card-figure flush">
            {goal.monthly_plan_minor !== null ? (
              <>
                <Amount minor={goal.monthly_plan_minor} currency={currency} /> a month
              </>
            ) : (
              'No plan'
            )}
          </p>
          <p className="footnote flush">
            {p ? (
              <>
                <Amount minor={p.avg_put_in_minor} currency={currency} /> a month over the last 6 · put in {p.months_put_in} of them
              </>
            ) : (
              'Working out the pace…'
            )}
          </p>
        </div>
        <div className="fig-cell">
          <h2 className="caption">Reached around</h2>
          <p className="card-figure flush">{p?.estimated_month ? formatMonth(p.estimated_month) : '—'}</p>
          <p className="footnote flush">
            {p?.estimated_month ? (
              <>
                <span className="estimate-tag">Estimate</span> at the last 6 months’ pace
              </>
            ) : target === null ? (
              'No target, so no date'
            ) : remaining === 0 ? (
              'Already there'
            ) : (
              'Needs 3 months with money put in for an estimate'
            )}
          </p>
        </div>
      </section>

      {months.isError && <Notice tone="err">{dataErrorMessage(months.error)}</Notice>}
      {history.length > 0 && (
        <div className="report-pair wide-left">
          <MonthLine
            title={ahead.length > 0 ? 'Where it is, and where the plan takes it' : 'Saved at each month end'}
            caption={
              ahead.length > 0
                ? `Balance at each month end, then ${goal.monthly_plan_minor !== null ? 'the plan' : 'the recent pace'} ahead. Withdrawals aren’t projected.`
                : target === null
                  ? 'Balance at each month end. No target, so no projection.'
                  : 'Balance at each month end. A projection needs 3 months with money put in.'
            }
            rows={history.map((m) => ({ month: m.month, value: m.closing_balance_minor }))}
            ahead={ahead}
            target={target}
            currency={currency}
            currentMonth={thisMonth}
            valueLabel="Balance"
            aheadLabel={goal.monthly_plan_minor !== null ? 'At the plan' : 'At the recent pace'}
            mark={targetMonth && ahead.some((a) => a.month >= targetMonth) ? { month: targetMonth, label: 'Target date' } : null}
          />
          <SavingsBars
            title="Put in and taken out"
            caption="Each month. Withdrawals stay visible, not netted away."
            months={history.map((m) => ({ month: m.month, in_minor: m.put_in_minor, out_minor: m.taken_out_minor, money_in_minor: 0 }))}
            plan={goal.monthly_plan_minor}
            currency={currency}
            showRate={false}
            inLabel="Put in"
          />
        </div>
      )}

      <section className="stack" aria-labelledby="goal-moves">
        <SectionHead id="goal-moves" title="Money moved in and out" />
        <div className="kind-panel">
          <Moves accountId={goal.account_id} />
        </div>
      </section>

      {editing && <GoalSheet goal={goal} onClose={() => setEditing(false)} />}
      {adding && (
        <TransactionSheet
          defaultKind="transfer"
          defaultToAccountId={goal.account_id}
          defaultDescription={goal.name}
          onClose={() => setAdding(false)}
        />
      )}
    </div>
  );
}

function monthsBetweenStarts(from: string, to: string): number {
  const [fy, fm] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  return ((ty ?? 0) - (fy ?? 0)) * 12 + ((tm ?? 0) - (fm ?? 0));
}

// The balance ahead at a steady amount a month, from this month to the target
// (and on to the target date when that is later, held at the target), at
// most three years out. A drawing aid: the estimated month itself comes from
// Postgres.
function projection(balance: number, target: number, perMonth: number, thisMonth: string, targetMonth: string | null) {
  const points: { month: string; value: number }[] = [];
  let value = balance;
  for (let i = 1; i <= 36; i += 1) {
    const month = addMonths(thisMonth, i);
    value = Math.min(target, value + perMonth);
    points.push({ month, value });
    if (value >= target && (!targetMonth || month >= targetMonth)) break;
  }
  return points;
}

function Moves({ accountId }: { accountId: string }) {
  const ledger = useAccountLedger(accountId, 'transfer');
  const accounts = useAccounts();
  const names = useMemo(() => new Map((accounts.data ?? []).map((a) => [a.account_id, a.name])), [accounts.data]);
  if (ledger.isError) return <Notice tone="err">{dataErrorMessage(ledger.error)}</Notice>;
  if (!ledger.data) return <p className="activity-empty secondary">Loading…</p>;
  const rows: ActivityRow[] = ledger.data.rows.map((row) => {
    const incoming = row.signed_amount_minor > 0;
    const other = names.get((incoming ? row.from_account_id : row.to_account_id) ?? '') ?? 'another account';
    return {
      id: row.transaction_id,
      occurred_on: row.occurred_on,
      description: row.description,
      detail: incoming ? `From ${other}` : `Taken out to ${other}`,
      amount: row.signed_amount_minor,
      signed: incoming,
      balance: row.balance_after_minor,
      kind: row.kind,
      };
  });
  return (
    <ActivityRows
      rows={rows}
      showBalance
      caption="Transfers into and out of the fund, newest first, with the balance after each"
      empty="Nothing has moved into this goal yet. Add money to start."
    />
  );
}
