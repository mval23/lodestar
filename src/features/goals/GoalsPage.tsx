import { useState } from 'react';
import { Flag } from 'lucide-react';
import { useCurrency, useProfile } from '../../lib/profile';
import { formatDate, monthStartInZone } from '../../lib/dates';
import { Amount } from '../../ui/Amount';
import { Button } from '../../ui/Button';
import { EmptyState } from '../../ui/EmptyState';
import { Notice } from '../../ui/Notice';
import { dataErrorMessage } from '../auth/errors';
import { TransactionSheet } from '../transactions/TransactionSheet';
import { GoalSheet } from './GoalSheet';
import { standingOf, useGoals, type GoalProgress } from './queries';

// A goal is a savings account with an intention attached. Money arrives the
// same way it arrives anywhere: a transfer. There is no separate "savings"
// idea to keep in step with the ledger.
export function GoalsPage() {
  const currency = useCurrency();
  const profile = useProfile();
  const goals = useGoals();
  const [editing, setEditing] = useState<GoalProgress | undefined>();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [contributingTo, setContributingTo] = useState<GoalProgress | undefined>();

  const today = monthStartInZone(profile.data?.timezone);
  const rows = (goals.data ?? []).filter((goal) => !goal.archived_at);

  const openSheet = (goal?: GoalProgress) => {
    setEditing(goal);
    setSheetOpen(true);
  };

  return (
    <div className="page page-narrow">
      <header className="page-head">
        <div>
          <h1 className="large-title">Goals</h1>
          <p className="footnote flush">Each goal is one savings account. Every transfer into it counts.</p>
        </div>
        <Button onClick={() => openSheet()}>Add goal</Button>
      </header>

      {goals.isError && <Notice tone="err">{dataErrorMessage(goals.error)}</Notice>}
      {goals.isPending && <p className="secondary">Loading your goals…</p>}

      {goals.isSuccess && rows.length === 0 && (
        <EmptyState icon={Flag} title="No goals yet" action={<Button onClick={() => openSheet()}>Add a goal</Button>}>
          A goal turns a savings account into something you’re working towards. Set a target if you have one, or just
          watch it grow.
        </EmptyState>
      )}

      {rows.map((goal) => {
        const standing = standingOf(goal, today);
        return (
          <section key={goal.goal_id} className="group goal-card">
            <header className="goal-head">
              <div>
                <h2 className="headline">{goal.name}</h2>
                <p className="footnote flush">
                  {goal.target_minor === null ? (
                    'No target'
                  ) : (
                    <>
                      of <Amount minor={goal.target_minor} currency={currency} />
                      {goal.target_date && ` by ${formatDate(goal.target_date)}`}
                    </>
                  )}
                </p>
              </div>
              <p className="fig flush">
                <Amount minor={goal.balance_minor} currency={currency} />
              </p>
            </header>

            {goal.target_minor !== null && (
              <div className="prog" role="presentation">
                <i style={{ width: `${standing.share}%` }} />
              </div>
            )}

            <p className="footnote flush">
              {standing.reached ? (
                'Target reached.'
              ) : goal.target_minor !== null ? (
                <>
                  <Amount minor={Math.max(0, goal.target_minor - goal.balance_minor)} currency={currency} /> to go
                  {standing.neededPerMonth !== null && standing.monthsLeft !== null && (
                    <>
                      {' · '}
                      {standing.monthsLeft > 0 ? (
                        <>
                          <Amount minor={standing.neededPerMonth} currency={currency} /> a month for{' '}
                          {standing.monthsLeft} {standing.monthsLeft === 1 ? 'month' : 'months'}
                        </>
                      ) : (
                        'The target date has passed'
                      )}
                    </>
                  )}
                </>
              ) : (
                'Growing with every transfer in.'
              )}
            </p>

            <p className="footnote flush">
              <Amount minor={goal.this_month_contributed_minor} currency={currency} /> set aside this month
              {goal.monthly_plan_minor !== null && (
                <>
                  {' of '}
                  <Amount minor={goal.monthly_plan_minor} currency={currency} /> planned
                </>
              )}
            </p>

            <div className="actions">
              <Button variant="secondary" onClick={() => setContributingTo(goal)}>
                Add money
              </Button>
              <Button variant="plain" onClick={() => openSheet(goal)}>
                Edit goal
              </Button>
            </div>
          </section>
        );
      })}

      {sheetOpen && <GoalSheet goal={editing} onClose={() => setSheetOpen(false)} />}
      {contributingTo && (
        <TransactionSheet
          defaultKind="transfer"
          defaultToAccountId={contributingTo.account_id}
          defaultDescription={contributingTo.name}
          onClose={() => setContributingTo(undefined)}
        />
      )}
    </div>
  );
}
