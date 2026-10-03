import type { Currency } from '../lib/money';
import { Amount } from './Amount';

// How long cash and savings would cover spending, drawn on a months axis: one
// block per account group, used in order, each as wide as the months it
// covers, and a rule where the runway ends. Every month count comes from
// Postgres; the drawing only places them. The legend under the bar carries
// the figures, so the bar itself is decoration for a screen reader.

export type RunwayBlock = { key: string; label: string; months: number; minor: number };

const TONES = ['in', 'out', 'hatch', 'light'] as const;
const fmt = (months: number) => new Intl.NumberFormat('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(months);

export function RunwayBar({ blocks, total, currency }: { blocks: RunwayBlock[]; total: number; currency: Currency }) {
  const axis = Math.max(12, Math.ceil(total));
  const at = (months: number) => `${(Math.max(0, months) / axis) * 100}%`;
  const ticks = Array.from({ length: axis + 1 }, (_, i) => i).filter((i) => axis <= 24 || i % 3 === 0);
  return (
    <div className="runway">
      <div className="runway-track" aria-hidden="true">
        {blocks.map((b, i) => (
          <span key={b.key} className={`runway-block runway-${TONES[i % TONES.length]}`} style={{ width: at(b.months) }} />
        ))}
        <span className="runway-end" style={{ left: at(total) }} />
      </div>
      <div className="runway-axis" aria-hidden="true">
        {ticks.map((i) => (
          <span key={i} style={{ left: at(i) }}>
            {i}
          </span>
        ))}
        <span className="runway-axis-name">Months</span>
      </div>
      <ul className="runway-legend">
        {blocks.map((b, i) => (
          <li key={b.key}>
            <span className={`swatch runway-swatch-${TONES[i % TONES.length]}`} aria-hidden />
            <span>
              {b.label}
              <strong>{fmt(b.months)} mo</strong>
              <small>
                <Amount minor={b.minor} currency={currency} />
              </small>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export const formatMonths = fmt;
