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
import { BillSheet } from './BillSheet';
import { MarkPaid } from './MarkPaid';
import { describeDue, describeSchedule, dueStateOf, useBills, type RecurringItem } from './queries';

const LABEL_TEXT: Record<string, string> = {
  bill: 'Bill',
  subscription: 'Subscription',
  income: 'Income',
  transfer: 'Transfer',
};

// What's coming round, in two parts: the next seven days, overdue included,
// where each bill can be marked paid right here; and everything later, which
// is read, not acted on, so its rows carry no buttons. Paying something a
// month early still works from the bill's own page.
export function BillsPage() {
  const currency = useCurrency();
  const profile = useProfile();
  const bills = useBills();
  const [sheetOpen, setSheetOpen] = useState(false);

  const today = todayInZone(profile.data?.timezone);
  const rows = (bills.data ?? []).filter((bill) => !bill.archived_at);
  const due = rows.filter((bill) => dueStateOf(bill.next_due_on, today) !== 'later');
  const later = rows.filter((bill) => dueStateOf(bill.next_due_on, today) === 'later');
  const archived = (bills.data ?? []).filter((bill) => bill.archived_at);
  const overdue = due.filter((bill) => dueStateOf(bill.next_due_on, today) === 'overdue').length;
  const varies = due.filter((bill) => bill.amount_is_variable).length;
  // A handful of already-stored amounts, added for display: the same kind of
  // total the budget summary shows.
  const dueTotal = due.reduce((sum, bill) => sum + bill.amount_minor, 0);
  const next = later[0];

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1 className="large-title">Bills</h1>
          <p className="footnote flush">Bills and subscriptions, with what’s due next.</p>
        </div>
        <Button onClick={() => setSheetOpen(true)}>Add bill</Button>
      </header>

      {bills.isError && <Notice tone="err">{dataErrorMessage(bills.error)}</Notice>}
      {bills.isPending && <p className="secondary">Loading your bills…</p>}

      {bills.isSuccess && rows.length === 0 && (
        <EmptyState
          icon={CalendarClock}
          title="No bills yet"
          action={<Button onClick={() => setSheetOpen(true)}>Add a bill</Button>}
        >
          Add the things that come round: rent, a subscription, anything with a due date. Marking one paid records the
          transaction and moves the date on.
        </EmptyState>
      )}

      {rows.length > 0 &&
        (due.length > 0 ? (
          <section className="group figure-group">
            <h2 className="caption">Due in the next 7 days</h2>
            <p className="fig flush">
              <span className="bracket">
                <Amount minor={dueTotal} currency={currency} />
              </span>
            </p>
            <p className="footnote flush">
              {due.length} {due.length === 1 ? 'bill' : 'bills'}
              {overdue > 0 && ` · ${overdue} overdue`}
              {varies > 0 && ` · ${varies === 1 ? 'one amount varies' : `${varies} amounts vary`}, so this is an estimate`}
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
              </p>
            </section>
          )
        ))}

      {due.length > 0 && (
        <section>
          <h2 className="form-group-title">Next 7 days</h2>
          <ul className="rows-list">
            {due.map((bill) => (
              <DueRow key={bill.id} bill={bill} today={today} currency={currency} />
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
                <Link to={billPath(bill.id)} className="row-button">
                  <BillLabel bill={bill} />
                  <BillFigures bill={bill} today={today} currency={currency} />
                </Link>
              </li>
            ))}
          </ul>
        </section>
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

      {sheetOpen && <BillSheet onClose={() => setSheetOpen(false)} />}
    </div>
  );
}

type Currency = Parameters<typeof Amount>[0]['currency'];

function BillLabel({ bill }: { bill: RecurringItem }) {
  return (
    <span className="row-label">
      {bill.name}
      <small>
        {LABEL_TEXT[bill.label]} · {describeSchedule(bill.cadence_unit, bill.cadence_interval)} ·{' '}
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
      <Amount minor={bill.amount_minor} currency={currency} />
      <small className={state === 'overdue' ? 'due-overdue' : state === 'today' ? 'due-today' : undefined}>
        {describeDue(bill.next_due_on, today)}
      </small>
    </span>
  );
}

// A bill due this week: the row opens the bill, and marking it paid happens
// beside it. On a wide screen the action sits on the same line.
function DueRow({ bill, today, currency }: { bill: RecurringItem; today: string; currency: Currency }) {
  return (
    <li className="bill-row">
      <Link to={billPath(bill.id)} className="row-button bill-main">
        <BillLabel bill={bill} />
        <BillFigures bill={bill} today={today} currency={currency} />
      </Link>
      <MarkPaid bill={bill} today={today} />
    </li>
  );
}
