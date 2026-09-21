import { useState } from 'react';
import { Link, useLocation } from 'react-router';
import { useCurrency, useProfile, useUpdateProfile } from '../../lib/profile';
import { CURRENCIES, type Currency } from '../../lib/money';
import { monthStartInZone, todayInZone } from '../../lib/dates';
import { budgetMonthPath, monthPath } from '../../lib/routes';
import { Amount } from '../../ui/Amount';
import { Button } from '../../ui/Button';
import { Notice } from '../../ui/Notice';
import { AccountSheet } from '../accounts/AccountSheet';
import { accountTypeLabel, netWorthOf, useAccounts } from '../accounts/queries';
import { describeDue, dueStateOf, useBills } from '../bills/queries';
import { totalsOf, useBudgets } from '../budgets/queries';
import { useGoals } from '../goals/queries';
import { useCashFlow } from '../reports/queries';
import { TransactionSheet } from '../transactions/TransactionSheet';

// Where you stand, in one screen: what you have, what this month has done,
// what is due, and what you are saving towards. Everything here is a link to
// the page that explains it.
export function OverviewPage() {
  const notice = (useLocation().state as { notice?: string } | null)?.notice;
  const currency = useCurrency();
  const profile = useProfile();
  const accounts = useAccounts();
  const [accountSheet, setAccountSheet] = useState(false);
  const [txnSheet, setTxnSheet] = useState(false);

  const today = todayInZone(profile.data?.timezone);
  const thisMonth = monthStartInZone(profile.data?.timezone);
  const open = (accounts.data ?? []).filter((a) => !a.archived_at);
  const worth = netWorthOf(accounts.data ?? []);
  const firstRun = accounts.isSuccess && (accounts.data ?? []).length === 0;

  return (
    <div className="page">
      <header className="page-head">
        <h1 className="large-title">Overview</h1>
        {!firstRun && (
          <div className="actions">
            <Button onClick={() => setTxnSheet(true)}>Add transaction</Button>
          </div>
        )}
      </header>

      {notice && <Notice tone="ok">{notice}</Notice>}

      {firstRun ? (
        <FirstRun onAddAccount={() => setAccountSheet(true)} />
      ) : (
        <>
          <section className="group figure-group">
            <h2 className="caption">Net worth</h2>
            <p className="fig flush">
              <span className="bracket">
                <Amount minor={worth.net} currency={currency} />
              </span>
            </p>
            <p className="footnote flush">
              <Amount minor={worth.assets} currency={currency} /> in assets
              {worth.liabilities !== 0 && (
                <>
                  {' · '}
                  <Amount minor={-worth.liabilities} currency={currency} /> owed
                </>
              )}
            </p>
          </section>

          <div className="overview-grid">
            <ThisMonth month={thisMonth} currency={currency} />
            <BudgetSummary month={thisMonth} currency={currency} />
            <DueSoon today={today} currency={currency} />
            <GoalsSummary currency={currency} />
          </div>

          {open.length > 0 && (
            <section>
              <h2 className="form-group-title">Accounts</h2>
              <ul className="rows-list">
                {open.slice(0, 5).map((row) => (
                  <li key={row.account_id}>
                    <Link className="row-button" to="/accounts">
                      <span className="row-label">
                        {row.name}
                        <small>{accountTypeLabel(row.type)}</small>
                      </span>
                      <Amount minor={row.balance_minor} currency={currency} />
                    </Link>
                  </li>
                ))}
              </ul>
              {open.length > 5 && (
                <p className="form-hint">
                  <Link to="/accounts">See all {open.length} accounts</Link>
                </p>
              )}
            </section>
          )}
        </>
      )}

      {accountSheet && <AccountSheet onClose={() => setAccountSheet(false)} />}
      {txnSheet && <TransactionSheet onClose={() => setTxnSheet(false)} />}
    </div>
  );
}

function Card({
  title,
  to,
  linkText,
  children,
}: {
  title: string;
  to: string;
  linkText: string;
  children: React.ReactNode;
}) {
  return (
    <section className="group overview-card">
      <header className="chart-head">
        <h2 className="caption">{title}</h2>
        <Link className="footnote" to={to}>
          {linkText}
        </Link>
      </header>
      {children}
    </section>
  );
}

function ThisMonth({ month, currency }: { month: string; currency: Currency }) {
  const cashFlow = useCashFlow(2);
  const current = (cashFlow.data ?? []).find((row) => row.month === month);

  return (
    <Card title="This month" to={monthPath(month)} linkText="Open the month">
      {current ? (
        <>
          <p className="card-figure flush">
            <Amount minor={current.net_minor} currency={currency} signed />
          </p>
          <p className="footnote flush">
            <Amount minor={current.money_in_minor} currency={currency} /> in ·{' '}
            <Amount minor={current.money_out_minor} currency={currency} /> out
          </p>
        </>
      ) : (
        <p className="footnote flush">Nothing recorded this month yet.</p>
      )}
    </Card>
  );
}

function BudgetSummary({ month, currency }: { month: string; currency: Currency }) {
  const budgets = useBudgets(month);
  const rows = budgets.data ?? [];
  const totals = totalsOf(rows);
  const over = rows.filter((row) => row.left_minor < 0);

  return (
    <Card title="Budgets" to={budgetMonthPath(month)} linkText="Budgets">
      {rows.length === 0 ? (
        <p className="footnote flush">No plan for this month yet.</p>
      ) : (
        <>
          <p className="card-figure flush">
            <Amount minor={totals.left} currency={currency} />
          </p>
          <p className="footnote flush">
            left of <Amount minor={totals.planned} currency={currency} /> planned
            {over.length > 0 && ` · ${over.length} over plan`}
          </p>
        </>
      )}
    </Card>
  );
}

function DueSoon({ today, currency }: { today: string; currency: Currency }) {
  const bills = useBills();
  const due = (bills.data ?? [])
    .filter((bill) => !bill.archived_at && dueStateOf(bill.next_due_on, today) !== 'later')
    .slice(0, 3);

  return (
    <Card title="Due now" to="/bills" linkText="Bills">
      {due.length === 0 ? (
        <p className="footnote flush">Nothing due in the next week.</p>
      ) : (
        <ul className="mini-list">
          {due.map((bill) => (
            <li key={bill.id}>
              <span className="row-label">
                {bill.name}
                <small>{describeDue(bill.next_due_on, today)}</small>
              </span>
              <Amount minor={bill.amount_minor} currency={currency} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function GoalsSummary({ currency }: { currency: Currency }) {
  const goals = useGoals();
  const rows = (goals.data ?? []).filter((goal) => !goal.archived_at).slice(0, 3);

  return (
    <Card title="Goals" to="/goals" linkText="Goals">
      {rows.length === 0 ? (
        <p className="footnote flush">No goals yet.</p>
      ) : (
        <ul className="mini-list">
          {rows.map((goal) => (
            <li key={goal.goal_id}>
              <span className="row-label">
                {goal.name}
                <small>
                  {goal.target_minor === null
                    ? 'No target'
                    : `${Math.min(100, Math.round((goal.balance_minor / goal.target_minor) * 100))}% saved`}
                </small>
              </span>
              <Amount minor={goal.balance_minor} currency={currency} />
            </li>
          ))}
        </ul>
      )}
    </Card>
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
