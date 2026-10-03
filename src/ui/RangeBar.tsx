import type { Currency } from '../lib/money';
import { Amount } from './Amount';

// Where one figure sits in its usual range: a track from the low month to
// the high one, a tick for the typical month, and the figure itself as the
// blue "now" square. When the figure is outside the range, the track grows
// to reach it. The words under it carry the reading; the drawing is
// decoration for a screen reader.
export function RangeBar({
  value,
  low,
  high,
  typical,
  currency,
}: {
  value: number;
  low: number;
  high: number;
  typical: number | null;
  currency: Currency;
}) {
  const from = Math.min(low, value);
  const to = Math.max(high, value, from + 1);
  const at = (n: number) => `${((n - from) / (to - from)) * 100}%`;
  return (
    <div className="range-bar">
      <div className="range-track" aria-hidden="true">
        <span className="range-span" style={{ left: at(low), width: `calc(${at(high)} - ${at(low)})` }} />
        {typical !== null && <span className="range-typical" style={{ left: at(typical) }} />}
        <span className="range-now" style={{ left: at(value) }} />
      </div>
      <p className="range-labels footnote flush">
        <span>
          <Amount minor={low} currency={currency} /> low
        </span>
        {typical !== null && (
          <span>
            typical <Amount minor={typical} currency={currency} />
          </span>
        )}
        <span>
          <Amount minor={high} currency={currency} /> high
        </span>
      </p>
    </div>
  );
}
