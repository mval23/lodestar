import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { useCurrency } from '../../lib/profile';
import { billPath } from '../../lib/routes';
import { addMonths, formatDate, formatDateShort, formatMonth, formatWeekday } from '../../lib/dates';
import { Amount } from '../../ui/Amount';
import { Notice } from '../../ui/Notice';
import { dataErrorMessage } from '../auth/errors';
import { useMonthBillPayments } from '../months/queries';
import { Pencil } from 'lucide-react';
import { MarkPaid } from './MarkPaid';
import {
  describeDue,
  describeSchedule,
  dueStateOf,
  recordAction,
  useMarkBillPaid,
  useUpcomingItems,
  type RecurringItem,
  type TxnKind,
} from './queries';

type Currency = Parameters<typeof Amount>[0]['currency'];
type AccountNames = Map<string, string>;
type KindFilter = 'all' | TxnKind;

const FILTERS: { value: KindFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'expense', label: 'Bills' },
  { value: 'transfer', label: 'Transfers' },
  { value: 'income', label: 'Income' },
];

const DAY = 86_400_000;
const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY);
const addDays = (date: string, days: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);

// The Bills page on a wide screen: one agenda in date order, grouped by day
// for the coming week, with the month beside it. Everything a person pays,
// moves or receives reads top to bottom as the days go; the rail answers
// "how much this week" and "how is the month going". A phone keeps the
// columns, which stack better than a rail.
export function BillsAgenda({
  rows,
  all,
  today,
  month,
  weekStart,
  accountNames,
  summary,
}: {
  // Not archived, soonest first.
  rows: RecurringItem[];
  // Archived ones too, so this month's payments can still be named.
  all: RecurringItem[];
  today: string;
  month: string;
  weekStart: number;
  accountNames: AccountNames;
  // The key figure for the next seven days, as the page words it.
  summary: ReactNode;
}) {
  const currency = useCurrency();
  const [kind, setKind] = useState<KindFilter>('all');
  const [asking, setAsking] = useState<string | null>(null);
  const [status, setStatus] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);

  const shown = kind === 'all' ? rows : rows.filter((bill) => bill.kind === kind);
  const groups = groupByDay(shown, today);

  const recorded = (bill: RecurringItem, nextDueOn: string) => {
    setAsking(null);
    setStatus({
      tone: 'ok',
      text: `${bill.name} recorded. Next ${bill.kind === 'income' ? 'expected' : 'due'} ${formatDate(nextDueOn)}.`,
    });
  };

  // A day picked on the calendar scrolls the agenda to it, showing every kind
  // so the day is there to find.
  const pick = (date: string) => {
    setKind('all');
    const key = groupKey(date, today);
    requestAnimationFrame(() =>
      document.getElementById(`bills-${key}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    );
  };

  return (
    <div className="bills-agenda">
      <div className="agenda-main">
        <div className="segmented agenda-filter" role="radiogroup" aria-label="Show">
          {FILTERS.map((filter) => {
            const count = filter.value === 'all' ? rows.length : rows.filter((bill) => bill.kind === filter.value).length;
            return (
              <label key={filter.value}>
                <input
                  type="radio"
                  name="bills-kind"
                  value={filter.value}
                  checked={kind === filter.value}
                  onChange={() => setKind(filter.value)}
                />
                {filter.label}
                <span className="agenda-count">{count}</span>
              </label>
            );
          })}
        </div>

        {status && <Notice tone={status.tone}>{status.text}</Notice>}

        {shown.length === 0 && (
          <p className="secondary flush">
            Nothing to show here yet. {kind === 'transfer' ? 'Schedule a transfer' : 'Add one'} with the buttons above.
          </p>
        )}

        {groups.map((group) => (
          <section key={group.key} id={`bills-${group.key}`} className="agenda-group" aria-labelledby={`bills-${group.key}-title`}>
            <h2 className="agenda-day" id={`bills-${group.key}-title`}>
              {group.title}
              {group.items.length > 1 && <span className="agenda-count">{group.items.length}</span>}
            </h2>
            <ul className="rows-list agenda-list">
              {group.items.map((bill) => (
                <AgendaRow
                  key={bill.id}
                  bill={bill}
                  today={today}
                  currency={currency}
                  accountNames={accountNames}
                  group={group.key}
                  asking={asking === bill.id}
                  onAsk={(open) => setAsking(open ? bill.id : null)}
                  onRecorded={recorded}
                  onError={(text) => setStatus({ tone: 'err', text })}
                />
              ))}
            </ul>
          </section>
        ))}
      </div>

      <aside className="bills-rail" aria-label="This week and this month">
        {summary}
        <MonthCard all={all} today={today} month={month} weekStart={weekStart} currency={currency} onPick={pick} />
      </aside>
    </div>
  );
}

type Group = { key: string; title: string; items: RecurringItem[] };

// Overdue first, then each of the next seven days that has something, then
// everything later in one group, each row carrying its own date.
function groupKey(date: string, today: string): string {
  const state = dueStateOf(date, today);
  if (state === 'overdue') return 'overdue';
  if (state === 'later') return 'later';
  return `day-${date}`;
}

function groupByDay(rows: RecurringItem[], today: string): Group[] {
  const groups: Group[] = [];
  // Soonest first, then by name, whatever order the rows arrived in.
  const sorted = [...rows].sort((a, b) => a.next_due_on.localeCompare(b.next_due_on) || a.name.localeCompare(b.name));
  for (const bill of sorted) {
    const key = groupKey(bill.next_due_on, today);
    let group = groups.find((g) => g.key === key);
    if (!group) {
      const offset = daysBetween(today, bill.next_due_on);
      const title =
        key === 'overdue'
          ? 'Overdue'
          : key === 'later'
            ? 'Later'
            : offset === 0
              ? `Today · ${formatWeekday(bill.next_due_on)}`
              : offset === 1
                ? `Tomorrow · ${formatWeekday(bill.next_due_on)}`
                : formatWeekday(bill.next_due_on);
      group = { key, title, items: [] };
      groups.push(group);
    }
    group.items.push(bill);
  }
  return groups;
}

function metaOf(bill: RecurringItem, names: AccountNames): string {
  const schedule = describeSchedule(bill.cadence_unit, bill.cadence_interval);
  const from = names.get(bill.from_account_id ?? '');
  const to = names.get(bill.to_account_id ?? '');
  const parts =
    bill.kind === 'transfer'
      ? [`${from ?? 'An account'} → ${to ?? 'an account'}`, schedule]
      : bill.kind === 'income'
        ? [`Into ${to ?? 'an account'}`, schedule]
        : [bill.label === 'subscription' ? 'Subscription' : 'Bill', schedule, from ? `from ${from}` : null];
  if (bill.amount_is_variable) parts.push('amount varies');
  return parts.filter(Boolean).join(' · ');
}

// One line per item. The round check records it at once, unless its amount
// varies, when it opens the amount and date beneath the row first. The
// amount is a button too: it opens the same form for any item, to record a
// different amount or day. Only the coming week can be checked off here;
// anything later is paid from its page.
function AgendaRow({
  bill,
  today,
  currency,
  accountNames,
  group,
  asking,
  onAsk,
  onRecorded,
  onError,
}: {
  bill: RecurringItem;
  today: string;
  currency: Currency;
  accountNames: AccountNames;
  group: string;
  asking: boolean;
  onAsk: (open: boolean) => void;
  onRecorded: (bill: RecurringItem, nextDueOn: string) => void;
  onError: (text: string) => void;
}) {
  const markPaid = useMarkBillPaid();
  const actionable = group !== 'later';
  const tag = bill.kind === 'transfer' ? 'Transfer' : bill.kind === 'income' ? 'Income' : null;
  const when =
    group === 'overdue'
      ? `${formatDateShort(bill.next_due_on)} · ${describeDue(bill.next_due_on, today)}`
      : group === 'later'
        ? formatWeekday(bill.next_due_on)
        : null;

  const record = async () => {
    if (bill.amount_is_variable) {
      onAsk(!asking);
      return;
    }
    if (markPaid.isPending) return;
    try {
      const result = await markPaid.mutateAsync({ id: bill.id, paidOn: today });
      onRecorded(bill, result.next_due_on);
    } catch (cause) {
      onError(dataErrorMessage(cause));
    }
  };

  return (
    <li className="agenda-row">
      {actionable ? (
        <button
          type="button"
          className="record-check"
          aria-label={`${recordAction(bill.kind)}: ${bill.name}`}
          aria-expanded={bill.amount_is_variable ? asking : undefined}
          aria-busy={markPaid.isPending || undefined}
          onClick={record}
        />
      ) : (
        <span className="record-spacer" aria-hidden="true" />
      )}
      <Link to={billPath(bill.id)} className="agenda-link">
        <span className="row-label">
          <span>
            {bill.name}
            {tag && <span className="kind-tag">{tag}</span>}
          </span>
          <small>{metaOf(bill, accountNames)}</small>
        </span>
      </Link>
      {actionable ? (
        <button
          type="button"
          className="agenda-amount agenda-amount-edit"
          aria-label={`Different amount or date: ${bill.name}`}
          aria-expanded={asking}
          onClick={() => onAsk(!asking)}
        >
          <Pencil strokeWidth={1.75} aria-hidden />
          <Amount minor={bill.amount_minor} currency={currency} signed={bill.kind === 'income'} />
        </button>
      ) : (
        <span className="agenda-amount">
          <Amount minor={bill.amount_minor} currency={currency} signed={bill.kind === 'income'} />
        </span>
      )}
      {/* Always there, empty under a day's heading, so amounts line up. */}
      <span className={`agenda-when${group === 'overdue' ? ' due-overdue' : ''}`}>{when}</span>
      {asking && (
        <div className="agenda-ask">
          <MarkPaid
            bill={bill}
            today={today}
            startAsking
            onRecorded={(next) => onRecorded(bill, next)}
            onCancel={() => onAsk(false)}
          />
        </div>
      )}
    </li>
  );
}

type Mark = { kind: TxnKind; done: boolean };

const ISO_DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const isoWeekday = (date: string) => {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return day === 0 ? 7 : day;
};

// The month as a calendar, with a dot on each day something falls due (faded
// once done) and today ringed; and the month so far, kind by kind.
function MonthCard({
  all,
  today,
  month,
  weekStart,
  currency,
  onPick,
}: {
  all: RecurringItem[];
  today: string;
  month: string;
  weekStart: number;
  currency: Currency;
  onPick: (date: string) => void;
}) {
  const monthEnd = addDays(addMonths(month, 1), -1);
  // Every repeat still to come this month, overdue ones included, from
  // Postgres (upcoming_items), and what this month's payments were.
  const upcoming = useUpcomingItems(Math.max(1, daysBetween(today, monthEnd) + 1));
  const payments = useMonthBillPayments(month);
  const kindOf = new Map(all.map((bill) => [bill.id, bill.kind]));

  const marks = new Map<string, Mark[]>();
  const mark = (date: string, entry: Mark) => marks.set(date, [...(marks.get(date) ?? []), entry]);
  for (const payment of payments.data ?? []) {
    const kind = kindOf.get(payment.recurring_item_id);
    if (kind && payment.last_paid_on >= month && payment.last_paid_on <= monthEnd) {
      mark(payment.last_paid_on, { kind, done: true });
    }
  }
  const stillDue = (upcoming.data ?? []).filter((item) => item.due_on <= monthEnd);
  for (const item of stillDue) {
    if (item.due_on >= month) mark(item.due_on, { kind: item.kind, done: false });
  }

  // A handful of stored amounts, added for display: paid so far, and what is
  // still due before the month ends, kind by kind.
  const sum = (kind: TxnKind, list: { kind: TxnKind; minor: number }[]) =>
    list.filter((entry) => entry.kind === kind).reduce((total, entry) => total + entry.minor, 0);
  const paidList = (payments.data ?? []).flatMap((payment) => {
    const kind = kindOf.get(payment.recurring_item_id);
    return kind ? [{ kind, minor: payment.paid_minor }] : [];
  });
  const dueList = stillDue.map((item) => ({ kind: item.kind, minor: item.amount_minor }));
  const lines = (
    [
      ['expense', 'Bills paid'],
      ['transfer', 'Transfers done'],
      ['income', 'Income received'],
    ] as const
  )
    .map(([kind, label]) => {
      const paid = sum(kind, paidList);
      return { kind, label, paid, total: paid + sum(kind, dueList) };
    })
    .filter((line) => line.total > 0);

  const lead = (isoWeekday(month) - weekStart + 7) % 7;
  const days = Array.from({ length: daysBetween(month, monthEnd) + 1 }, (_, i) => addDays(month, i));
  const headers = Array.from({ length: 7 }, (_, i) => ((weekStart - 1 + i) % 7) + 1);

  return (
    <>
      <section className="group month-card" aria-labelledby="bills-month-title">
        <h2 className="headline" id="bills-month-title">
          {formatMonth(month).split(' ')[0]}
        </h2>
        {/* Each day with something on it names itself in full; the grid is
            only how it looks. */}
        <div className="month-cal">
          {headers.map((iso) => (
            <span key={iso} className="month-cal-head" aria-hidden="true">
              {ISO_DAYS[iso - 1]}
            </span>
          ))}
          {Array.from({ length: lead }, (_, i) => (
            <span key={`lead-${i}`} className="month-cal-day blank" aria-hidden="true" />
          ))}
          {days.map((date) => {
              const here = marks.get(date) ?? [];
              const open = here.filter((entry) => !entry.done).length;
              const isToday = date === today;
              const label = `${formatWeekday(date)}${open > 0 ? `, ${open} due` : ''}${here.length > open ? `, ${here.length - open} done` : ''}`;
              const dots = (
                <span className="month-cal-dots" aria-hidden="true">
                  {here.slice(0, 3).map((entry, i) => (
                    <i key={i} className={`dot-${entry.kind}${entry.done ? ' done' : ''}`} />
                  ))}
                </span>
              );
              // A day with something still to do jumps the agenda to it.
              return open > 0 ? (
                <button
                  key={date}
                  type="button"
                  className={`month-cal-day${isToday ? ' today' : ''}`}
                  aria-label={label}
                  aria-current={isToday ? 'date' : undefined}
                  onClick={() => onPick(date)}
                >
                  {Number(date.slice(8))}
                  {dots}
                </button>
              ) : (
                <span
                  key={date}
                  className={`month-cal-day${isToday ? ' today' : ''}`}
                  aria-label={here.length ? label : undefined}
                  aria-current={isToday ? 'date' : undefined}
                >
                  {Number(date.slice(8))}
                  {dots}
                </span>
              );
          })}
        </div>
        <p className="month-cal-legend" aria-hidden="true">
          <span>
            <i className="dot-expense" />
            Bill
          </span>
          <span>
            <i className="dot-transfer" />
            Transfer
          </span>
          <span>
            <i className="dot-income" />
            Income
          </span>
          <span className="faded">Faded: done</span>
        </p>
      </section>

      <section className="group month-so-far" aria-labelledby="bills-so-far-title">
        <h2 className="headline" id="bills-so-far-title">
          This month so far
        </h2>
        {lines.length === 0 && <p className="footnote flush">Nothing falls due this month.</p>}
        {lines.map((line) => (
          <div key={line.kind} className="month-so-far-line">
            <p className="flush">
              <span>{line.label}</span>
              <span className="num secondary">
                <Amount minor={line.paid} currency={currency} signed={line.kind === 'income'} /> of{' '}
                <Amount minor={line.total} currency={currency} signed={line.kind === 'income'} />
              </span>
            </p>
            <div className={`prog${line.kind === 'expense' ? ' spend' : ''}`} role="presentation">
              <i style={{ width: `${line.total > 0 ? Math.min(100, Math.round((line.paid / line.total) * 100)) : 0}%` }} />
            </div>
          </div>
        ))}
      </section>
    </>
  );
}
