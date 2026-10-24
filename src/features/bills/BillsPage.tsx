import { useState } from 'react';
import { Link } from 'react-router';
import { CalendarClock } from 'lucide-react';
import { useCurrency, useProfile } from '../../lib/profile';
import { billPath } from '../../lib/routes';
import { formatDate, todayInZone } from '../../lib/dates';
import { Amount } from '../../ui/Amount';
import { Button } from '../../ui/Button';
import { EmptyState } from '../../ui/EmptyState';
import { Notice } from '../../ui/Notice';
import { dataErrorMessage } from '../auth/errors';
import { useAccounts } from '../accounts/queries';
import { useGoals } from '../goals/queries';
import { BillSheet, transferPrefill, type BillPrefill } from './BillSheet';
import { MarkPaid } from './MarkPaid';
import { describeDue, describeSchedule, dueStateOf, useBills, type RecurringItem } from './queries';

const LABEL_TEXT: Record<string, string> = {
  bill: 'Bill',
  subscription: 'Subscription',
  income: 'Income',
  transfer: 'Transfer',
};

const INCOME_PREFILL: BillPrefill = { label: 'income', kind: 'income' };

// What's coming round, in a column for each kind, and each column in two
// parts: the next seven days, overdue included, where each item can be
// marked paid, received or done right here; and everything later, which is
// read, not acted on, so its rows carry no buttons. Paying something a
// month early still works from the item's own page.
export function BillsPage() {
  const currency = useCurrency();
  const profile = useProfile();
  const bills = useBills();
  const accounts = useAccounts();
  const goals = useGoals();
  // The sheet opens from a prefill: {} for a plain bill.
  const [sheet, setSheet] = useState<BillPrefill | null>(null);
  const accountNames = new Map((accounts.data ?? []).map((a) => [a.account_id, a.name]));
  const goalAccounts = new Set((goals.data ?? []).filter((g) => !g.archived_at).map((g) => g.account_id));

  const today = todayInZone(profile.data?.timezone);
  const rows = (bills.data ?? []).filter((bill) => !bill.archived_at);
  const due = rows.filter((bill) => dueStateOf(bill.next_due_on, today) !== 'later');
  const later = rows.filter((bill) => dueStateOf(bill.next_due_on, today) === 'later');
  const archived = (bills.data ?? []).filter((bill) => bill.archived_at);
  // What is due is what you pay: bills and subscriptions. Income on its way
  // is named beside it, never added to it; a planned transfer is neither.
  const billsDue = due.filter((bill) => bill.kind === 'expense');
  const incomeDue = due.filter((bill) => bill.kind === 'income');
  const overdue = billsDue.filter((bill) => dueStateOf(bill.next_due_on, today) === 'overdue').length;
  const varies = billsDue.filter((bill) => bill.amount_is_variable).length;
  // A handful of already-stored amounts, added for display: the same kind of
  // total the budget summary shows.
  const dueTotal = billsDue.reduce((sum, bill) => sum + bill.amount_minor, 0);
  const arriving = incomeDue.reduce((sum, bill) => sum + bill.amount_minor, 0);
  const next = later.find((bill) => bill.kind === 'expense');
  // Transfers due are money moving between your own accounts: named beside
  // the bills, never added to them.
  const transfersDue = due.filter((bill) => bill.kind === 'transfer');
  const moving = transfersDue.reduce((sum, bill) => sum + bill.amount_minor, 0);
  const intoGoals = transfersDue.every((bill) => bill.to_account_id && goalAccounts.has(bill.to_account_id));
  const arrivingNote = (
    <>
      {incomeDue.length > 0 && (
        <>
          {' · '}
          <Amount minor={arriving} currency={currency} signed /> arriving
        </>
      )}
      {transfersDue.length > 0 && (
        <>
          {' · '}
          <Amount minor={moving} currency={currency} /> to move {intoGoals ? 'into goals' : 'between accounts'}
        </>
      )}
    </>
  );

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1 className="large-title">Bills</h1>
          <p className="footnote flush">Bills, subscriptions and scheduled transfers, with what’s due next.</p>
        </div>
        <div className="actions">
          <Button variant="secondary" onClick={() => setSheet(transferPrefill())}>
            Schedule a transfer
          </Button>
          <Button data-tour="add-bill" onClick={() => setSheet({})}>
            Add bill
          </Button>
        </div>
      </header>

      {bills.isError && <Notice tone="err">{dataErrorMessage(bills.error)}</Notice>}
      {bills.isPending && <p className="secondary">Loading your bills…</p>}

      {bills.isSuccess && rows.length === 0 && (
        <EmptyState
          icon={CalendarClock}
          title="No bills yet"
          action={<Button onClick={() => setSheet({})}>Add a bill</Button>}
        >
          Add the things that come round: rent, a subscription, a monthly transfer into a goal, anything with a due
          date. Marking one paid or done records the transaction and moves the date on.
        </EmptyState>
      )}

      {rows.length > 0 &&
        (billsDue.length > 0 ? (
          <section className="group figure-group">
            <h2 className="caption">Due in the next 7 days</h2>
            <p className="fig flush">
              <span className="bracket">
                <Amount minor={dueTotal} currency={currency} />
              </span>
            </p>
            <p className="footnote flush">
              {billsDue.length} {billsDue.length === 1 ? 'bill' : 'bills'}
              {overdue > 0 && ` · ${overdue} overdue`}
              {varies > 0 && ` · ${varies === 1 ? 'one amount varies' : `${varies} amounts vary`}, so this is an estimate`}
              {arrivingNote}
            </p>
          </section>
        ) : (
          next && (
            <section className="group figure-group">
              <h2 className="caption">Next due</h2>
              <p className="fig flush">
                <span className="bracket">
                  <Amount minor={next.amount_minor} currency={currency} />
                </span>
              </p>
              <p className="footnote flush">
                <Link to={billPath(next.id)}>{next.name}</Link> · {formatDate(next.next_due_on)} ·{' '}
                {describeDue(next.next_due_on, today)}. Nothing is due in the next 7 days.
                {arrivingNote}
              </p>
            </section>
          )
        ))}

      {/* One column for each kind of money: transfers between your own
          accounts, bills going out, and income coming in. Bills come first
          in reading order, and first when a narrow screen stacks them; a
          wide one puts transfers on the left and income on the right. */}
      {rows.length > 0 && (
        <div className="bills-columns">
          <BillColumn
            area="bills"
            title="Bills"
            items={rows.filter((bill) => bill.kind === 'expense')}
            today={today}
            currency={currency}
            accountNames={accountNames}
            empty="No bills or subscriptions yet."
            addLabel="Add a bill"
            onAdd={() => setSheet({})}
          />
          <BillColumn
            area="transfers"
            title="Transfers"
            items={rows.filter((bill) => bill.kind === 'transfer')}
            today={today}
            currency={currency}
            accountNames={accountNames}
            empty="No scheduled transfers. A monthly one into a goal is marked done in one click."
            addLabel="Schedule a transfer"
            onAdd={() => setSheet(transferPrefill())}
          />
          <BillColumn
            area="income"
            title="Income"
            items={rows.filter((bill) => bill.kind === 'income')}
            today={today}
            currency={currency}
            accountNames={accountNames}
            empty="No income expected. Add pay or anything else that arrives on a schedule."
            addLabel="Add income"
            onAdd={() => setSheet(INCOME_PREFILL)}
          />
        </div>
      )}

      {archived.length > 0 && (
        <details className="archived">
          <summary>{archived.length} archived</summary>
          <ul className="rows-list">
            {archived.map((bill) => (
              <li key={bill.id}>
                <Link to={billPath(bill.id)} className="row-button">
                  <span className="row-label">
                    {bill.name}
                    <small>Archived</small>
                  </span>
                  <Amount minor={bill.amount_minor} currency={currency} />
                </Link>
              </li>
            ))}
          </ul>
        </details>
      )}

      {sheet && <BillSheet prefill={sheet} onClose={() => setSheet(null)} />}
    </div>
  );
}

type Currency = Parameters<typeof Amount>[0]['currency'];

function BillColumn({
  area,
  title,
  items,
  today,
  currency,
  accountNames,
  empty,
  addLabel,
  onAdd,
}: {
  area: 'bills' | 'transfers' | 'income';
  title: string;
  items: RecurringItem[];
  today: string;
  currency: Currency;
  accountNames: AccountNames;
  empty: string;
  addLabel: string;
  onAdd: () => void;
}) {
  const due = items.filter((bill) => dueStateOf(bill.next_due_on, today) !== 'later');
  const later = items.filter((bill) => dueStateOf(bill.next_due_on, today) === 'later');
  const headingId = `bills-col-${area}`;
  return (
    <section className={`bills-col bills-col-${area}`} aria-labelledby={headingId}>
      <h2 className="headline" id={headingId}>
        {title}
      </h2>

      {items.length === 0 && (
        <div className="group stack-tight">
          <p className="footnote flush">{empty}</p>
          <div>
            <Button variant="secondary" onClick={onAdd}>
              {addLabel}
            </Button>
          </div>
        </div>
      )}

      {due.length > 0 && (
        <div>
          <h3 className="form-group-title">Next 7 days</h3>
          <ul className="rows-list">
            {due.map((bill) => (
              <DueRow key={bill.id} bill={bill} today={today} currency={currency} accountNames={accountNames} />
            ))}
          </ul>
        </div>
      )}

      {later.length > 0 && (
        <div>
          <h3 className="form-group-title">Later</h3>
          <ul className="rows-list">
            {later.map((bill) => (
              <li key={bill.id}>
                <Link to={billPath(bill.id)} className="row-button">
                  <BillLabel bill={bill} accountNames={accountNames} />
                  <BillFigures bill={bill} today={today} currency={currency} />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

type AccountNames = Map<string, string>;

function BillLabel({ bill, accountNames }: { bill: RecurringItem; accountNames: AccountNames }) {
  // A transfer says where the money goes, since that is what it is for.
  const route =
    bill.kind === 'transfer'
      ? ` · ${accountNames.get(bill.from_account_id ?? '') ?? 'An account'} → ${accountNames.get(bill.to_account_id ?? '') ?? 'an account'}`
      : '';
  return (
    <span className="row-label">
      {bill.name}
      <small>
        {bill.kind === 'transfer' ? 'Transfer' : LABEL_TEXT[bill.label]}
        {route} · {describeSchedule(bill.cadence_unit, bill.cadence_interval)} ·{' '}
        {formatDate(bill.next_due_on)}
        {bill.amount_is_variable && ' · Amount varies'}
      </small>
    </span>
  );
}

function BillFigures({ bill, today, currency }: { bill: RecurringItem; today: string; currency: Currency }) {
  const state = dueStateOf(bill.next_due_on, today);
  return (
    <span className="bill-figures">
      <Amount minor={bill.amount_minor} currency={currency} signed={bill.kind === 'income'} />
      <small className={state === 'overdue' ? 'due-overdue' : state === 'today' ? 'due-today' : undefined}>
        {describeDue(bill.next_due_on, today)}
      </small>
    </span>
  );
}

// A bill due this week: the row opens the bill, and marking it paid happens
// beside it. On a wide screen the action sits on the same line.
function DueRow({
  bill,
  today,
  currency,
  accountNames,
}: {
  bill: RecurringItem;
  today: string;
  currency: Currency;
  accountNames: AccountNames;
}) {
  return (
    <li className="bill-row">
      <Link to={billPath(bill.id)} className="row-button bill-main">
        <BillLabel bill={bill} accountNames={accountNames} />
        <BillFigures bill={bill} today={today} currency={currency} />
      </Link>
      <MarkPaid bill={bill} today={today} />
    </li>
  );
}
