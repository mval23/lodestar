import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useCurrency, useProfile } from '../../lib/profile';
import { addMonths, formatDate, formatMonth, monthStartInZone } from '../../lib/dates';
import { accountPath, isUuid } from '../../lib/routes';
import { Amount } from '../../ui/Amount';
import { Button } from '../../ui/Button';
import { DetailHeader, DetailNotFound, Facet, Facets, FigureRow, KeyFigure, SectionHead } from '../../ui/Detail';
import { MonthLine } from '../../ui/MonthChart';
import { Notice } from '../../ui/Notice';
import { dataErrorMessage } from '../auth/errors';
import { useAccountLedger, useAccountMonths, useAccounts } from '../accounts/queries';
import { ActivityRows, type ActivityRow } from '../transactions/DetailActivity';
import { TransactionSheet } from '../transactions/TransactionSheet';
import { GoalSheet } from './GoalSheet';
import { paceOf, standingOf, useGoal, type GoalProgress } from './queries';

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
  const months = useAccountMonths(goal.account_id, 12);
  const accounts = useAccounts();
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);

  const fund = (accounts.data ?? []).find((a) => a.account_id === goal.account_id);
  const history = useMemo(() => months.data ?? [], [months.data]);
  const standing = standingOf(goal, thisMonth);
  // The last six complete months: the current one is always partial.
  const recent = history.filter((m) => m.month < thisMonth).slice(-6);
  const pace = paceOf(goal, recent.map((m) => m.transfer_in_minor), thisMonth);

  // Where the plan leads: to the target by its date when there is one,
  // otherwise six months ahead at the monthly plan.
  function planAhead() {
    const perMonth =
      standing.neededPerMonth !== null && standing.monthsLeft !== null && standing.monthsLeft > 0
        ? standing.neededPerMonth
        : goal.monthly_plan_minor;
    if (!perMonth || standing.reached) return [];
    const steps =
      standing.monthsLeft !== null && standing.monthsLeft > 0 ? Math.min(standing.monthsLeft, 24) : 6;
    return Array.from({ length: steps }, (_, i) => {
      const value = goal.balance_minor + perMonth * (i + 1);
      return {
        month: addMonths(thisMonth, i + 1),
        value: goal.target_minor !== null ? Math.min(value, goal.target_minor) : value,
      };
    });
  }
  const ahead = planAhead();

  return (
    <div className="page">
      <DetailHeader
        back={{ to: '/goals', label: 'Goals' }}
        title={goal.name}
        subtitle={
          <>
            Funded by <Link to={accountPath(goal.account_id)}>{fund?.name ?? 'its account'}</Link>
            {goal.target_date && ` · Target by ${formatMonth(goal.target_date)}`}
            {goal.achieved_at && ` · Reached ${formatDate(goal.achieved_at.slice(0, 10))}`}
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

      <FigureRow>
        <KeyFigure
          label="Saved so far"
          footnote={
            goal.target_minor === null ? (
              'No target: this goal is a fund, growing with every transfer in.'
            ) : standing.reached ? (
              <>
                Target <Amount minor={goal.target_minor} currency={currency} /> reached.
              </>
            ) : (
              <>
                Target <Amount minor={goal.target_minor} currency={currency} /> ·{' '}
                <Amount minor={goal.target_minor - goal.balance_minor} currency={currency} /> to go
              </>
            )
          }
        >
          <Amount minor={goal.balance_minor} currency={currency} />
        </KeyFigure>
        <Facets label="Contributions">
          <Facet
            label="This month"
            note={
              goal.monthly_plan_minor !== null ? (
                <>
                  of a <Amount minor={goal.monthly_plan_minor} currency={currency} /> plan
                </>
              ) : undefined
            }
          >
            <Amount minor={goal.this_month_contributed_minor} currency={currency} />
          </Facet>
          <Facet label={`Average, last ${recent.length || 6} months`}>
            <Amount minor={pace.average} currency={currency} />
          </Facet>
        </Facets>
      </FigureRow>

      {goal.target_minor !== null && (
        <div className="prog" role="presentation">
          <i style={{ width: `${standing.share}%` }} />
        </div>
      )}

      {months.isError && <Notice tone="err">{dataErrorMessage(months.error)}</Notice>}
      {history.length > 0 && (
        <MonthLine
          title={ahead.length > 0 ? 'Where it is, and where the plan takes it' : 'Saved at each month end'}
          caption={ahead.length > 0 ? `${history.length} months behind, ${ahead.length} ahead` : `Last ${history.length} months`}
          rows={history.map((m) => ({ month: m.month, value: m.closing_balance_minor }))}
          ahead={ahead}
          target={goal.target_minor}
          currency={currency}
          currentMonth={thisMonth}
          valueLabel="Saved"
          aheadLabel="The plan"
        />
      )}

      {goal.target_minor !== null && !standing.reached && (
        <section className="group stack-tight pace">
          {pace.average > 0 ? (
            <p className="flush">
              Over the last {recent.length} {recent.length === 1 ? 'month' : 'months'} you put in an average of{' '}
              <strong>
                <Amount minor={pace.average} currency={currency} />
              </strong>{' '}
              a month.{pace.arrives && <> At that rate the target arrives in <strong>{formatMonth(pace.arrives)}</strong>.</>}
            </p>
          ) : (
            <p className="flush">Nothing has come in over the last six months.</p>
          )}
          {goal.target_date && standing.neededPerMonth !== null && standing.monthsLeft !== null && (
            <p className="flush">
              {standing.monthsLeft > 0 ? (
                <>
                  Reaching it by <strong>{formatMonth(goal.target_date)}</strong> takes{' '}
                  <strong>
                    <Amount minor={standing.neededPerMonth} currency={currency} />
                  </strong>{' '}
                  a month from here.
                </>
              ) : (
                <>
                  The target date has passed; <Amount minor={standing.neededPerMonth} currency={currency} /> remains.
                </>
              )}
            </p>
          )}
        </section>
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
