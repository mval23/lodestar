import { useState } from 'react';
import { Link } from 'react-router';
import { Check } from 'lucide-react';
import { useCurrency, useHasTransactions, useProfile } from '../../lib/profile';
import { CURRENCIES } from '../../lib/money';
import { monthStartInZone, todayInZone } from '../../lib/dates';
import { setupPath } from '../../lib/routes';
import { Amount } from '../../ui/Amount';
import { Button } from '../../ui/Button';
import { Notice } from '../../ui/Notice';
import { dataErrorMessage } from '../auth/errors';
import { AccountSheet } from '../accounts/AccountSheet';
import { LIABILITY_TYPES, accountTypeLabel, useAccounts } from '../accounts/queries';
import { BillSheet } from '../bills/BillSheet';
import { describeDue, describeSchedule, useBills } from '../bills/queries';
import { BudgetList } from '../budgets/BudgetList';
import { CategorySheet } from '../categories/CategoryManager';
import { useCategories, useCreateCategory, type CategoryKind } from '../categories/queries';
import { GoalSheet } from '../goals/GoalSheet';
import { useGoals } from '../goals/queries';
import { TransactionSheet } from '../transactions/TransactionSheet';

// The body of each setup step. Every one lists what has been added so far
// and opens the same sheet the rest of the app uses to add more.

export function AccountsStep() {
  const currency = useCurrency();
  const accounts = useAccounts();
  const [adding, setAdding] = useState(false);
  const open = (accounts.data ?? []).filter((account) => !account.archived_at);

  return (
    <>
      {accounts.isError && <Notice tone="err">{dataErrorMessage(accounts.error)}</Notice>}
      {open.length > 0 && (
        <ul className="rows-list">
          {open.map((account) => (
            <li key={account.account_id}>
              <div className="row-button row-static">
                <span className="row-label">
                  {account.name}
                  <small>{accountTypeLabel(account.type)}</small>
                </span>
                <Amount minor={account.balance_minor} currency={currency} />
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="actions">
        <Button variant={open.length > 0 ? 'secondary' : 'primary'} onClick={() => setAdding(true)}>
          {open.length > 0 ? 'Add another account' : 'Add your first account'}
        </Button>
      </div>
      {adding && <AccountSheet onClose={() => setAdding(false)} />}
    </>
  );
}

// A few common categories to pick from, so nobody starts at a blank page.
// They're ungrouped, and only what's picked is created.
const STARTERS: { kind: CategoryKind; title: string; names: string[] }[] = [
  {
    kind: 'expense',
    title: 'Spending',
    names: ['Housing', 'Groceries', 'Utilities', 'Transport', 'Eating out', 'Health', 'Shopping', 'Entertainment', 'Subscriptions'],
  },
  { kind: 'income', title: 'Income', names: ['Salary', 'Freelance', 'Other income'] },
];

const keyOf = (kind: CategoryKind, name: string) => `${kind}:${name.toLowerCase()}`;

export function CategoriesStep() {
  const categories = useCategories();
  const create = useCreateCategory();
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const rows = categories.data ?? [];
  // Names are unique per kind, archived or not, so an archived match counts
  // as already there.
  const existing = new Set(rows.map((c) => keyOf(c.kind, c.name)));
  const active = rows.filter((c) => !c.archived_at);
  const toAdd = STARTERS.flatMap(({ kind, names }) =>
    names.filter((name) => picked.has(keyOf(kind, name)) && !existing.has(keyOf(kind, name))).map((name) => ({ kind, name })),
  );

  const toggle = (key: string) =>
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const addPicked = async () => {
    if (toAdd.length === 0) return;
    setError(null);
    setBusy(true);
    try {
      for (const values of toAdd) await create.mutateAsync(values);
      setPicked(new Set());
    } catch (cause) {
      setError(dataErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {categories.isError && <Notice tone="err">{dataErrorMessage(categories.error)}</Notice>}

      {STARTERS.map(({ kind, title, names }) => (
        <section key={kind} className="stack-tight" aria-labelledby={`starters-${kind}`}>
          <h2 className="form-group-title flush" id={`starters-${kind}`}>
            {title}
          </h2>
          <div className="choice-chips">
            {names.map((name) => {
              const key = keyOf(kind, name);
              const added = existing.has(key);
              const on = added || picked.has(key);
              return (
                <button
                  key={key}
                  type="button"
                  className="choice-chip"
                  aria-pressed={on}
                  disabled={added}
                  onClick={() => toggle(key)}
                >
                  {on && <Check strokeWidth={2} aria-hidden />}
                  {name}
                  {added && <span className="visually-hidden">, added</span>}
                </button>
              );
            })}
          </div>
        </section>
      ))}

      {error && <Notice tone="err">{error}</Notice>}

      <div className="actions">
        <Button
          variant={active.length > 0 ? 'secondary' : 'primary'}
          dimmed={toAdd.length === 0}
          busy={busy}
          onClick={addPicked}
        >
          {toAdd.length === 0
            ? 'Pick categories to add'
            : `Add ${toAdd.length} ${toAdd.length === 1 ? 'category' : 'categories'}`}
        </Button>
        <Button variant="plain" onClick={() => setAdding(true)}>
          Add your own
        </Button>
      </div>

      {active.length > 0 && (
        <p className="footnote flush">
          You have {active.length} {active.length === 1 ? 'category' : 'categories'}:{' '}
          {active.map((c) => c.name).join(', ')}.
        </p>
      )}

      {adding && <CategorySheet siblings={rows} useCount={new Map()} onClose={() => setAdding(false)} />}
    </>
  );
}

export function BillsStep() {
  const currency = useCurrency();
  const profile = useProfile();
  const today = todayInZone(profile.data?.timezone);
  const bills = useBills();
  const [adding, setAdding] = useState(false);
  const open = (bills.data ?? []).filter((bill) => !bill.archived_at);

  return (
    <>
      {bills.isError && <Notice tone="err">{dataErrorMessage(bills.error)}</Notice>}
      {open.length > 0 && (
        <ul className="rows-list">
          {open.map((bill) => (
            <li key={bill.id}>
              <div className="row-button row-static">
                <span className="row-label">
                  {bill.name}
                  <small>
                    {describeSchedule(bill.cadence_unit, bill.cadence_interval)} ·{' '}
                    {describeDue(bill.next_due_on, today)}
                  </small>
                </span>
                <Amount minor={bill.amount_minor} currency={currency} />
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="actions">
        <Button variant={open.length > 0 ? 'secondary' : 'primary'} onClick={() => setAdding(true)}>
          {open.length > 0 ? 'Add another bill' : 'Add a bill'}
        </Button>
      </div>
      {adding && <BillSheet onClose={() => setAdding(false)} />}
    </>
  );
}

export function BudgetsStep() {
  const profile = useProfile();
  const categories = useCategories();
  const month = monthStartInZone(profile.data?.timezone);
  const spending = (categories.data ?? []).filter((c) => c.kind === 'expense' && !c.archived_at);

  if (categories.isSuccess && spending.length === 0) {
    return (
      <p className="secondary flush">
        A plan is made per spending category, and you don’t have one yet.{' '}
        <Link to={setupPath('categories')}>Add a category</Link> first, or skip this for now.
      </p>
    );
  }
  return <BudgetList month={month} />;
}

export function GoalsStep() {
  const currency = useCurrency();
  const accounts = useAccounts();
  const goals = useGoals();
  const [sheet, setSheet] = useState<'goal' | 'account' | null>(null);

  const open = (goals.data ?? []).filter((goal) => !goal.archived_at);
  // The same rule GoalSheet applies: one goal per account, never a card or loan.
  const taken = new Set((goals.data ?? []).map((goal) => goal.account_id));
  const available = (accounts.data ?? []).filter(
    (account) => !account.archived_at && !LIABILITY_TYPES.includes(account.type) && !taken.has(account.account_id),
  );

  return (
    <>
      {goals.isError && <Notice tone="err">{dataErrorMessage(goals.error)}</Notice>}
      {open.length > 0 && (
        <ul className="rows-list">
          {open.map((goal) => (
            <li key={goal.goal_id}>
              <div className="row-button row-static">
                <span className="row-label">
                  {goal.name}
                  <small>
                    {goal.target_minor === null ? (
                      'No target'
                    ) : (
                      <>
                        Target <Amount minor={goal.target_minor} currency={currency} />
                      </>
                    )}
                  </small>
                </span>
                <Amount minor={goal.balance_minor} currency={currency} />
              </div>
            </li>
          ))}
        </ul>
      )}

      {accounts.isSuccess && available.length === 0 && (
        <p className="form-hint flush">
          Every account you have is a card, a loan or already behind a goal. Add a savings account to hold this one.
        </p>
      )}

      <div className="actions">
        {available.length > 0 && (
          <Button variant={open.length > 0 ? 'secondary' : 'primary'} onClick={() => setSheet('goal')}>
            {open.length > 0 ? 'Add another goal' : 'Add a goal'}
          </Button>
        )}
        <Button variant={available.length > 0 ? 'plain' : 'primary'} onClick={() => setSheet('account')}>
          Add a savings account
        </Button>
      </div>

      {sheet === 'goal' && <GoalSheet onClose={() => setSheet(null)} />}
      {sheet === 'account' && <AccountSheet defaultType="savings" onClose={() => setSheet(null)} />}
    </>
  );
}

export function ExpenseStep() {
  const currency = useCurrency();
  const hasTransactions = useHasTransactions();
  const [adding, setAdding] = useState(false);

  return (
    <>
      {hasTransactions.data === true ? (
        <Notice tone="ok">
          Your first transaction is in. You’ll find it in <Link to="/activity">Activity</Link>.
        </Notice>
      ) : (
        <>
          <div className="actions">
            <Button onClick={() => setAdding(true)}>Add your first expense</Button>
          </div>
          <p className="form-hint flush">
            Once it’s saved, your currency stays {CURRENCIES[currency].label}.
          </p>
        </>
      )}
      {adding && <TransactionSheet defaultKind="expense" onClose={() => setAdding(false)} />}
    </>
  );
}
