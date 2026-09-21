import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useCurrency, useProfile } from '../../lib/profile';
import { formatDate, formatDateShort, monthStartInZone, todayInZone } from '../../lib/dates';
import { accountPath, categoryPath, isUuid, lastTwelveMonths } from '../../lib/routes';
import { Amount } from '../../ui/Amount';
import { Button } from '../../ui/Button';
import { DetailHeader, DetailNotFound, Facet, Facets, FigureRow, KeyFigure, SectionHead } from '../../ui/Detail';
import { MonthBars } from '../../ui/MonthChart';
import { Notice } from '../../ui/Notice';
import { dataErrorMessage } from '../auth/errors';
import { useAccounts } from '../accounts/queries';
import { useCategories } from '../categories/queries';
import { ActivityRows, signedAmount, type ActivityRow } from '../transactions/DetailActivity';
import { BillSheet } from './BillSheet';
import { MarkPaid } from './MarkPaid';
import {
  describeDue,
  describeSchedule,
  perYear,
  useBill,
  useBillMonths,
  useBillPayments,
  type RecurringItem,
} from './queries';

const LABEL_TEXT: Record<string, string> = {
  bill: 'Bill',
  subscription: 'Subscription',
  income: 'Income',
  transfer: 'Transfer',
};

export function BillDetailPage() {
  const { id } = useParams();
  const valid = isUuid(id);
  const bill = useBill(valid ? id : undefined);
  const back = { to: '/bills', label: 'Bills' };

  if (!valid || (bill.isSuccess && !bill.data)) return <DetailNotFound what="bill" back={back} />;
  if (bill.isError)
    return (
      <div className="page">
        <Notice tone="err">{dataErrorMessage(bill.error)}</Notice>
      </div>
    );
  if (!bill.data)
    return (
      <div className="page">
        <p className="secondary">Loading the bill…</p>
      </div>
    );
  return <BillDetail bill={bill.data} />;
}

function BillDetail({ bill }: { bill: RecurringItem }) {
  const currency = useCurrency();
  const profile = useProfile();
  const thisMonth = monthStartInZone(profile.data?.timezone);
  const today = todayInZone(profile.data?.timezone);
  const span = lastTwelveMonths(thisMonth);
  const months = useBillMonths(bill.id, span[0]!);
  const payments = useBillPayments(bill.id);
  const accounts = useAccounts();
  const categories = useCategories();
  const [editing, setEditing] = useState(false);

  const byMonth = useMemo(() => new Map((months.data ?? []).map((m) => [m.month, m])), [months.data]);
  const series = span.map((month) => ({ month, value: byMonth.get(month)?.paid_minor ?? 0 }));
  const paidYear = (months.data ?? []).reduce((sum, m) => sum + m.paid_minor, 0);
  const paidCount = (months.data ?? []).reduce((sum, m) => sum + m.payment_count, 0);
  const lastPaid = (months.data ?? []).reduce((latest, m) => (m.last_paid_on > latest ? m.last_paid_on : latest), '');
  const accName = (id: string | null) => (accounts.data ?? []).find((a) => a.account_id === id)?.name;
  const category = (categories.data ?? []).find((c) => c.id === bill.category_id);
  const incoming = bill.kind === 'income';

  // Occurrences a year: exact for most schedules, an estimate when the
  // interval does not divide the year evenly (every 5 weeks, say).
  const base = bill.cadence_unit === 'week' ? 52 : bill.cadence_unit === 'month' ? 12 : 1;
  const exact = base % bill.cadence_interval === 0;
  const yearly = exact
    ? bill.amount_minor * (base / bill.cadence_interval)
    : Math.round(bill.amount_minor * perYear(bill.cadence_unit, bill.cadence_interval));

  const account = incoming ? bill.to_account_id : bill.from_account_id;

  const rows: ActivityRow[] = (payments.data?.rows ?? []).map((row) => ({
    id: row.id,
    occurred_on: row.occurred_on,
    description: row.description,
    detail: '',
    amount: row.kind === 'transfer' ? row.amount_minor : signedAmount(row),
    signed: row.kind === 'income',
  }));

  return (
    <div className="page">
      <DetailHeader
        back={{ to: '/bills', label: 'Bills' }}
        title={bill.name}
        subtitle={
          <>
            {LABEL_TEXT[bill.label]} · {describeSchedule(bill.cadence_unit, bill.cadence_interval)}
            {category && (
              <>
                {' · '}
                <Link to={categoryPath(category.id)}>{category.name}</Link>
              </>
            )}
            {bill.kind === 'transfer' && bill.to_account_id && (
              <>
                {' · To '}
                <Link to={accountPath(bill.to_account_id)}>{accName(bill.to_account_id) ?? 'an account'}</Link>
              </>
            )}
            {account && bill.kind !== 'transfer' && (
              <>
                {incoming ? ' · Into ' : ' · Paid from '}
                <Link to={accountPath(account)}>{accName(account) ?? 'an account'}</Link>
              </>
            )}
            {bill.kind === 'transfer' && bill.from_account_id && (
              <>
                {' · From '}
                <Link to={accountPath(bill.from_account_id)}>{accName(bill.from_account_id) ?? 'an account'}</Link>
              </>
            )}
            {bill.archived_at && ' · Archived'}
          </>
        }
        actions={
          <Button variant="secondary" onClick={() => setEditing(true)}>
            Edit
          </Button>
        }
      />

      <FigureRow>
        <KeyFigure
          label={incoming ? 'Next arriving' : 'Next due'}
          footnote={
            <>
              {formatDate(bill.next_due_on)} · {describeDue(bill.next_due_on, today)}
              {bill.amount_is_variable && ' · The amount varies'}
            </>
          }
        >
          <Amount minor={bill.amount_minor} currency={currency} />
        </KeyFigure>
        <Facets label="Over a year">
          <Facet label="A year of it" note={exact ? undefined : 'About; the schedule doesn’t divide the year evenly'}>
            <Amount minor={yearly} currency={currency} />
          </Facet>
          <Facet label={incoming ? 'Received, last 12 months' : 'Paid, last 12 months'} note={`${paidCount} ${paidCount === 1 ? 'payment' : 'payments'}`}>
            <Amount minor={paidYear} currency={currency} />
          </Facet>
          <Facet label="Last time">{lastPaid ? formatDateShort(lastPaid) : '—'}</Facet>
        </Facets>
      </FigureRow>

      {!bill.archived_at && (
        <ul className="rows-list mark-paid-row">
          <li className="bill-row">
            <span className="row-label">
              Record this {incoming ? 'arrival' : 'payment'}
              <small>Adds the transaction and moves the date on, in one step</small>
            </span>
            <MarkPaid bill={bill} today={today} />
          </li>
        </ul>
      )}

      {months.isError && <Notice tone="err">{dataErrorMessage(months.error)}</Notice>}
      <MonthBars
        title={incoming ? 'What arrived, month by month' : 'What it has cost, month by month'}
        caption="What was actually paid. A step in the bars is a price change."
        rows={series}
        currency={currency}
        currentMonth={thisMonth}
        tone={incoming ? 'in' : 'out'}
        valueLabel={incoming ? 'Received' : 'Paid'}
      />

      <section className="stack" aria-labelledby="bill-history">
        <SectionHead id="bill-history" title="Payment history" />
        <div className="kind-panel">
          {payments.isError && <Notice tone="err">{dataErrorMessage(payments.error)}</Notice>}
          <ActivityRows
            rows={rows}
            caption="Payments recorded for this item, newest first"
            empty="Nothing recorded yet. Marking it paid adds the first one."
          />
        </div>
      </section>

      {editing && <BillSheet bill={bill} onClose={() => setEditing(false)} />}
    </div>
  );
}
