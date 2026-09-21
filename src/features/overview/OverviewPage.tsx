import { useState } from 'react';
import { Link, useLocation } from 'react-router';
import { ArrowDownUp, CalendarClock, ChartColumn, ChevronRight, type LucideIcon } from 'lucide-react';
import { useCurrency, useProfile, useUpdateProfile } from '../../lib/profile';
import { CURRENCIES, describeMoney, type Currency } from '../../lib/money';
import { formatDate, formatMonth, monthStartInZone, todayInZone } from '../../lib/dates';
import { accountPath, billPath, budgetLinePath, budgetMonthPath, goalPath, monthPath } from '../../lib/routes';
import { Amount } from '../../ui/Amount';
import { Button } from '../../ui/Button';
import { SectionHead } from '../../ui/Detail';
import { Notice } from '../../ui/Notice';
import { Sparkline } from '../../ui/Sparkline';
import { dataErrorMessage } from '../auth/errors';
import { AccountSheet } from '../accounts/AccountSheet';
import { NetWorthGroup } from '../accounts/NetWorthGroup';
import { accountTypeLabel, netWorthOf, useAccounts, type AccountBalance } from '../accounts/queries';
import { describeDue, dueStateOf, useBills } from '../bills/queries';
import { totalsOf, useBudgets, type BudgetProgress } from '../budgets/queries';
import { standingOf, useGoals } from '../goals/queries';
import { useCashFlow, useNetWorth } from '../reports/queries';
import { TransactionSheet } from '../transactions/TransactionSheet';

// Where you stand, in one screen. The large block is this month's plan: what
// is left to spend, each category against its plan, and what the month has
// brought in and paid out. It is the figure acted on day to day, so it leads.
// Beside it, net worth and its trend, and the bills due this week. Below
// them, the accounts and the goals being saved for. Every block links to the
// page that explains it.
export function OverviewPage() {
  const notice = (useLocation().state as { notice?: string } | null)?.notice;
  const currency = useCurrency();
  const profile = useProfile();
  const accounts = useAccounts();
  const [accountSheet, setAccountSheet] = useState(false);
  const [txnSheet, setTxnSheet] = useState(false);

  const today = todayInZone(profile.data?.timezone);
  const thisMonth = monthStartInZone(profile.data?.timezone);
  const rows = accounts.data ?? [];
  const firstRun = accounts.isSuccess && rows.length === 0;

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1 className="large-title">Overview</h1>
          {!firstRun && <p className="footnote flush">{formatDate(today)}</p>}
        </div>
        {!firstRun && !accounts.isPending && (
          <div className="actions">
            <Button onClick={() => setTxnSheet(true)}>Add transaction</Button>
          </div>
        )}
      </header>

      {notice && <Notice tone="ok">{notice}</Notice>}

      {accounts.isError && <Notice tone="err">{dataErrorMessage(accounts.error)}</Notice>}

      {/* Until the accounts land there is no net worth to state. Standing in
          with $0.00 would be the first thing this screen says, and it would
          be wrong. */}
      {accounts.isPending && <p className="secondary">Working out where you stand…</p>}

      {firstRun ? (
        <FirstRun onAddAccount={() => setAccountSheet(true)} />
      ) : accounts.isPending ? null : (
        <>
          <div className="overview-layout">
            <MonthPlan month={thisMonth} currency={currency} />

            <div className="overview-side">
              <NetWorthGroup accounts={rows} compact>
                <Trend currency={currency} />
              </NetWorthGroup>
              <DueThisWeek today={today} currency={currency} />
            </div>
          </div>

          <AccountsSection accounts={rows} currency={currency} />
          <GoalsStrip currency={currency} month={thisMonth} />
          <MoreOnPhone />
        </>
      )}

      {accountSheet && <AccountSheet onClose={() => setAccountSheet(false)} />}
      {txnSheet && <TransactionSheet onClose={() => setTxnSheet(false)} />}
    </div>
  );
}

// A caption that is also the way to the page behind it.
function TitleLink({ to, children }: { to: string; children: string }) {
  return (
    <Link className="card-title-link" to={to}>
      {children}
      <ChevronRight strokeWidth={1.75} aria-hidden />
    </Link>
  );
}

// Which way net worth has moved over the year, as a line and in words. The
// words carry the number; the line only shows the shape.
function Trend({ currency }: { currency: Currency }) {
  const netWorth = useNetWorth(12);
  const points = (netWorth.data ?? []).map((row) => row.net_worth_minor);
  if (points.length < 2) return null;

  const first = points[0]!;
  const last = points[points.length - 1]!;
  const label = `Net worth over the last ${points.length} months, from ${describeMoney(first, currency)} to ${describeMoney(last, currency)}.`;

  return (
    <div className="stand-trend">
      <Sparkline values={points} label={label} small />
      <p className="footnote flush">
        <Amount minor={last - first} currency={currency} signed /> over {points.length} months ·{' '}
        <Link to="/reports">Reports</Link>
      </p>
    </div>
  );
}

function ThisMonth({ month, currency }: { month: string; currency: Currency }) {
  const cashFlow = useCashFlow(2);
  const current = (cashFlow.data ?? []).find((row) => row.month === month);

  return (
    <div className="stand-month">
      <h3 className="caption">
        <TitleLink to={monthPath(month)}>This month</TitleLink>
      </h3>
      {cashFlow.isPending ? (
        <p className="footnote flush">Loading…</p>
      ) : current ? (
        <p className="stand-month-figures flush">
          <span className="card-figure">
            <Amount minor={current.net_minor} currency={currency} signed />
          </span>
          <span className="footnote">
            <Amount minor={current.money_in_minor} currency={currency} /> in ·{' '}
            <Amount minor={current.money_out_minor} currency={currency} /> out
          </span>
        </p>
      ) : (
        <p className="footnote flush">Nothing recorded this month yet.</p>
      )}
    </div>
  );
}

// "Nothing due this week" and "we haven't asked yet" are different
// statements, and only one of them is safe to make before the answer arrives.
function DueThisWeek({ today, currency }: { today: string; currency: Currency }) {
  const bills = useBills();
  const due = (bills.data ?? []).filter((bill) => !bill.archived_at && dueStateOf(bill.next_due_on, today) !== 'later');
  const total = due.reduce((sum, bill) => sum + bill.amount_minor, 0);

  return (
    <section className="group overview-card" aria-labelledby="overview-due">
      <div className="card-head">
        <h2 className="caption" id="overview-due">
          <TitleLink to="/bills">Due this week</TitleLink>
        </h2>
        {due.length > 0 && <Amount minor={total} currency={currency} className="card-total" />}
      </div>
      {bills.isPending ? (
        <p className="footnote flush">Loading…</p>
      ) : due.length === 0 ? (
        <p className="footnote flush">Nothing due in the next week.</p>
      ) : (
        <ul className="mini-list">
          {due.slice(0, 4).map((bill) => {
            const state = dueStateOf(bill.next_due_on, today);
            return (
              <li key={bill.id}>
                <span className="row-label">
                  <Link to={billPath(bill.id)}>{bill.name}</Link>
                  <small className={state === 'overdue' ? 'due-overdue' : undefined}>
                    {describeDue(bill.next_due_on, today)}
                  </small>
                </span>
                <Amount minor={bill.amount_minor} currency={currency} />
              </li>
            );
          })}
        </ul>
      )}
      {due.length > 4 && (
        <p className="footnote flush">
          <Link to="/bills">{due.length - 4} more due this week</Link>
        </p>
      )}
    </section>
  );
}

// This month's plan, as the Overview's large block. The figure is what is
// left to spend, or by how much the month is over plan, in words rather than
// as a negative. Under it, each planned category against its plan: the ones
// past their plan first, since those need you, then the rest by how much of
// their plan is used. The month's money in and out closes the block.
const PLAN_ROWS_SHOWN = 8;

function shareUsed(row: BudgetProgress): number {
  return row.planned_minor > 0 ? row.spent_minor / row.planned_minor : 0;
}

function MonthPlan({ month, currency }: { month: string; currency: Currency }) {
  const budgets = useBudgets(month);
  const rows = budgets.data ?? [];
  const totals = totalsOf(rows);
  const ordered = [...rows].sort((a, b) => {
    const overA = a.left_minor < 0;
    const overB = b.left_minor < 0;
    if (overA !== overB) return overA ? -1 : 1;
    if (overA) return a.left_minor - b.left_minor;
    return shareUsed(b) - shareUsed(a);
  });

  return (
    <section className="group figure-group overview-plan" aria-labelledby="overview-plan">
      <div className="card-head">
        <h2 className="caption" id="overview-plan">
          <TitleLink to={budgetMonthPath(month)}>Budgets</TitleLink>
        </h2>
        <span className="footnote">{formatMonth(month)}</span>
      </div>

      {budgets.isPending ? (
        <p className="footnote flush">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="footnote flush">
          <span>No plan for this month yet.</span> <Link to={budgetMonthPath(month)}>Plan this month</Link>
        </p>
      ) : (
        <>
          <p className="caption flush">{totals.left < 0 ? 'Over plan by' : 'Left to spend'}</p>
          <p className="fig flush">
            <span className="bracket">
              <Amount minor={Math.abs(totals.left)} currency={currency} />
            </span>
          </p>
          <p className="footnote flush">
            <Amount minor={totals.spent} currency={currency} /> spent of{' '}
            <Amount minor={totals.planned} currency={currency} /> planned
          </p>

          <ul className="plan-list">
            {ordered.slice(0, PLAN_ROWS_SHOWN).map((row) => {
              const over = row.left_minor < 0;
              const share = row.planned_minor > 0 ? Math.min(100, Math.round(shareUsed(row) * 100)) : 100;
              return (
                <li key={row.category_id}>
                  <div className="plan-list-row">
                    <Link to={budgetLinePath(month, row.category_id)}>{row.category_name}</Link>
                    <span className="footnote">
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
                  {/* Hatched past the plan, so the state is never colour alone. */}
                  <div className={`prog spend${over ? ' over' : ''}`} role="presentation">
                    <i style={{ width: `${share}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
          {ordered.length > PLAN_ROWS_SHOWN && (
            <p className="footnote flush">
              <Link to={budgetMonthPath(month)}>All {ordered.length} planned categories</Link>
            </p>
          )}
        </>
      )}

      <ThisMonth month={month} currency={currency} />
    </section>
  );
}

// The accounts behind the figure, with the assets and the cards and loans
// kept apart and each side totalled. A liability keeps the sign it has on
// every other screen, so its side is named for what it holds rather than
// "owed", which read as a double negative beside a minus sign.
function AccountsSection({ accounts, currency }: { accounts: AccountBalance[]; currency: Currency }) {
  const open = accounts.filter((a) => !a.archived_at);
  if (open.length === 0) return null;
  const worth = netWorthOf(accounts);
  const assets = open.filter((a) => !a.is_liability);
  const liabilities = open.filter((a) => a.is_liability);

  return (
    <section className="stack-tight" aria-labelledby="overview-accounts">
      {/* Always offered: on a phone this is the way to Accounts, which has no
          tab of its own. */}
      <SectionHead
        id="overview-accounts"
        title="Accounts"
        link={{ to: '/accounts', label: open.length > 1 ? `All ${open.length} accounts` : 'All accounts' }}
      />
      <div className="account-columns">
        {assets.length > 0 && (
          <AccountGroup title="Assets" total={worth.assets} rows={assets} currency={currency} />
        )}
        {liabilities.length > 0 && (
          <AccountGroup title="Cards and loans" total={worth.liabilities} rows={liabilities} currency={currency} />
        )}
      </div>
    </section>
  );
}

const ACCOUNTS_SHOWN = 5;

function AccountGroup({
  title,
  total,
  rows,
  currency,
}: {
  title: string;
  total: number;
  rows: AccountBalance[];
  currency: Currency;
}) {
  return (
    <div>
      <div className="group-subtotal">
        <h3 className="form-group-title flush">{title}</h3>
        <Amount minor={total} currency={currency} className="footnote" />
      </div>
      <ul className="rows-list">
        {rows.slice(0, ACCOUNTS_SHOWN).map((row) => (
          <li key={row.account_id}>
            <Link className="row-button row-compact" to={accountPath(row.account_id)}>
              <span className="row-label">
                {row.name}
                <small>{accountTypeLabel(row.type)}</small>
              </span>
              <Amount minor={row.balance_minor} currency={currency} />
            </Link>
          </li>
        ))}
      </ul>
      {rows.length > ACCOUNTS_SHOWN && (
        <p className="form-hint">
          <Link to="/accounts">{rows.length - ACCOUNTS_SHOWN} more</Link>
        </p>
      )}
    </div>
  );
}

// The goals being saved for, each with its bar. A goal without a target has
// nothing to measure against, so it shows its balance alone.
function GoalsStrip({ currency, month }: { currency: Currency; month: string }) {
  const goals = useGoals();
  const rows = (goals.data ?? []).filter((goal) => !goal.archived_at).slice(0, 4);
  if (goals.isPending || rows.length === 0) return null;

  return (
    <section className="stack-tight" aria-labelledby="overview-goals">
      <SectionHead id="overview-goals" title="Goals" link={{ to: '/goals', label: 'All goals' }} />
      <ul className="goal-strip">
        {rows.map((goal) => {
          const standing = standingOf(goal, month);
          return (
            <li key={goal.goal_id} className="group goal-chip">
              <div className="goal-chip-head">
                <Link to={goalPath(goal.goal_id)}>{goal.name}</Link>
                <Amount minor={goal.balance_minor} currency={currency} />
              </div>
              {goal.target_minor !== null && (
                <div className="prog" role="presentation">
                  <i style={{ width: `${standing.share}%` }} />
                </div>
              )}
              <p className="footnote flush">
                {goal.target_minor === null ? (
                  'No target'
                ) : standing.reached ? (
                  'Target reached'
                ) : (
                  <>
                    {standing.share}% saved of <Amount minor={goal.target_minor} currency={currency} />
                  </>
                )}
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// First run: choose the currency, then add the first account. The choice is
// offered here because it can only be changed until the first transaction.
function FirstRun({ onAddAccount }: { onAddAccount: () => void }) {
  const profile = useProfile();
  const update = useUpdateProfile();
  const currency = useCurrency();

  const choose = (next: Currency) => {
    if (!profile.data || next === currency) return;
    update.mutate({ id: profile.data.id, changes: { currency: next } });
  };

  return (
    <section className="group stack">
      <div>
        <h2 className="title-2">Welcome to Lodestar</h2>
        <p className="secondary flush">
          Let’s start with where you are today: add an account and its current balance. Budgets, bills and goals can
          come later, whenever you’re ready.
        </p>
      </div>

      <div>
        <h3 className="form-group-title">Your currency</h3>
        <div className="form-group">
          <div className="form-row">
            <span className="form-label">Currency</span>
            <div className="segmented" role="radiogroup" aria-label="Currency">
              {(Object.keys(CURRENCIES) as Currency[]).map((code) => (
                <label key={code}>
                  <input
                    type="radio"
                    name="first-run-currency"
                    value={code}
                    checked={currency === code}
                    onChange={() => choose(code)}
                  />
                  {code}
                </label>
              ))}
            </div>
          </div>
        </div>
        <p className="form-hint">
          Every account and amount uses {CURRENCIES[currency].label}, and nothing is ever converted. You can change this
          until you record your first transaction.
        </p>
      </div>

      {update.isError && <Notice tone="err">That didn’t save. Try again in a moment.</Notice>}

      <div className="actions">
        <Button onClick={onAddAccount}>Add your first account</Button>
      </div>
    </section>
  );
}

// The phone's tab bar has room for four screens. Everything else the sidebar
// offers has to be reachable from somewhere, and the Overview is where
// CLAUDE.md puts it: without this, Reports and Import & export had no way in
// on a phone at all. On a wide screen the sidebar already lists them.
const MORE: { to: string; label: string; hint: string; icon: LucideIcon }[] = [
  { to: '/bills', label: 'Bills', hint: 'Bills and subscriptions, and what’s due next', icon: CalendarClock },
  { to: '/reports', label: 'Reports', hint: 'Cash flow and net worth, month by month', icon: ChartColumn },
  { to: '/import-export', label: 'Import & export', hint: 'Bring in a CSV, or take all your data', icon: ArrowDownUp },
];

function MoreOnPhone() {
  return (
    <nav className="stack-tight mobile-only" aria-labelledby="overview-more">
      <SectionHead id="overview-more" title="More" />
      <ul className="rows-list">
        {MORE.map(({ to, label, hint, icon: Icon }) => (
          <li key={to}>
            <Link className="row-button" to={to}>
              <Icon className="row-icon" strokeWidth={1.75} aria-hidden />
              <span className="row-label row-grow">
                {label}
                <small>{hint}</small>
              </span>
              <ChevronRight className="row-chevron" strokeWidth={1.75} aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
