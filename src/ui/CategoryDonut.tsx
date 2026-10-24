import { useId } from 'react';
import type { Currency } from '../lib/money';
import { share } from '../lib/percent';
import { Amount } from './Amount';

// A month's spending by category as a donut, in the spectrum tokens: the
// app's own colours, dark through the blues to light greys, largest share
// first, never cycled. The seven largest categories get a step each,
// everything smaller shares the last, and spending with no category is
// hatched. Every slice is named in the legend beside it with its share, since
// neighbouring steps alone are not enough.

export type DonutTone = 's1' | 's2' | 's3' | 's4' | 's5' | 's6' | 's7' | 's8' | 'none';

export type DonutItem = { key: string; label: string; minor: number; uncategorized?: boolean };

export type DonutSlice = {
  key: string;
  label: string;
  minor: number;
  tone: DonutTone;
  // For the slice that gathers the smaller categories: how many it holds.
  count?: number;
};

const NAMED: DonutTone[] = ['s1', 's2', 's3', 's4', 's5', 's6', 's7'];

// The slices for these items, largest first: each of the seven largest named
// categories in its own step, the rest gathered into one.
export function donutSlices(items: DonutItem[]): DonutSlice[] {
  const spent = items.filter((item) => item.minor > 0).sort((a, b) => b.minor - a.minor);
  const named = spent.filter((item) => !item.uncategorized);
  const none = spent.find((item) => item.uncategorized);
  // One more than the named steps fits whole, so one category is never
  // gathered alone into "Everything else".
  const own = named.length <= NAMED.length + 1 ? named : named.slice(0, NAMED.length);
  const rest = named.slice(own.length);
  const slices: DonutSlice[] = own.map((item, i) => ({
    key: item.key,
    label: item.label,
    minor: item.minor,
    // Eight categories fit without gathering: the eighth takes the last step.
    tone: NAMED[i] ?? 's8',
  }));
  if (rest.length > 0) {
    slices.push({
      key: 'rest',
      label: 'Everything else',
      minor: rest.reduce((sum, item) => sum + item.minor, 0),
      tone: 's8',
      count: rest.length,
    });
  }
  if (none) slices.push({ key: none.key, label: none.label, minor: none.minor, tone: 'none' });
  return slices;
}

const SIZE = 168;
const STROKE = 22;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
// The gap between slices, along the ring.
const GAP = 2;

export function CategoryDonut({
  slices,
  currency,
  label,
}: {
  slices: DonutSlice[];
  currency: Currency;
  label: string;
}) {
  const hatch = useId();
  const total = slices.reduce((sum, slice) => sum + slice.minor, 0);
  if (total === 0) return null;
  // Each slice starts where the ones before it end.
  const lengths = slices.map((slice) => (slice.minor / total) * CIRCUMFERENCE);
  const arcs = slices.map((slice, i) => ({
    slice,
    start: lengths.slice(0, i).reduce((sum, length) => sum + length, 0),
    length: lengths[i] ?? 0,
  }));
  const gap = slices.length > 1 ? GAP : 0;

  return (
    <div className="donut" role="group" aria-label={label}>
      <div className="donut-chart">
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden="true">
          <defs>
            <pattern id={hatch} width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="5" height="5" style={{ fill: 'var(--surface)' }} />
              <rect width="2" height="5" style={{ fill: 'var(--ink-2)' }} />
            </pattern>
          </defs>
          <g transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}>
            {arcs.map(({ slice, start: from, length }) => (
              <circle
                key={slice.key}
                className={slice.tone === 'none' ? undefined : `donut-${slice.tone}`}
                cx={SIZE / 2}
                cy={SIZE / 2}
                r={RADIUS}
                fill="none"
                strokeWidth={STROKE}
                style={slice.tone === 'none' ? { stroke: `url(#${hatch})` } : undefined}
                strokeDasharray={`${Math.max(0.5, length - gap)} ${CIRCUMFERENCE}`}
                strokeDashoffset={-from}
              />
            ))}
          </g>
        </svg>
        <p className="donut-centre">
          <Amount minor={total} currency={currency} />
          <small>spent</small>
        </p>
      </div>
      <ul className="donut-legend">
        {slices.map((slice) => (
          <li key={slice.key}>
            <span className={`swatch spectrum-swatch-${slice.tone}`} aria-hidden="true" />
            <span className="donut-name">
              {slice.label}
              {slice.count !== undefined && <small> · {slice.count} categories</small>}
            </span>
            <span className="donut-share">{share(slice.minor, total)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
