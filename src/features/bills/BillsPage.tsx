import { useState } from 'react';
import { CalendarClock } from 'lucide-react';
import { useCurrency, useProfile } from '../../lib/profile';
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

export function BillsPage() {
  const currency = useCurrency();
  const profile = useProfile();
  const bills = useBills();
  const [editing, setEditing] = useState<RecurringItem | undefined>();
  const [sheetOpen, setSheetOpen] = useState(false);

  const today = todayInZone(profile.data?.timezone);
  const rows = (bills.data ?? []).filter((bill) => !bill.archived_at);
  const due = rows.filter((bill) => dueStateOf(bill.next_due_on, today) !== 'later');
  const later = rows.filter((bill) => dueStateOf(bill.next_due_on, today) === 'later');
  const archived = (bills.data ?? []).filter((bill) => bill.archived_at);

  const openSheet = (bill?: RecurringItem) => {
    setEditing(bill);
    setSheetOpen(true);
  };

  return (
    <div className="page page-narrow">
      <header className="page-head">
        <div>
          <h1 className="large-title">Bills</h1>
          <p className="footnote flush">Bills and subscriptions, with what’s due next.</p>
        </div>
        <Button onClick={() => openSheet()}>Add bill</Button>
      </header>

      {bills.isError && <Notice tone="err">{dataErrorMessage(bills.error)}</Notice>}
      {bills.isPending && <p className="secondary">Loading your bills…</p>}

      {bills.isSuccess && rows.length === 0 && (
        <EmptyState
          icon={CalendarClock}
          title="No bills yet"
          action={<Button onClick={() => openSheet()}>Add a bill</Button>}
        >
          Add the things that come round: rent, a subscription, anything with a due date. Marking one paid records the
          transaction and moves the date on.
        </EmptyState>
      )}

      {due.length > 0 && (
        <section>
          <h2 className="form-group-title">Due now</h2>
          <ul className="rows-list">
            {due.map((bill) => (
              <BillRow key={bill.id} bill={bill} today={today} currency={currency} onEdit={() => openSheet(bill)} />
            ))}
          </ul>
        </section>
      )}

      {later.length > 0 && (
        <section>
          <h2 className="form-group-title">Later</h2>
          <ul className="rows-list">
            {later.map((bill) => (
              <BillRow key={bill.id} bill={bill} today={today} currency={currency} onEdit={() => openSheet(bill)} />
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
                <button type="button" className="row-button" onClick={() => openSheet(bill)}>
                  <span className="row-label">
                    {bill.name}
                    <small>Archived</small>
                  </span>
                  <Amount minor={bill.amount_minor} currency={currency} />
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}

      {sheetOpen && <BillSheet bill={editing} onClose={() => setSheetOpen(false)} />}
    </div>
  );
}

function BillRow({
  bill,
  today,
  currency,
  onEdit,
}: {
  bill: RecurringItem;
  today: string;
  currency: Parameters<typeof Amount>[0]['currency'];
  onEdit: () => void;
}) {
  const state = dueStateOf(bill.next_due_on, today);
  return (
    <li className="bill-row">
      <button type="button" className="row-button bill-main" onClick={onEdit}>
        <span className="row-label">
          {bill.name}
          <small>
            {LABEL_TEXT[bill.label]} · {describeSchedule(bill.cadence_unit, bill.cadence_interval)} ·{' '}
            {formatDate(bill.next_due_on)}
            {bill.amount_is_variable && ' · Amount varies'}
          </small>
        </span>
        <span className="bill-figures">
          <Amount minor={bill.amount_minor} currency={currency} />
          <small className={state === 'overdue' ? 'due-overdue' : state === 'today' ? 'due-today' : undefined}>
            {describeDue(bill.next_due_on, today)}
          </small>
        </span>
      </button>
      <MarkPaid bill={bill} today={today} />
    </li>
  );
}
