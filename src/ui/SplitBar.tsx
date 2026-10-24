import type { Currency } from '../lib/money';
import { share } from '../lib/percent';
import { Amount } from './Amount';

// One slim bar split into parts, with each part's figure under it: on the
// Month page, where the money that came in went. Money out is grey, money
// saved is ink, what is left is the light track, and anything beyond what
// came in is hatched rather than coloured. Small gaps between the parts keep
// them apart without outlines.

export type SplitPart = {
  label: string;
  minor: number;
  tone: 'out' | 'in' | 'base' | 'short';
};

export function MoneySplit({
  label,
  parts,
  shareOf,
  limit,
  extra = [],
  currency,
}: {
  label: string;
  // Drawn in the bar, left to right.
  parts: SplitPart[];
  // What the shares are of, after the percentage: "of money in".
  shareOf: string;
  // Where the money in ends, when the bar runs past it: the rest is hatched.
  limit?: number;
  // Named under the bar but not drawn as a part of its own: the hatching.
  extra?: SplitPart[];
  currency: Currency;
}) {
  const shown = parts.filter((part) => part.minor > 0);
  const total = shown.reduce((sum, part) => sum + part.minor, 0);
  const beyond = limit !== undefined && total > 0 && limit < total ? (limit / total) * 100 : null;
  const keys = [...shown, ...extra.filter((part) => part.minor > 0)];
  return (
    <div className="money-split" role="group" aria-label={label}>
      <div className="money-split-track" aria-hidden="true">
        {shown.map((part) => (
          <span
            key={part.label}
            className={`money-split-part split-${part.tone}`}
            style={{ flexGrow: part.minor }}
          />
        ))}
        {beyond !== null && <span className="money-split-beyond" style={{ left: `${beyond}%` }} />}
      </div>
      <ul className="money-split-keys">
        {keys.map((part) => (
          <li key={part.label}>
            <span className="money-split-key">
              <span className={`swatch split-swatch-${part.tone}`} aria-hidden="true" />
              {part.label}
            </span>
            <span className="money-split-amount">
              <Amount minor={part.minor} currency={currency} />
            </span>
            <span className="money-split-share">
              {share(part.minor, total)} {shareOf}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
