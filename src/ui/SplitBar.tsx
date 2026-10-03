import type { Currency } from '../lib/money';
import { Amount } from './Amount';

// Bars split into parts, drawn to one scale so they can be compared: on the
// Month page, what went out (spent, into goals) above what came in, with the
// gap hatched. Money out is grey, money saved is ink, and a shortfall is
// hatched rather than coloured. A part names itself inside the bar when it is
// wide enough, and under the bar when it is not.

export type SplitPart = {
  label: string;
  minor: number;
  tone: 'out' | 'in' | 'base' | 'short';
};

export type SplitRow = { label: string; parts: SplitPart[] };

// Narrower than this, a part's words would not fit inside it.
const LABEL_SHARE = 22;

export function SplitBars({ rows, currency, label }: { rows: SplitRow[]; currency: Currency; label: string }) {
  const scale = Math.max(1, ...rows.map((row) => row.parts.reduce((sum, part) => sum + part.minor, 0)));
  return (
    <div className="split-bars" role="group" aria-label={label}>
      {rows.map((row) => {
        const parts = row.parts
          .filter((part) => part.minor > 0)
          .map((part) => ({ ...part, share: (part.minor / scale) * 100 }));
        const narrow = parts.filter((part) => part.share < LABEL_SHARE);
        return (
          <div key={row.label} className="split-row">
            {/* What the bar shows, read as a sentence. */}
            <p className="visually-hidden">
              {row.label}:{' '}
              {parts.map((part, i) => (
                <span key={part.label}>
                  {i > 0 && ', '}
                  {part.label} <Amount minor={part.minor} currency={currency} />
                </span>
              ))}
            </p>
            <div className="split-bar" aria-hidden="true">
              {parts.map((part) => (
                <span key={part.label} className={`split-part split-${part.tone}`} style={{ width: `${part.share}%` }}>
                  {part.share >= LABEL_SHARE && (
                    <span className="split-text">
                      {part.label} <Amount minor={part.minor} currency={currency} />
                    </span>
                  )}
                </span>
              ))}
            </div>
            {narrow.length > 0 && (
              <p className="split-legend" aria-hidden="true">
                {narrow.map((part) => (
                  <span key={part.label}>
                    <span className={`swatch split-swatch-${part.tone}`} />
                    {part.label} <Amount minor={part.minor} currency={currency} />
                  </span>
                ))}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
