import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { ArrowDown, ArrowUp, CircleAlert, CircleCheck, Info } from 'lucide-react';
import { useCurrency, useProfile } from '../../lib/profile';
import { formatMoney } from '../../lib/money';
import { addMonths, formatDate, formatDateShort, formatMonth, formatMonthShort, monthStartInZone, todayInZone } from '../../lib/dates';
import { percentChange, share } from '../../lib/percent';
import { accountPath, categoryPath, isUuid } from '../../lib/routes';
import { billFindings } from '../../lib/standsOut';
import { Amount } from '../../ui/Amount';
import { Button } from '../../ui/Button';
import { DetailHeader, DetailNotFound, SectionHead } from '../../ui/Detail';
import { MonthBars } from '../../ui/MonthChart';
import { Notice } from '../../ui/Notice';
import { StandsOut } from '../../ui/StandsOut';
import { dataErrorMessage } from '../auth/errors';
import { useAccounts } from '../accounts/queries';
import { useCategories } from '../categories/queries';
import { useRecurringCosts } from '../reports/queries';
import { ActivityRows, signedAmount, type ActivityRow } from '../transactions/DetailActivity';
import { BillSheet } from './BillSheet';
import { MarkPaid } from './MarkPaid';
import {
  describeDue,
  describeSchedule,
  dueStateOf,
  perYear,
  useBill,
  useBillHistory,
  useBillMonths,
  useBillPayments,
  type RecurringItem,
} from './queries';

// A bill as a dashboard: when it is next due, what a year of it costs and
// its share of all bills and of a typical month, its price changes, and the
// months it fell due with nothing paid, judged against the current schedule
// (past schedules aren't stored). Figures come from recurring_item_history,
// recurring_costs and recurring_item_months.

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

// Two years of history: enough to see a yearly bill twice.
const HISTORY_MONTHS = 24;

function BillDetail({ bill }: { bill: RecurringItem }) {
  const currency = useCurrency();
  const profile = useProfile();
  const thisMonth = monthStartInZone(profile.data?.timezone);
  const today = todayInZone(profile.data?.timezone);
  const history = useBillHistory(bill.id, HISTORY_MONTHS);
  const months = useBillMonths(bill.id, addMonths(thisMonth, -11));
  const costs = useRecurringCosts();
  const payments = useBillPayments(bill.id);
  const accounts = useAccounts();
  const categories = useCategories();
  const [editing, setEditing] = useState(false);

  const rows = history.data ?? [];
  const accName = (id: string | null) => (accounts.data ?? []).find((a) => a.account_id === id)?.name;
  const category = (categories.data ?? []).find((c) => c.id === bill.category_id);
  const incoming = bill.kind === 'income';
  const expense = bill.kind === 'expense';
  const account = incoming ? bill.to_account_id : bill.from_account_id;

  // A year of it: Postgres's figure for a bill or subscription (what was
  // paid when the amount varies); otherwise the amount times how often it
  // comes round, an estimate when the interval doesn't divide the year.
  const cost = (costs.data ?? []).find((c) => c.recurring_item_id === bill.id);
  const base = bill.cadence_unit === 'week' ? 52 : bill.cadence_unit === 'month' ? 12 : 1;
  const exact = base % bill.cadence_interval === 0;
  const timesAYear = Math.round(perYear(bill.cadence_unit, bill.cadence_interval));
  const yearly =
    cost?.yearly_minor ??
    (exact ? bill.amount_minor * (base / bill.cadence_interval) : Math.round(bill.amount_minor * perYear(bill.cadence_unit, bill.cadence_interval)));
  const totalYearly = cost?.total_yearly_minor ?? 0;
  const typical = rows[0]?.typical_month_minor ?? null;
  const paidYear = (months.data ?? []).reduce((sum, m) => sum + m.paid_minor, 0);
  const paidCount = (months.data ?? []).reduce((sum, m) => sum + m.payment_count, 0);

  // Price changes: a payment that differs from the one before it. A bill
  // whose amount varies changes every time, so none are called out.
  const changes = bill.amount_is_variable
    ? []
    : rows.filter((r) => r.change_minor !== null && r.change_minor !== 0 && r.from_minor !== null && r.last_minor !== null);
  const missed = rows.filter((r) => r.status === 'missed');
  const short = rows.filter((r) => r.status === 'short');
  const monthsDue = rows[0]?.months_due ?? 0;
  const monthsPaid = rows[0]?.months_paid ?? 0;
  const firstDue = rows.find((r) => r.due_count > 0)?.month ?? null;
  const lastChange = changes[changes.length - 1];

  const shareOfMonth = expense && typical ? share(yearly, typical * 12) : null;
  const paymentRows: ActivityRow[] = (payments.data?.rows ?? []).map((row) => ({
    id: row.id,
    occurred_on: row.occurred_on,
    description: row.description,
    detail: accName(incoming ? row.to_account_id : row.from_account_id) ?? '',
    amount: row.kind === 'transfer' ? row.amount_minor : signedAmount(row),
    signed: row.kind === 'income',
    kind: row.kind,
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
            {bill.archived_at && ' · Archived'}
          </>
        }
        actions={
          <Button variant="secondary" onClick={() => setEditing(true)}>
            Edit
          </Button>
        }
      />

      {history.isError && <Notice tone="err">{dataErrorMessage(history.error)}</Notice>}
      {history.data && (
        <StandsOut
          currency={currency}
          findings={billFindings({
            name: bill.name,
            share_of_month: shareOfMonth,
            last_change: lastChange ? { month: formatMonth(lastChange.month), change_minor: lastChange.change_minor! } : null,
            missed: missed.length,
            months_due: monthsDue,
          })}
        />
      )}

      <section className="group fig-band" aria-label="This bill">
        <div className="fig-cell">
          <h2 className="caption">{incoming ? 'Next arriving' : 'Next due'}</h2>
          <p className="fig flush">
            <span className="bracket">{formatDateShort(bill.next_due_on)}</span>
          </p>
          <p className="footnote flush">
            <span className={dueStateOf(bill.next_due_on, today) === 'overdue' ? 'due-overdue' : undefined}>
              {describeDue(bill.next_due_on, today)}
            </span>
            {' · '}
            {bill.amount_is_variable && 'about '}
            <Amount minor={bill.amount_minor} currency={currency} />
            {account && bill.kind !== 'transfer' && (
              <>
                {incoming ? ' into ' : ' from '}
                <Link to={accountPath(account)}>{accName(account) ?? 'an account'}</Link>
              </>
            )}
            {bill.kind === 'transfer' && bill.from_account_id && (
              <>
                {' from '}
                <Link to={accountPath(bill.from_account_id)}>{accName(bill.from_account_id) ?? 'an account'}</Link>
              </>
            )}
          </p>
        </div>
        <div className="fig-cell">
          <h2 className="caption">A year of it</h2>
          <p className="card-figure flush">
            <Amount minor={yearly} currency={currency} />
          </p>
          <p className="footnote flush">
            {bill.amount_is_variable && cost
              ? 'What was paid in the last 12 months; the amount varies'
              : `${describeSchedule(bill.cadence_unit, bill.cadence_interval)}, ${exact ? '' : 'about '}${timesAYear} ${timesAYear === 1 ? 'payment' : 'payments'}`}
          </p>
        </div>
        {expense ? (
          <>
            <div className="fig-cell">
              <h2 className="caption">Share of bills</h2>
              <p className="card-figure flush">{cost && totalYearly > 0 ? share(yearly, totalYearly) : '—'}</p>
              <p className="footnote flush">
                {cost ? (
                  <>
                    of <Amount minor={totalYearly} currency={currency} /> a year in bills and subscriptions
                  </>
                ) : (
                  'Archived bills aren’t counted'
                )}
              </p>
            </div>
            <div className="fig-cell">
              <h2 className="caption">Share of a typical month</h2>
              <p className="card-figure flush">{shareOfMonth ?? '—'}</p>
              <p className="footnote flush">
                {typical ? (
                  <>
                    of <Amount minor={typical} currency={currency} /> spent in a typical month
                  </>
                ) : (
                  'Needs a complete month of spending'
                )}
              </p>
            </div>
          </>
        ) : (
          <>
            <div className="fig-cell">
              <h2 className="caption">{incoming ? 'Received, last 12 months' : 'Moved, last 12 months'}</h2>
              <p className="card-figure flush">
                <Amount minor={paidYear} currency={currency} />
              </p>
              <p className="footnote flush">
                {paidCount} {paidCount === 1 ? 'time' : 'times'}
              </p>
            </div>
            <div className="fig-cell">
              <h2 className="caption">On time</h2>
              <p className="card-figure flush">{monthsDue > 0 ? `${monthsPaid} of ${monthsDue}` : '—'}</p>
              <p className="footnote flush">months recorded, judged against the current schedule</p>
            </div>
          </>
        )}
      </section>

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

      <div className="report-pair wide-left">
        <MonthBars
          title={incoming ? 'What arrived, month by month' : 'What it has cost, month by month'}
          caption={
            bill.amount_is_variable
              ? 'What was actually paid, with the current amount as a line. The amount varies, so changes aren’t marked.'
              : `What was actually paid, with the current amount as a line. ${
                  changes.length === 0 ? 'No price changes.' : changes.length === 1 ? 'The one price change is marked.' : 'Price changes are marked; the latest is labelled.'
                }`
          }
          rows={rows.map((r) => ({ month: r.month, value: r.paid_minor }))}
          currency={currency}
          currentMonth={thisMonth}
          tone={incoming ? 'in' : 'out'}
          valueLabel={incoming ? 'Received' : 'Paid'}
          typical={bill.amount_minor}
          typicalLabel={`Current amount ${formatMoney(bill.amount_minor, currency)}`}
          marks={changes.map((c) => ({
            month: c.month,
            label: `${formatMoney(c.change_minor!, currency, { signed: true })} from ${formatMonthShort(c.month)}`,
          }))}
        />

        <section className="group stack-tight" aria-labelledby="bill-changes">
          <div>
            <h2 className="headline" id="bill-changes">
              Changes and gaps
            </h2>
            <p className="footnote flush">Worked out from the payments recorded</p>
          </div>
          {!history.data ? (
            <p className="footnote flush">Loading…</p>
          ) : (
            <ul className="change-list">
              {[...changes].reverse().map((c) => (
                <li key={c.month}>
                  {c.change_minor! > 0 ? <ArrowUp strokeWidth={1.75} aria-hidden /> : <ArrowDown strokeWidth={1.75} aria-hidden />}
                  <span>
                    <strong>
                      {c.change_minor! > 0 ? 'Up ' : 'Down '}
                      <Amount minor={Math.abs(c.change_minor!)} currency={currency} /> from {formatMonth(c.month)}
                    </strong>
                    <small>
                      <Amount minor={c.from_minor!} currency={currency} /> → <Amount minor={c.last_minor!} currency={currency} /> ·{' '}
                      {percentChange(c.last_minor!, c.from_minor!)}
                      {exact && (
                        <>
                          , <Amount minor={Math.abs(c.change_minor! * (base / bill.cadence_interval))} currency={currency} />{' '}
                          {c.change_minor! > 0 ? 'more' : 'less'} a year
                        </>
                      )}
                    </small>
                  </span>
                </li>
              ))}
              {bill.amount_is_variable && (
                <li>
                  <Info strokeWidth={1.75} aria-hidden />
                  <span>
                    <strong>The amount varies</strong>
                    <small>Each payment differs, so no single price change is called out.</small>
                  </span>
                </li>
              )}
              {missed.length > 0 ? (
                <li>
                  <CircleAlert strokeWidth={1.75} aria-hidden />
                  <span>
                    <strong>
                      {missed.length} {missed.length === 1 ? 'month' : 'months'} with no payment
                    </strong>
                    <small>
                      {missed.map((m) => formatMonthShort(m.month)).join(', ')}, judged against the current schedule
                    </small>
                  </span>
                </li>
              ) : monthsDue > 0 ? (
                <li>
                  <CircleCheck strokeWidth={1.75} aria-hidden />
                  <span>
                    <strong>No missed months</strong>
                    <small>
                      {monthsPaid} of {monthsDue} months paid{firstDue ? ` since ${formatMonthShort(firstDue)}` : ''}, judged against the current
                      schedule
                    </small>
                  </span>
                </li>
              ) : (
                <li>
                  <CircleCheck strokeWidth={1.75} aria-hidden />
                  <span>
                    <strong>Nothing due yet</strong>
                    <small>The schedule starts {formatDate(bill.anchor_on)}</small>
                  </span>
                </li>
              )}
              {short.length > 0 && (
                <li>
                  <CircleAlert strokeWidth={1.75} aria-hidden />
                  <span>
                    <strong>Paid fewer times than due</strong>
                    <small>
                      {short.map((m) => `${formatMonthShort(m.month)} (${m.payment_count} of ${m.due_count})`).join(', ')}
                    </small>
                  </span>
                </li>
              )}
            </ul>
          )}
        </section>
      </div>

      <section className="stack" aria-labelledby="bill-history">
        <SectionHead id="bill-history" title="Payment history" />
        <div className="kind-panel">
          {payments.isError && <Notice tone="err">{dataErrorMessage(payments.error)}</Notice>}
          <ActivityRows
            rows={paymentRows}
            caption="Payments recorded for this item, newest first"
            empty="Nothing recorded yet. Marking it paid adds the first one."
          />
        </div>
      </section>

      {editing && <BillSheet bill={bill} onClose={() => setEditing(false)} />}
    </div>
  );
}
