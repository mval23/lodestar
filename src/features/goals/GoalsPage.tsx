import { useState } from 'react';
import { Link } from 'react-router';
import { CircleCheck, Clock, Flag } from 'lucide-react';
import { useCurrency, useProfile } from '../../lib/profile';
import { billPath, goalPath } from '../../lib/routes';
import { formatDate, monthStartInZone, todayInZone } from '../../lib/dates';
import { Amount } from '../../ui/Amount';
import { Button } from '../../ui/Button';
import { EmptyState } from '../../ui/EmptyState';
import { Notice } from '../../ui/Notice';
import { dataErrorMessage } from '../auth/errors';
import { useAccounts } from '../accounts/queries';
import { BillSheet, transferPrefill, type BillPrefill } from '../bills/BillSheet';
import { MarkPaid } from '../bills/MarkPaid';
import { describeDue, describeSchedule, dueStateOf, perMonth, useBills, type RecurringItem } from '../bills/queries';
import { TransactionSheet } from '../transactions/TransactionSheet';
import { GoalSheet } from './GoalSheet';
import { standingOf, useGoals, useUpdateGoal, type GoalProgress } from './queries';

type Currency = Parameters<typeof Amount>[0]['currency'];

// A goal is a savings account with an intention attached. Money arrives the
// same way it arrives anywhere: a transfer. There is no separate "savings"
// idea to keep in step with the ledger.
export function GoalsPage() {
  const currency = useCurrency();
  const profile = useProfile();
  const goals = useGoals();
  const bills = useBills();
  const accounts = useAccounts();
  const [editing, setEditing] = useState<GoalProgress | undefined>();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [contributingTo, setContributingTo] = useState<GoalProgress | undefined>();
  const [scheduling, setScheduling] = useState<BillPrefill | undefined>();

  const today = monthStartInZone(profile.data?.timezone);
  const day = todayInZone(profile.data?.timezone);
  const rows = (goals.data ?? []).filter((goal) => !goal.archived_at);
  const archived = (goals.data ?? []).filter((goal) => goal.archived_at);
  const update = useUpdateGoal();
  const [restoreError, setRestoreError] = useState<string | null>(null);
  // Each goal has its own account, so these balances never overlap and can
  // be added up for display.
  const saved = rows.reduce((sum, goal) => sum + goal.balance_minor, 0);
  const addedThisMonth = rows.reduce((sum, goal) => sum + goal.this_month_contributed_minor, 0);
  const reachedCount = rows.filter((goal) => standingOf(goal, today).reached).length;
  const accountNames = new Map((accounts.data ?? []).map((a) => [a.account_id, a.name]));

  // Scheduled transfers into a goal's account. They are bills of kind
  // transfer, so "Done" is the same one-step Mark as paid, and each one it
  // records is a contribution like any other transfer in.
  const goalByAccount = new Map(rows.map((goal) => [goal.account_id, goal]));
  const scheduled = (bills.data ?? []).filter(
    (bill) => !bill.archived_at && bill.kind === 'transfer' && goalByAccount.has(bill.to_account_id ?? ''),
  );
  const nextFor = (goal: GoalProgress) => scheduled.find((bill) => bill.to_account_id === goal.account_id);

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
        <Button data-tour="add-goal" onClick={() => openSheet()}>
          Add goal
        </Button>
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
        // What is scheduled into the goals on the left, the goals on the
        // right. A narrow screen stacks them in that order.
        <div className="goals-layout">
          <ScheduledColumn
            scheduled={scheduled}
            goalByAccount={goalByAccount}
            accountNames={accountNames}
            today={day}
            currency={currency}
            onSchedule={() => setScheduling(transferPrefill())}
          />

          <div className="goals-main">
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

            {/* Two across once there is room: a goal is a short card, and one
                column of them left most of the frame empty. */}
            <div className="goal-grid">
              {rows.map((goal) => {
                const standing = standingOf(goal, today);
                const next = nextFor(goal);
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
                        // A real state, so it gets the success colour, with an
                        // icon and words: never colour alone.
                        <>
                          <CircleCheck strokeWidth={1.75} aria-hidden />
                          <span>Target reached.</span>
                        </>
                      ) : goal.target_minor !== null ? (
                        <>
                          <Amount minor={Math.max(0, goal.target_minor - goal.balance_minor)} currency={currency} /> to
                          go
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

                    <p className="footnote flush goal-next">
                      <Clock strokeWidth={1.75} aria-hidden />
                      {next ? (
                        <span>
                          Next: <Amount minor={next.amount_minor} currency={currency} />
                          {next.next_due_on < day
                            ? `, overdue since ${formatDate(next.next_due_on)}`
                            : ` on ${formatDate(next.next_due_on)} from ${accountNames.get(next.from_account_id ?? '') ?? 'an account'}`}
                        </span>
                      ) : (
                        <span>
                          No transfer scheduled ·{' '}
                          <Button variant="plain" className="btn-inline" onClick={() => setScheduling(transferPrefill(goal))}>
                            Schedule one
                          </Button>
                        </span>
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
          </div>
        </div>
      )}

      {/* Goals put away when they were done: out of the way, a click from
          coming back. */}
      {archived.length > 0 && (
        <details className="fold">
          <summary className="fold-summary">Archived · {archived.length}</summary>
          <div className="fold-body">
            {restoreError && <Notice tone="err">{restoreError}</Notice>}
            <ul className="rows-list">
              {archived.map((goal) => (
                <li key={goal.goal_id} className="archived-goal">
                  <Link to={goalPath(goal.goal_id)} className="archived-goal-name">
                    {goal.name}
                    <small>Archived {formatDate(goal.archived_at!.slice(0, 10))}</small>
                  </Link>
                  <span className="num secondary">
                    <Amount minor={goal.balance_minor} currency={currency} />
                  </span>
                  <Button
                    variant="plain"
                    aria-label={`Restore “${goal.name}”`}
                    onClick={async () => {
                      setRestoreError(null);
                      try {
                        await update.mutateAsync({ id: goal.goal_id, changes: { archived_at: null } });
                      } catch (cause) {
                        setRestoreError(dataErrorMessage(cause));
                      }
                    }}
                  >
                    Restore
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        </details>
      )}

      {sheetOpen && <GoalSheet goal={editing} onClose={() => setSheetOpen(false)} />}
      {contributingTo && (
        <TransactionSheet
          defaultKind="transfer"
          defaultToAccountId={contributingTo.account_id}
          defaultDescription={contributingTo.name}
          onClose={() => setContributingTo(undefined)}
        />
      )}
      {scheduling && <BillSheet prefill={scheduling} onClose={() => setScheduling(undefined)} />}
    </div>
  );
}

// The transfers scheduled into goals, like the Bills page in miniature: the
// next seven days, overdue included, each with a one-click Done, then the rest.
function ScheduledColumn({
  scheduled,
  goalByAccount,
  accountNames,
  today,
  currency,
  onSchedule,
}: {
  scheduled: RecurringItem[];
  goalByAccount: Map<string, GoalProgress>;
  accountNames: Map<string, string>;
  today: string;
  currency: Currency;
  onSchedule: () => void;
}) {
  const due = scheduled.filter((bill) => dueStateOf(bill.next_due_on, today) !== 'later');
  const later = scheduled.filter((bill) => dueStateOf(bill.next_due_on, today) === 'later');
  // A handful of stored amounts added for display, as on the Bills page. A
  // schedule that isn't monthly is spread over the month, so the total says
  // "about" unless every part of it is exact.
  const monthly = scheduled.map(perMonth);
  const monthlyTotal = monthly.reduce((sum, m) => sum + m.minor, 0);
  const exact = monthly.every((m) => m.exact);
  const dueTotal = due.reduce((sum, bill) => sum + bill.amount_minor, 0);

  const label = (bill: RecurringItem) => {
    const goal = goalByAccount.get(bill.to_account_id ?? '');
    const from = accountNames.get(bill.from_account_id ?? '') ?? 'An account';
    return (
      <span className="row-label">
        {bill.name}
        <small>
          {/* No date here: the figure beside it already says when, and the
              column is too narrow for both. */}
          {goal && goal.name !== bill.name && `Into ${goal.name} · `}
          From {from} · {describeSchedule(bill.cadence_unit, bill.cadence_interval)}
        </small>
      </span>
    );
  };
  const figures = (bill: RecurringItem) => {
    const state = dueStateOf(bill.next_due_on, today);
    return (
      <span className="bill-figures">
        <Amount minor={bill.amount_minor} currency={currency} />
        <small className={state === 'overdue' ? 'due-overdue' : state === 'today' ? 'due-today' : undefined}>
          {describeDue(bill.next_due_on, today)}
        </small>
      </span>
    );
  };

  return (
    <aside className="goals-schedule" aria-label="Scheduled transfers">
      {scheduled.length === 0 ? (
        <section className="group stack-tight">
          <h2 className="caption">Scheduled into your goals</h2>
          <p className="footnote flush">
            Nothing scheduled yet. Schedule a regular transfer into a goal, then mark it done with one click each time.
          </p>
        </section>
      ) : (
        <section className="group figure-group">
          <h2 className="caption">Scheduled into your goals</h2>
          <p className="fig flush">
            {!exact && 'About '}
            <Amount minor={monthlyTotal} currency={currency} />
          </p>
          <p className="footnote flush">
            a month · {scheduled.length} {scheduled.length === 1 ? 'schedule' : 'schedules'}
            {due.length > 0 && (
              <>
                {' · '}
                <Amount minor={dueTotal} currency={currency} /> due this week
              </>
            )}
          </p>
        </section>
      )}

      {due.length > 0 && (
        <section>
          <h2 className="form-group-title">Next 7 days</h2>
          <ul className="rows-list">
            {due.map((bill) => (
              <li key={bill.id} className="bill-row">
                <Link to={billPath(bill.id)} className="row-button bill-main">
                  {label(bill)}
                  {figures(bill)}
                </Link>
                <MarkPaid bill={bill} today={today} compact />
              </li>
            ))}
          </ul>
        </section>
      )}

      {later.length > 0 && (
        <section>
          <h2 className="form-group-title">Later</h2>
          <ul className="rows-list">
            {later.map((bill) => (
              <li key={bill.id}>
                <Link to={billPath(bill.id)} className="row-button bill-main">
                  {label(bill)}
                  {figures(bill)}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div>
        <Button variant="secondary" onClick={onSchedule}>
          Schedule a transfer
        </Button>
      </div>
    </aside>
  );
}
