import { lineDomain } from './chartDomain';

// A small line for the direction of one figure, beside that figure. It has no
// axis on purpose: the number it sits under is the reading, and the line only
// says which way it has been moving. Its full chart, with its table, is a
// click away on the page it links to.
//
// The line stretches to its box, so its stroke is kept from stretching with
// it, and the fix (the blue square that marks "now") is placed in the page
// rather than the SVG so it stays square.
export function Sparkline({ values, label, small }: { values: number[]; label: string; small?: boolean }) {
  if (values.length < 2) return null;

  const { low, high } = lineDomain(values);
  const width = 100;
  const height = 32;
  const span = high - low || 1;
  const y = (value: number) => height - ((value - low) / span) * height;
  const x = (index: number) => (index / (values.length - 1)) * width;
  const points = values.map((value, index) => `${x(index)},${y(value)}`).join(' ');
  const nowTop = (y(values[values.length - 1]!) / height) * 100;

  return (
    <div className={small ? 'sparkline sparkline-small' : 'sparkline'} role="img" aria-label={label}>
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
        <polyline className="sparkline-line" points={points} vectorEffect="non-scaling-stroke" />
      </svg>
      <span className="sparkline-now" style={{ top: `${nowTop}%` }} aria-hidden="true" />
    </div>
  );
}
