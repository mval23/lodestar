import type { ReactNode } from 'react';
import { useCurrency } from '../../lib/profile';
import { Amount } from '../../ui/Amount';
import { netWorthOf, type AccountBalance } from './queries';

// Net worth reads the same on the Overview and on Accounts because it is
// drawn once. A card paid past zero is money in credit, not a negative debt,
// so the footnote changes its words rather than its sign.
//
// `children` sit inside the same group, under the figure: the Overview adds
// its trend there. `compact` is the Overview's side card, where the month's
// budget is the key figure: a screen gets one bracket, so this one has none.
export function NetWorthGroup({
  accounts,
  compact,
  children,
}: {
  accounts: AccountBalance[];
  compact?: boolean;
  children?: ReactNode;
}) {
  const currency = useCurrency();
  const worth = netWorthOf(accounts);

  return (
    <section className={compact ? 'group overview-card' : 'group figure-group'}>
      <h2 className="caption">Net worth</h2>
      {compact ? (
        <p className="card-figure flush">
          <Amount minor={worth.net} currency={currency} />
        </p>
      ) : (
        <p className="fig flush">
          <span className="bracket">
            <Amount minor={worth.net} currency={currency} />
          </span>
        </p>
      )}
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
      {children}
    </section>
  );
}
