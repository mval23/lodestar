import { Link } from 'react-router';
import type { Currency } from '../../lib/money';
import { billPath } from '../../lib/routes';
import { Notice } from '../../ui/Notice';
import { WeekStrip } from '../../ui/WeekStrip';
import { dataErrorMessage } from '../auth/errors';
import type { AccountBalance } from '../accounts/queries';
import { useBills, useUpcomingItems } from '../bills/queries';
import { TitleLink } from './TitleLink';
import { GoalsGroup, BudgetsGroup, OverviewStandsOut, ThisMonthBand, WhereYouStand } from './Dashboard';

// The Overview on a wide screen: what stands out, then this month in one
// band, then three columns: every budget line by need, where you stand,
// and goals. What is coming up closes the page. A phone gets the same parts
// stacked, with the last two folded away (OverviewPage decides which).

type Props = { accounts: AccountBalance[]; today: string; month: string; currency: Currency };

export function WideOverview({ accounts, today, month, currency }: Props) {
  return (
    <>
      <OverviewStandsOut month={month} currency={currency} />
      <ThisMonthBand accounts={accounts} month={month} currency={currency} />
      <div className="wide-three">
        <BudgetsGroup month={month} currency={currency} />
        <WhereYouStand accounts={accounts} month={month} currency={currency} />
        <GoalsGroup currency={currency} />
      </div>
      <ComingUp today={today} currency={currency} />
    </>
  );
}

// ---------------------------------------------------------------------------
// What comes round in the next 30 days, in four week columns, income and
// planned transfers included. The phone shows the same strip in a fold,
// which carries the title, so the card there goes without its own.
// ---------------------------------------------------------------------------

export function ComingUp({ today, currency, folded = false }: { today: string; currency: Currency; folded?: boolean }) {
  const upcoming = useUpcomingItems(30);
  const bills = useBills();
  const none = upcoming.data?.length === 0;
  const setUp = (bills.data ?? []).some((b) => !b.archived_at);

  return (
    <section
      className={`group wide-group${folded ? ' wide-folded' : ''}`}
      {...(folded ? { 'aria-label': 'Coming up, next 30 days' } : { 'aria-labelledby': 'wide-coming' })}
    >
      {!folded && (
        <div className="wide-head">
          <h2 className="headline" id="wide-coming">
            <TitleLink to="/bills">Coming up · next 30 days</TitleLink>
          </h2>
          <span className="footnote">Bills, subscriptions and expected income you’ve set up</span>
        </div>
      )}
      {upcoming.isError ? (
        <div className="wide-empty">
          <Notice tone="err">{dataErrorMessage(upcoming.error)}</Notice>
        </div>
      ) : !upcoming.data ? (
        <p className="footnote wide-empty">Loading…</p>
      ) : none ? (
        <p className="footnote wide-empty">
          {setUp ? (
            "Nothing is due in the next 30 days."
          ) : (
            <>
              No bills or subscriptions yet. <Link to="/bills">Add one</Link>
            </>
          )}
        </p>
      ) : (
        <WeekStrip items={upcoming.data} today={today} currency={currency} linkFor={billPath} />
      )}
    </section>
  );
}
