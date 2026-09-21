import { useState } from 'react';
import { Link } from 'react-router';
import { CircleCheck, Flag } from 'lucide-react';
import { useCurrency, useProfile } from '../../lib/profile';
import { goalPath } from '../../lib/routes';
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
  // Each goal has its own account, so these balances never overlap and can
  // be added up for display.
  const saved = rows.reduce((sum, goal) => sum + goal.balance_minor, 0);
  const addedThisMonth = rows.reduce((sum, goal) => sum + goal.this_month_contributed_minor, 0);
  const reachedCount = rows.filter((goal) => standingOf(goal, today).reached).length;

  const openSheet = (goal?: GoalProgress) => {
    setEditing(goal);
    setSheetOpen(true);
  };

  return (
    <div className="page">
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

      {rows.length > 0 && (
        <section className="group figure-group">
          <h2 className="caption">Saved across your goals</h2>
          <p className="fig flush">
            <span className="bracket">
              <Amount minor={saved} currency={currency} />
            </span>
          </p>
          <p className="footnote flush">
            {rows.length} {rows.length === 1 ? 'goal' : 'goals'}
            {reachedCount > 0 && ` · ${reachedCount} reached`}
            {' · '}
            <Amount minor={addedThisMonth} currency={currency} /> added this month
          </p>
        </section>
      )}

      {/* Two across on a wide screen: a goal is a short card, and one column
          of them left most of the frame empty. */}
      <div className="goal-grid">
        {rows.map((goal) => {
          const standing = standingOf(goal, today);
          return (
            <section key={goal.goal_id} className={`group goal-card${standing.reached ? ' reached' : ''}`}>
              <header className="goal-head">
                <div>
                  <h2 className="headline">
                    <Link to={goalPath(goal.goal_id)}>{goal.name}</Link>
                  </h2>
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

              <p className={`footnote flush${standing.reached ? ' goal-reached' : ''}`}>
                {standing.reached ? (
                  // A real state, so it gets the success colour, with an icon
                  // and words: never colour alone.
                  <>
                    <CircleCheck strokeWidth={1.75} aria-hidden />
                    <span>Target reached.</span>
                  </>
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
      </div>

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
