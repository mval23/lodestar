import { Link } from 'react-router';
import type { Currency } from '../lib/money';
import { addDays } from '../lib/calendar';
import { formatDateShort } from '../lib/dates';
import { Amount } from './Amount';

// What comes round in the next 30 days, in four columns: three weeks of
// seven days from today, then the rest. Each column lists its bills,
// subscriptions, expected income and planned transfers by date, and closes
// on its totals, summed in Postgres. A date already past and still unpaid
// opens the first column, marked overdue. Transfers are listed but counted
// in neither total: they only move money between your accounts.

export type StripItem = {
  recurring_item_id: string;
  name: string;
  kind: 'expense' | 'income' | 'transfer';
  due_on: string;
  amount_minor: number;
  amount_is_variable: boolean;
  overdue: boolean;
  week: number;
  week_bills_minor: number;
  week_in_minor: number;
};

const WEEKS = [0, 1, 2, 3] as const;

function rangeOf(today: string, week: number, days: number): string {
  const from = addDays(today, week * 7);
  const to = addDays(today, week === 3 ? days - 1 : week * 7 + 6);
  const a = formatDateShort(from);
  const b = formatDateShort(to);
  // "Sep 25 – Oct 1", or "Oct 2 – 8" within one month.
  return from.slice(0, 7) === to.slice(0, 7) ? `${a} – ${b.split(' ')[1]}` : `${a} – ${b}`;
}

export function WeekStrip({
  items,
  today,
  currency,
  linkFor,
  days = 30,
}: {
  items: StripItem[];
  today: string;
  currency: Currency;
  linkFor: (id: string) => string;
  days?: number;
}) {
  return (
    <div className="week-strip">
      {WEEKS.map((week) => {
        const rows = items.filter((i) => i.week === week);
        const label = rangeOf(today, week, days);
        const bills = rows[0]?.week_bills_minor ?? 0;
        const income = rows[0]?.week_in_minor ?? 0;
        return (
          <section key={week} className="week-col" aria-label={label}>
            <h3 className="caption week-head">{label}</h3>
            {rows.length === 0 ? (
              <p className="footnote flush">Nothing due</p>
            ) : (
              <ul className="week-items">
                {rows.map((item) => (
                  <li key={`${item.recurring_item_id}-${item.due_on}`}>
                    <span className={`week-date${item.overdue ? ' due-overdue' : ''}`}>
                      {item.overdue ? 'Overdue' : formatDateShort(item.due_on)}
                    </span>
                    <span className="week-name">
                      <Link className="plain-link" to={linkFor(item.recurring_item_id)}>
                        {item.name}
                      </Link>
                      {item.kind === 'transfer' && <small> · transfer</small>}
                    </span>
                    <span className={`week-amount num${item.kind === 'income' ? ' strong' : ''}`}>
                      {item.amount_is_variable && <small>about </small>}
                      <Amount minor={item.amount_minor} currency={currency} signed={item.kind === 'income'} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <p className="footnote flush week-total">
              {bills > 0 ? (
                <>
                  <Amount minor={bills} currency={currency} /> of bills
                </>
              ) : (
                'No bills'
              )}
              {income > 0 && (
                <>
                  {' · '}
                  <Amount minor={income} currency={currency} signed /> in
                </>
              )}
            </p>
          </section>
        );
      })}
    </div>
  );
}
