import { Link } from 'react-router';
import type { Currency } from '../../lib/money';
import { billPath } from '../../lib/routes';
import { Amount } from '../../ui/Amount';
import type { AccountBalance } from '../accounts/queries';
import { describeDue, dueStateOf, useBills } from '../bills/queries';
import { GoalsGroup, NeedsALook, OverviewStandsOut, ThisMonthBand, WhereYouStand } from './Dashboard';

// The Overview on a wide screen: what stands out, then this month in one
// band, then three columns: the budgets that need a look, where you stand,
// and goals. What is coming up closes the page. A phone gets the same parts
// stacked, with the last two folded away (OverviewPage decides which).

type Props = { accounts: AccountBalance[]; today: string; month: string; currency: Currency };

export function WideOverview({ accounts, today, month, currency }: Props) {
  return (
    <>
      <OverviewStandsOut month={month} currency={currency} />
      <ThisMonthBand accounts={accounts} month={month} currency={currency} />
      <div className="wide-three">
        <NeedsALook month={month} currency={currency} />
        <WhereYouStand accounts={accounts} month={month} currency={currency} />
        <GoalsGroup currency={currency} />
      </div>
      <ComingUp today={today} currency={currency} />
    </>
  );
}

// ---------------------------------------------------------------------------
// What comes round next, soonest first, income included.
// ---------------------------------------------------------------------------

const COMING_SHOWN = 5;

function ComingUp({ today, currency }: { today: string; currency: Currency }) {
  const bills = useBills();
  const rows = (bills.data ?? []).filter((bill) => !bill.archived_at).slice(0, COMING_SHOWN);

  return (
    <section className="group wide-group" aria-labelledby="wide-coming">
      <div className="wide-head">
        <h2 className="headline" id="wide-coming">
          Coming up
        </h2>
        <Link className="footnote" to="/bills">
          All bills
        </Link>
      </div>
      {bills.isPending ? (
        <p className="footnote wide-empty">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="footnote wide-empty">No bills or subscriptions yet.</p>
      ) : (
        rows.map((bill) => {
          const state = dueStateOf(bill.next_due_on, today);
          return (
            <div key={bill.id} className="wide-row">
              <span className="row-label">
                <Link className="plain-link" to={billPath(bill.id)}>
                  {bill.name}
                </Link>
                <small className={state === 'overdue' ? 'due-overdue' : state === 'today' ? 'due-today' : undefined}>
                  {describeDue(bill.next_due_on, today)}
                  {bill.amount_is_variable && ' · amount varies'}
                </small>
              </span>
              <Amount minor={bill.amount_minor} currency={currency} signed={bill.kind === 'income'} />
            </div>
          );
        })
      )}
    </section>
  );
}
