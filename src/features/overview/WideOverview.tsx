import { Link } from 'react-router';
import { describeMoney, type Currency } from '../../lib/money';
import { formatMonth } from '../../lib/dates';
import { accountPath, billPath, budgetLinePath, budgetMonthPath, goalPath, monthPath, monthRange } from '../../lib/routes';
import { Amount } from '../../ui/Amount';
import { Sparkline } from '../../ui/Sparkline';
import { accountTypeLabel, netWorthOf, type AccountBalance } from '../accounts/queries';
import { describeDue, dueStateOf, useBills } from '../bills/queries';
import { totalsOf, useBudgets, type BudgetProgress } from '../budgets/queries';
import { standingOf, useGoals } from '../goals/queries';
import { useMonthAccounts } from '../months/queries';
import { useCashFlow, useNetWorth } from '../reports/queries';
import { TitleLink } from './TitleLink';

// The Overview on a wide screen: figures first. The four numbers a person
// checks every time sit in one band across the top, then two columns that
// end together: the month's plan on the left, what is coming and what is
// owed on the right. Accounts and goals close the page. A phone keeps the
// stacked Overview instead (OverviewPage decides which).

type Props = { accounts: AccountBalance[]; today: string; month: string; currency: Currency };

export function WideOverview({ accounts, today, month, currency }: Props) {
  return (
    <>
      <KeyFigures accounts={accounts} today={today} month={month} currency={currency} />
      <div className="wide-columns">
        <BudgetLines month={month} currency={currency} />
        <div className="wide-stack">
          <ComingUp today={today} currency={currency} />
          <DebtGroup accounts={accounts} month={month} currency={currency} />
        </div>
      </div>
      <div className="wide-columns wide-bottom">
        <AssetsGroup accounts={accounts} currency={currency} />
        <GoalsGroup month={month} currency={currency} />
      </div>
    </>
  );
}

const monthName = (month: string) => formatMonth(month).split(' ')[0] ?? '';

function shareUsed(row: BudgetProgress): number {
  return row.planned_minor > 0 ? row.spent_minor / row.planned_minor : 0;
}

// Over-plan categories first, largest overage first; then by share of plan
// used, highest first. The same order as the phone's plan.
function byNeed(a: BudgetProgress, b: BudgetProgress): number {
  const overA = a.left_minor < 0;
  const overB = b.left_minor < 0;
  if (overA !== overB) return overA ? -1 : 1;
  if (overA) return a.left_minor - b.left_minor;
  return shareUsed(b) - shareUsed(a);
}

// ---------------------------------------------------------------------------
// The band: left to spend (the page's one bracket), net worth, this month,
// and what is due in the next seven days. One white group, divided by
// hairlines, never four floating cards.
// ---------------------------------------------------------------------------

function KeyFigures({ accounts, today, month, currency }: Props) {
  const budgets = useBudgets(month);
  const netWorth = useNetWorth(12);
  const cashFlow = useCashFlow(2);
  const bills = useBills();

  const plan = budgets.data ?? [];
  const totals = totalsOf(plan);
  const over = totals.left < 0;
  const share = totals.planned > 0 ? Math.min(100, Math.round((totals.spent / totals.planned) * 100)) : 0;
  const daysLeft = Number(monthRange(month).to.slice(8, 10)) - Number(today.slice(8, 10));

  const worth = netWorthOf(accounts);
  const points = (netWorth.data ?? []).map((row) => row.net_worth_minor);
  const current = (cashFlow.data ?? []).find((row) => row.month === month);

  const due = (bills.data ?? []).filter((bill) => !bill.archived_at && dueStateOf(bill.next_due_on, today) !== 'later');
  const dueTotal = due.reduce((sum, bill) => sum + bill.amount_minor, 0);
  const overdue = due.filter((bill) => dueStateOf(bill.next_due_on, today) === 'overdue').length;
  const next = due[0];

  return (
    <section className="group fig-band" aria-label="Key figures">
      <div className="fig-cell">
        <h2 className="caption">
          <TitleLink to={budgetMonthPath(month)}>{`${over ? 'Over plan by' : 'Left to spend'} · ${monthName(month)}`}</TitleLink>
        </h2>
        {budgets.isPending ? (
          <p className="footnote flush">Loading…</p>
        ) : plan.length === 0 ? (
          <p className="footnote flush">
            <span>No plan for this month yet.</span> <Link to={budgetMonthPath(month)}>Plan this month</Link>
          </p>
        ) : (
          <>
            <p className="fig flush">
              <span className="bracket">
                <Amount minor={Math.abs(totals.left)} currency={currency} />
              </span>
            </p>
            <p className="footnote flush">
              <Amount minor={totals.spent} currency={currency} /> of <Amount minor={totals.planned} currency={currency} />
              {' · '}
              {daysLeft <= 0 ? 'last day of the month' : daysLeft === 1 ? '1 day left' : `${daysLeft} days left`}
            </p>
            <div className={`prog spend${over ? ' over' : ''}`} role="presentation">
              <i style={{ width: `${over ? 100 : share}%` }} />
            </div>
          </>
        )}
      </div>

      <div className="fig-cell">
        <h2 className="caption">Net worth</h2>
        <p className="card-figure flush">
          <Amount minor={worth.net} currency={currency} />
        </p>
        {points.length >= 2 && (
          <>
            <Sparkline
              values={points}
              label={`Net worth over the last ${points.length} months, from ${describeMoney(points[0]!, currency)} to ${describeMoney(points[points.length - 1]!, currency)}.`}
              small
            />
            <p className="footnote flush">
              <Amount minor={points[points.length - 1]! - points[0]!} currency={currency} signed /> over {points.length}{' '}
              months · <Link to="/reports">Reports</Link>
            </p>
          </>
        )}
      </div>

      <div className="fig-cell">
        <h2 className="caption">
          <TitleLink to={monthPath(month)}>This month</TitleLink>
        </h2>
        {cashFlow.isPending ? (
          <p className="footnote flush">Loading…</p>
        ) : current ? (
          <>
            <p className="card-figure flush">
              <Amount minor={current.net_minor} currency={currency} signed />
            </p>
            <p className="footnote flush">
              <Amount minor={current.money_in_minor} currency={currency} /> in
            </p>
            <p className="footnote flush">
              <Amount minor={current.money_out_minor} currency={currency} /> out
            </p>
          </>
        ) : (
          <p className="footnote flush">Nothing recorded this month yet.</p>
        )}
      </div>

      <div className="fig-cell">
        <h2 className="caption">
          <TitleLink to="/bills">Due in the next 7 days</TitleLink>
        </h2>
        {bills.isPending ? (
          <p className="footnote flush">Loading…</p>
        ) : due.length === 0 ? (
          <p className="footnote flush">Nothing due in the next week.</p>
        ) : (
          <>
            <p className="card-figure flush">
              <Amount minor={dueTotal} currency={currency} />
            </p>
            <p className="footnote flush">
              {due.length} {due.length === 1 ? 'bill' : 'bills'}
              {overdue > 0 && ` · ${overdue} overdue`}
            </p>
            {next && (
              <p className="footnote flush">
                Next: {next.name}, {describeDue(next.next_due_on, today).toLowerCase()}
              </p>
            )}
          </>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// The month's plan, one line per category: name, bar, what is left.
// ---------------------------------------------------------------------------

function BudgetLines({ month, currency }: { month: string; currency: Currency }) {
  const budgets = useBudgets(month);
  const rows = [...(budgets.data ?? [])].sort(byNeed);

  return (
    <section className="group wide-group" aria-labelledby="wide-budgets">
      <div className="wide-head">
        <h2 className="headline" id="wide-budgets">
          Budgets
        </h2>
        <Link className="footnote" to={budgetMonthPath(month)}>
          {formatMonth(month)}
        </Link>
      </div>
      {budgets.isPending ? (
        <p className="footnote wide-empty">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="footnote wide-empty">
          Plan an amount for the categories you want to keep an eye on, and they show here.{' '}
          <Link to={budgetMonthPath(month)}>Plan this month</Link>
        </p>
      ) : (
        <>
          {rows.map((row) => {
            const over = row.left_minor < 0;
            const share = row.planned_minor > 0 ? Math.min(100, Math.round(shareUsed(row) * 100)) : 100;
            return (
              <div key={row.category_id} className="wide-bar-row">
                <Link to={budgetLinePath(month, row.category_id)}>{row.category_name}</Link>
                {/* Hatched past the plan, so the state is never colour alone. */}
                <div className={`prog spend${over ? ' over' : ''}`} role="presentation">
                  <i style={{ width: `${over ? 100 : share}%` }} />
                </div>
                <span className="footnote num wide-end">
                  {over ? (
                    <>
                      over by <Amount minor={-row.left_minor} currency={currency} />
                    </>
                  ) : (
                    <>
                      <Amount minor={row.left_minor} currency={currency} /> left
                    </>
                  )}
                </span>
              </div>
            );
          })}
          <div className="wide-row wide-foot">
            <span className="caption">
              {rows.length} planned {rows.length === 1 ? 'category' : 'categories'}
            </span>
            <Link className="footnote" to={budgetMonthPath(month)}>
              All budgets
            </Link>
          </div>
        </>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// What comes round next, soonest first, income included.
// ---------------------------------------------------------------------------

const COMING_SHOWN = 5;

function ComingUp({ today, currency }: { today: string; currency: Currency }) {
  const bills = useBills();
  const rows = (bills.data ?? []).filter((bill) => !bill.archived_at).slice(0, COMING_SHOWN);

  return (
    <section className="group wide-group" aria-labelledby="wide-coming">
      <div className="wide-head">
        <h2 className="headline" id="wide-coming">
          Coming up
        </h2>
        <Link className="footnote" to="/bills">
          All bills
        </Link>
      </div>
      {bills.isPending ? (
        <p className="footnote wide-empty">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="footnote wide-empty">No bills or subscriptions yet.</p>
      ) : (
        rows.map((bill) => {
          const state = dueStateOf(bill.next_due_on, today);
          return (
            <div key={bill.id} className="wide-row">
              <span className="row-label">
                <Link to={billPath(bill.id)}>{bill.name}</Link>
                <small className={state === 'overdue' ? 'due-overdue' : state === 'today' ? 'due-today' : undefined}>
                  {describeDue(bill.next_due_on, today)}
                  {bill.amount_is_variable && ' · amount varies'}
                </small>
              </span>
              <Amount minor={bill.amount_minor} currency={currency} signed={bill.kind === 'income'} />
            </div>
          );
        })
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// What is owed, card by card and loan by loan, with what was paid this month.
// A payment is a transfer into one of these accounts.
// ---------------------------------------------------------------------------

function DebtGroup({ accounts, month, currency }: { accounts: AccountBalance[]; month: string; currency: Currency }) {
  const flows = useMonthAccounts(month);
  const liabilities = accounts.filter((a) => a.is_liability && !a.archived_at);
  if (liabilities.length === 0) return null;

  const worth = netWorthOf(accounts);
  const ids = new Set(liabilities.map((a) => a.account_id));
  // Already-summed monthly flows of a few accounts, added for display.
  const paid = (flows.data ?? []).filter((f) => ids.has(f.account_id)).reduce((sum, f) => sum + f.transfer_in_minor, 0);

  return (
    <section className="group wide-group wide-grow" aria-labelledby="wide-debt">
      <div className="wide-head">
        <h2 className="headline" id="wide-debt">
          Debt
        </h2>
        {worth.owed < 0 ? (
          <span className="card-total">
            <Amount minor={-worth.owed} currency={currency} /> in credit
          </span>
        ) : (
          <Amount minor={worth.owed} currency={currency} className="card-total" />
        )}
      </div>
      {liabilities.map((account) => (
        <div key={account.account_id} className="wide-row">
          <span className="row-label">
            <Link className="plain-link" to={accountPath(account.account_id)}>
              {account.name}
            </Link>
            <small>{accountTypeLabel(account.type)}</small>
          </span>
          <Amount minor={account.balance_minor} currency={currency} />
        </div>
      ))}
      <div className="wide-row wide-foot">
        <span className="caption">Paid this month</span>
        <Amount minor={paid} currency={currency} className="footnote" />
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// What the person owns. Cards and loans have their own group above.
// ---------------------------------------------------------------------------

const ASSETS_SHOWN = 6;

function AssetsGroup({ accounts, currency }: { accounts: AccountBalance[]; currency: Currency }) {
  const open = accounts.filter((a) => !a.archived_at);
  const assets = open.filter((a) => !a.is_liability);
  if (assets.length === 0) return null;
  const worth = netWorthOf(accounts);

  return (
    <section className="group wide-group" aria-labelledby="wide-accounts">
      <div className="wide-head">
        <h2 className="headline" id="wide-accounts">
          Accounts
        </h2>
        <Amount minor={worth.assets} currency={currency} className="card-total" />
      </div>
      {assets.slice(0, ASSETS_SHOWN).map((account) => (
        <div key={account.account_id} className="wide-row">
          <span className="row-label">
            <Link className="plain-link" to={accountPath(account.account_id)}>
              {account.name}
            </Link>
            <small>{accountTypeLabel(account.type)}</small>
          </span>
          <Amount minor={account.balance_minor} currency={currency} />
        </div>
      ))}
      <div className="wide-row wide-foot">
        <span className="caption">{assets.length > ASSETS_SHOWN ? `${assets.length - ASSETS_SHOWN} more` : 'In assets'}</span>
        <Link className="footnote" to="/accounts">
          {open.length > 1 ? `All ${open.length} accounts` : 'All accounts'}
        </Link>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Goals, one line each: name, bar, how far along.
// ---------------------------------------------------------------------------

const GOALS_SHOWN = 5;

function GoalsGroup({ month, currency }: { month: string; currency: Currency }) {
  const goals = useGoals();
  const rows = (goals.data ?? []).filter((goal) => !goal.archived_at);
  if (goals.isPending || rows.length === 0) return null;

  return (
    <section className="group wide-group" aria-labelledby="wide-goals">
      <div className="wide-head">
        <h2 className="headline" id="wide-goals">
          Goals
        </h2>
        <Link className="footnote" to="/goals">
          All goals
        </Link>
      </div>
      {rows.slice(0, GOALS_SHOWN).map((goal) => {
        const standing = standingOf(goal, month);
        return (
          <div key={goal.goal_id} className="wide-bar-row">
            <Link to={goalPath(goal.goal_id)}>{goal.name}</Link>
            {goal.target_minor === null ? (
              <Amount minor={goal.balance_minor} currency={currency} className="footnote" />
            ) : (
              <div className="prog" role="presentation">
                <i style={{ width: `${standing.share}%` }} />
              </div>
            )}
            <span className="footnote num wide-end">
              {goal.target_minor === null ? (
                'No target'
              ) : standing.reached ? (
                'Target reached'
              ) : (
                <>
                  {standing.share}% saved of <Amount minor={goal.target_minor} currency={currency} />
                </>
              )}
            </span>
          </div>
        );
      })}
    </section>
  );
}
