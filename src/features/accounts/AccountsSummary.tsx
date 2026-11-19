import type { Currency } from '../../lib/money';
import { describeMoney } from '../../lib/money';
import { formatMonth } from '../../lib/dates';
import { Amount } from '../../ui/Amount';
import { Comparison } from '../../ui/Comparison';
import { Sparkline } from '../../ui/Sparkline';
import type { NetWorthMonth } from '../reports/queries';
import { netWorthOf, type AccountBalance } from './queries';
import { ASSET_GROUPS } from './groups';

// The top of the Accounts page: net worth with its one bracket, how far it
// moved since last month's end, its line over the last year, and where it
// sits. A card paid past zero is money in credit, not a negative debt, so the
// footnote changes its words rather than its sign.
export function AccountsSummary({
  accounts,
  trend,
  since,
  currency,
}: {
  accounts: AccountBalance[];
  // Net worth at each month end, oldest first, ending with this month.
  trend: NetWorthMonth[];
  // Last month's end, as "Oct 31".
  since: string;
  currency: Currency;
}) {
  const worth = netWorthOf(accounts);
  const points = trend.map((m) => m.net_worth_minor);
  const lastMonth = trend.length >= 2 ? trend[trend.length - 2] : undefined;

  return (
    <section className="group accounts-summary" aria-labelledby="accounts-net-worth">
      <div className="accounts-figure">
        <h2 className="caption" id="accounts-net-worth">
          Net worth
        </h2>
        <p className="fig flush">
          <span className="bracket">
            <Amount minor={worth.net} currency={currency} />
          </span>
        </p>
        <p className="footnote flush">
          <Amount minor={worth.assets} currency={currency} /> in assets
          {worth.owed > 0 && (
            <>
              {' · '}
              <Amount minor={worth.owed} currency={currency} /> owed
            </>
          )}
          {worth.owed < 0 && (
            <>
              {' · '}
              <Amount minor={-worth.owed} currency={currency} /> in credit
            </>
          )}
        </p>
        {lastMonth && (
          <p className="footnote flush accounts-moved">
            <Comparison delta={worth.net - lastMonth.net_worth_minor} currency={currency} against={`since ${since}`} />
          </p>
        )}
      </div>

      {points.length >= 2 && (
        <div className="accounts-trend">
          <h3 className="caption">Last {points.length} months</h3>
          <Sparkline
            values={points}
            label={`Net worth over the last ${points.length} months, from ${describeMoney(points[0]!, currency)} to ${describeMoney(points[points.length - 1]!, currency)}.`}
          />
          <p className="accounts-trend-axis" aria-hidden="true">
            <span>{formatMonth(trend[0]!.month)}</span>
            <span>{formatMonth(trend[trend.length - 1]!.month)}</span>
          </p>
        </div>
      )}

      <WhereItSits accounts={accounts} assets={worth.assets} owed={worth.owed} currency={currency} />
    </section>
  );
}

// What you have, split by kind of account, and what you owe on the same
// scale, so the two bars compare at a glance. The shares are of one total,
// so they take the spectrum; what is owed is money out, so it is grey.
function WhereItSits({
  accounts,
  assets,
  owed,
  currency,
}: {
  accounts: AccountBalance[];
  assets: number;
  owed: number;
  currency: Currency;
}) {
  if (assets <= 0) return null;
  const counted = accounts.filter((a) => !a.archived_at && a.include_in_net_worth);
  const parts = ASSET_GROUPS.map((group, index) => ({
    title: group.title,
    tone: `s${[1, 3, 5, 6][index] ?? 7}`,
    minor: counted.filter((a) => group.types.includes(a.type)).reduce((sum, a) => sum + a.balance_minor, 0),
  })).filter((part) => part.minor > 0);
  const scale = Math.max(assets, owed);
  const width = (minor: number) => `${(minor / scale) * 100}%`;

  return (
    <div className="where-it-sits">
      <span className="where-label">What you have</span>
      <span className="where-bar" aria-hidden="true">
        {parts.map((part) => (
          <i key={part.title} className={`spectrum-swatch-${part.tone}`} style={{ width: width(part.minor) }} />
        ))}
      </span>
      <Amount minor={assets} currency={currency} className="where-amount" />

      {owed > 0 && (
        <>
          <span className="where-label">What you owe</span>
          <span className="where-bar" aria-hidden="true">
            <i className="where-owed" style={{ width: width(owed) }} />
          </span>
          <Amount minor={owed} currency={currency} className="where-amount" />
        </>
      )}

      <ul className="where-legend">
        {parts.map((part) => (
          <li key={part.title}>
            <span className={`where-swatch spectrum-swatch-${part.tone}`} aria-hidden="true" />
            {part.title} {Math.round((part.minor / assets) * 100)}%
          </li>
        ))}
      </ul>
    </div>
  );
}
