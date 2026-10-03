import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { useCurrency } from '../../lib/profile';
import { addMonths, formatDate, formatDateShort } from '../../lib/dates';
import { addMonthsClamped } from '../../lib/calendar';
import { share } from '../../lib/percent';
import { billPath } from '../../lib/routes';
import { recurringFindings } from '../../lib/standsOut';
import { Amount } from '../../ui/Amount';
import { Button } from '../../ui/Button';
import { Notice } from '../../ui/Notice';
import { ScrollTable } from '../../ui/ScrollTable';
import { StackedMonthBars } from '../../ui/StackedMonthBars';
import { dataErrorMessage } from '../auth/errors';
import { BillSheet, type BillPrefill } from '../bills/BillSheet';
import { describeSchedule, useBills } from '../bills/queries';
import { useCategories } from '../categories/queries';
import { monthsBetween, rangeLabel } from './filters';
import { reportsKey, useFixedFlexible, usePossibleRecurring, useRecurringCosts, type PossibleRecurring } from './queries';
import { ReportClosing, ReportHead, useReportRange } from './ReportParts';

// Recurring payments: what the bills and subscriptions you set up cost a
// year, how much of spending goes through them, and expenses that repeat
// like a bill but aren't one. A possible one becomes a bill only when you
// set it up; nothing here is created by itself.

export function RecurringReportPage() {
  const currency = useCurrency();
  const report = useReportRange();
  const { range, accountIds } = report;
  const queryClient = useQueryClient();
  const costs = useRecurringCosts();
  const split = useFixedFlexible(range.from, range.to, accountIds);
  const possible = usePossibleRecurring(range.from);
  const bills = useBills();
  const categories = useCategories();
  const [setUp, setSetUp] = useState<BillPrefill | null>(null);

  const catName = useMemo(() => new Map((categories.data ?? []).map((c) => [c.id, c.name])), [categories.data]);
  const billOf = useMemo(() => new Map((bills.data ?? []).map((b) => [b.id, b])), [bills.data]);
  const rows = (costs.data ?? []).filter((c) => billOf.has(c.recurring_item_id));
  const first = costs.data?.[0];
  const subscriptions = rows.filter((r) => billOf.get(r.recurring_item_id)?.label === 'subscription').length;
  const months = Array.from({ length: monthsBetween(range.from, range.to) }, (_, i) => addMonths(range.from, i));
  const splitRows = split.data ?? [];
  const found = possible.data ?? [];
  const largest = rows[0] ? { name: billOf.get(rows[0].recurring_item_id)!.name, yearly_minor: rows[0].yearly_minor } : null;
  const error = costs.error ?? split.error ?? possible.error;

  return (
    <div className="page">
      <ReportHead
        back={report.search}
        title="Recurring payments"
        subtitle={`Bills and subscriptions at their yearly cost · payment history ${rangeLabel(range)}`}
      />

      {error && <Notice tone="err">{dataErrorMessage(error)}</Notice>}
      {(!costs.data || !split.data) && !error && <p className="secondary">Working out your figures…</p>}

      {costs.data && split.data && (
        <>
          <section className="group fig-band" aria-label="Recurring payments">
            <div className="fig-cell">
              <h2 className="caption">Bills and subscriptions</h2>
              <p className="fig flush">
                <span className="bracket">
                  <Amount minor={first?.total_yearly_minor ?? 0} currency={currency} />
                </span>
              </p>
              <p className="footnote flush">
                a year · {rows.length} set up · <Amount minor={first?.total_monthly_minor ?? 0} currency={currency} /> a month
              </p>
            </div>
            <div className="fig-cell">
              <h2 className="caption">Paid through bills</h2>
              <p className="card-figure flush">
                {splitRows[0] ? share(splitRows[0].fixed_total_minor, splitRows[0].all_total_minor) : '—'}
              </p>
              <p className="footnote flush">of all spending, {rangeLabel(range)}</p>
            </div>
            <div className="fig-cell">
              <h2 className="caption">Subscriptions only</h2>
              <p className="card-figure flush">
                <Amount minor={first?.subscriptions_yearly_minor ?? 0} currency={currency} />
              </p>
              <p className="footnote flush">a year · {subscriptions} set up</p>
            </div>
            <div className="fig-cell">
              <h2 className="caption">
                Possible recurring <span className="estimate-tag">Estimate</span>
              </h2>
              <p className="card-figure flush">{found.length} found</p>
              <p className="footnote flush">
                {found[0] ? (
                  <>
                    <Amount minor={found[0].found_yearly_minor} currency={currency} /> a year if they continue
                  </>
                ) : (
                  'Nothing else repeats like a bill'
                )}
              </p>
            </div>
          </section>

          <div className="report-pair wide-left">
            <div className="stack">
              <StackedMonthBars
                title="Fixed and flexible spending, by month"
                caption="Fixed: expenses recorded with “Mark as paid” on a bill or subscription."
                months={months}
                series={[
                  { key: 'fixed', label: 'Bills and subscriptions', tone: 'ink', values: new Map(splitRows.map((m) => [m.month, m.fixed_minor])) },
                  { key: 'flexible', label: 'Everything else', tone: 'fixed', values: new Map(splitRows.map((m) => [m.month, m.flexible_minor])) },
                ]}
                totals={new Map(splitRows.map((m) => [m.month, m.total_minor]))}
                currency={currency}
                currentMonth={months[months.length - 1] ?? ''}
              />
              <section className="group stack-tight" aria-labelledby="recurring-items">
                <h2 className="headline" id="recurring-items">
                  Set up in Bills
                </h2>
                {rows.length === 0 ? (
                  <p className="secondary flush">
                    No bills or subscriptions yet. <Link to="/bills">Add one</Link>
                  </p>
                ) : (
                  <ScrollTable label="Bills and subscriptions table">
                    <table className="ledger compact">
                      <thead>
                        <tr>
                          <th scope="col">Name</th>
                          <th scope="col">Type</th>
                          <th scope="col">Schedule</th>
                          <th scope="col" className="num">
                            Amount
                          </th>
                          <th scope="col" className="num">
                            A year
                          </th>
                          <th scope="col" className="num">
                            Last paid
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((r) => {
                          const bill = billOf.get(r.recurring_item_id)!;
                          return (
                            <tr key={r.recurring_item_id}>
                              <th scope="row">
                                <Link to={billPath(bill.id)}>{bill.name}</Link>
                              </th>
                              <td className="secondary">{bill.label === 'subscription' ? 'Subscription' : 'Bill'}</td>
                              <td className="secondary">{describeSchedule(bill.cadence_unit, bill.cadence_interval)}</td>
                              <td className="num">
                                {bill.amount_is_variable && 'about '}
                                <Amount minor={bill.amount_minor} currency={currency} />
                              </td>
                              <td className="num">
                                <Amount minor={r.yearly_minor} currency={currency} />
                                {bill.amount_is_variable && <span className="estimate-tag varies-tag">Varies</span>}
                              </td>
                              <td className="num secondary">{r.last_paid_on ? formatDate(r.last_paid_on) : '—'}</td>
                            </tr>
                          );
                        })}
                        <tr className="ledger-total">
                          <th scope="row">Total</th>
                          <td />
                          <td />
                          <td className="num">
                            <Amount minor={first?.total_monthly_minor ?? 0} currency={currency} /> /mo
                          </td>
                          <td className="num">
                            <Amount minor={first?.total_yearly_minor ?? 0} currency={currency} />
                          </td>
                          <td />
                        </tr>
                      </tbody>
                    </table>
                  </ScrollTable>
                )}
              </section>
            </div>

            <section className="group stack-tight" aria-labelledby="recurring-possible">
              <div>
                <h2 className="headline" id="recurring-possible">
                  Possible recurring payments
                </h2>
                <p className="footnote flush">Expenses not linked to a bill whose description comes back month after month. Not confirmed.</p>
              </div>
              {found.length === 0 ? (
                <p className="secondary flush">Nothing else repeats like a bill.</p>
              ) : (
                <ul className="possible-list">
                  {found.map((p) => (
                    <PossibleLine key={p.description} item={p} category={p.category_id ? catName.get(p.category_id) : undefined} onSetUp={setSetUp} />
                  ))}
                </ul>
              )}
            </section>
          </div>

          <ReportClosing
            currency={currency}
            findings={recurringFindings(first?.total_yearly_minor ?? 0, largest, {
              found: found.length,
              yearly_minor: found[0]?.found_yearly_minor ?? 0,
            })}
            about={[
              'Possible payments match the exact description, at least 3 months in a row, each within 10% of the usual amount.',
              'A bill whose amount varies costs what was paid for it in the last 12 months.',
              'Loan payments are transfers, not spending, so they are left out.',
            ]}
          />
        </>
      )}

      {setUp && (
        <BillSheet
          prefill={setUp}
          onClose={() => {
            setSetUp(null);
            // A bill named like the payment takes it off the possible list.
            void queryClient.invalidateQueries({ queryKey: reportsKey });
          }}
        />
      )}
    </div>
  );
}

function PossibleLine({
  item,
  category,
  onSetUp,
}: {
  item: PossibleRecurring;
  category: string | undefined;
  onSetUp: (prefill: BillPrefill) => void;
}) {
  const currency = useCurrency();
  return (
    <li>
      <div className="possible-head">
        <span>
          <strong>{item.description}</strong>
          {category && <small> · {category}</small>}
        </span>
        <span className={`confidence confidence-${item.confidence}`}>
          {item.confidence === 'high' ? 'High confidence' : 'Medium confidence'}
        </span>
      </div>
      <p className="footnote flush">
        Monthly · {item.run_months} months in a row, {item.months_seen} in all, about the same amount
      </p>
      <div className="possible-figures">
        <span>
          Typical <Amount minor={item.typical_minor} currency={currency} />
        </span>
        <span>
          A year <strong><Amount minor={item.yearly_minor} currency={currency} /></strong>
        </span>
        <span className="secondary">Last {formatDateShort(item.last_on)}</span>
        <Button
          variant="plain"
          onClick={() =>
            onSetUp({
              name: item.description,
              label: 'bill',
              amount_minor: item.typical_minor,
              from_account_id: item.account_id,
              category_id: item.category_id,
              // A month after the last one, clamped to a shorter month.
              next_due_on: addMonthsClamped(item.last_on, 1),
            })
          }
        >
          Set up as a bill
        </Button>
      </div>
    </li>
  );
}
