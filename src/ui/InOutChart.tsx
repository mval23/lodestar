import type { ReactNode } from 'react';
import { Group } from '@visx/group';
import { scaleLinear } from '@visx/scale';
import type { Currency } from '../lib/money';
import { formatMonth } from '../lib/dates';
import { Amount } from './Amount';
import {
  CHART_MARGIN as MARGIN,
  ChartFrame,
  ChartLegend,
  ChartReadout,
  ReadoutLine,
  ValueAxis,
  monthLabelStep,
  useChartWidth,
  usePlotHover,
} from './Chart';

// Money in and money out, month by month, as two soft lines with the gap
// between them shaded: where in ran above out, and where it didn't, at a
// glance. In is ink and out is grey; the shading is the same either way, so
// neither side reads as good or bad by colour. The month still running is
// joined by a dashed stretch, since it is only to date, and blue marks it.
// Every figure is a month's total from Postgres; the drawing only places them.

const HEIGHT = 240;
const INNER_H = HEIGHT - MARGIN.top - MARGIN.bottom;

export type InOutMonth = { month: string; in_minor: number; out_minor: number; balance_minor?: number };

type Point = [number, number];

// A smooth line through the points that never overshoots them: a monotone
// cubic (Fritsch–Carlson), so a curve between two months stays between their
// figures and never suggests money that wasn't there.
export function monotonePath(points: Point[]): string {
  const n = points.length;
  if (n === 0) return '';
  const [x0, y0] = points[0]!;
  if (n === 1) return `M${x0},${y0}`;
  const slopes: number[] = [];
  for (let i = 0; i < n - 1; i += 1) {
    const [xa, ya] = points[i]!;
    const [xb, yb] = points[i + 1]!;
    slopes.push((yb - ya) / (xb - xa || 1));
  }
  const tangents = points.map((_, i) => {
    if (i === 0) return slopes[0]!;
    if (i === n - 1) return slopes[n - 2]!;
    const before = slopes[i - 1]!;
    const after = slopes[i]!;
    return before * after <= 0 ? 0 : (before + after) / 2;
  });
  for (let i = 0; i < n - 1; i += 1) {
    const slope = slopes[i]!;
    if (slope === 0) {
      tangents[i] = 0;
      tangents[i + 1] = 0;
      continue;
    }
    const a = tangents[i]! / slope;
    const b = tangents[i + 1]! / slope;
    const s = a * a + b * b;
    if (s > 9) {
      const k = 3 / Math.sqrt(s);
      tangents[i] = k * a * slope;
      tangents[i + 1] = k * b * slope;
    }
  }
  let d = `M${x0},${y0}`;
  for (let i = 0; i < n - 1; i += 1) {
    const [xa, ya] = points[i]!;
    const [xb, yb] = points[i + 1]!;
    const third = (xb - xa) / 3;
    d += `C${xa + third},${ya + tangents[i]! * third},${xb - third},${yb - tangents[i + 1]! * third},${xb},${yb}`;
  }
  return d;
}

export function InOutChart({
  title,
  caption,
  months,
  currency,
  currentMonth,
  head,
  inLabel = 'Money in',
  outLabel = 'Money out',
}: {
  title: string;
  caption?: ReactNode;
  months: InOutMonth[];
  currency: Currency;
  currentMonth: string;
  // Sits above the plot, inside the card: a period switch and figures.
  head?: ReactNode;
  inLabel?: string;
  outLabel?: string;
}) {
  const { ref, width } = useChartWidth();
  const innerW = width - MARGIN.left - MARGIN.right;
  const n = months.length;
  const column = innerW / Math.max(1, n);
  const centers = months.map((_, i) => column * i + column / 2);
  const high = Math.max(1, ...months.map((m) => Math.max(m.in_minor, m.out_minor)));
  const y = scaleLinear({ domain: [0, high], range: [INNER_H, 0], nice: true });
  const hover = usePlotHover(centers);
  const hovered = hover.index !== null ? months[hover.index] : undefined;

  // Whole months as solid lines; the running month joined on by a dash.
  const running = n > 0 && months[n - 1]!.month === currentMonth;
  const whole = running ? n - 1 : n;
  const pointsOf = (pick: (m: InOutMonth) => number, from: number, to: number): Point[] =>
    months.slice(from, to).map((m, i) => [centers[from + i]!, y(pick(m))]);
  const inWhole = pointsOf((m) => m.in_minor, 0, whole);
  const outWhole = pointsOf((m) => m.out_minor, 0, whole);
  const inPath = monotonePath(inWhole);
  const outPath = monotonePath(outWhole);
  const ribbon =
    inWhole.length > 1 ? `${inPath}L${monotonePath([...outWhole].reverse()).slice(1)}Z` : '';
  const tail = (pick: (m: InOutMonth) => number) =>
    running && n > 1 ? monotonePath(pointsOf(pick, n - 2, n)) : '';
  const step = monthLabelStep(column);

  return (
    <ChartFrame
      title={title}
      caption={caption}
      legend={
        <ChartLegend
          items={[
            { className: 'swatch-in', label: inLabel },
            { className: 'swatch-out', label: outLabel },
            { className: 'swatch-area', label: 'The gap between them' },
            ...(running ? [{ className: 'swatch-now', label: 'This month, to date' }] : []),
          ]}
        />
      }
      table={<InOutTable months={months} currency={currency} inLabel={inLabel} outLabel={outLabel} />}
    >
      {head}
      <div className="chart-plot" ref={ref}>
        <svg
          width={width}
          height={HEIGHT}
          viewBox={`0 0 ${width} ${HEIGHT}`}
          className="chart"
          role="img"
          aria-label={`${title}, ${n} months. The table view has every figure.`}
          {...hover.handlers}
        >
          <Group left={MARGIN.left} top={MARGIN.top}>
            <ValueAxis scale={y} innerWidth={innerW} currency={currency} />
            {ribbon && <path className="inout-gap" d={ribbon} />}
            {hover.index !== null && (
              <line className="inout-hover-rule" x1={centers[hover.index]} x2={centers[hover.index]} y1={0} y2={INNER_H} />
            )}
            {outPath && <path className="inout-out" d={outPath} />}
            {inPath && <path className="inout-in" d={inPath} />}
            {tail((m) => m.out_minor) && <path className="inout-out inout-tail" d={tail((m) => m.out_minor)} />}
            {tail((m) => m.in_minor) && <path className="inout-in inout-tail" d={tail((m) => m.in_minor)} />}
            {months.map((m, i) => (
              <g key={m.month} className={i === hover.index ? 'inout-dots hovered' : 'inout-dots'}>
                <circle className="inout-dot-out" cx={centers[i]} cy={y(m.out_minor)} r={3.5} />
                <circle className="inout-dot-in" cx={centers[i]} cy={y(m.in_minor)} r={3.5} />
              </g>
            ))}
            {months.map((m, i) =>
              (n - 1 - i) % step === 0 ? (
                <text
                  key={m.month}
                  className={m.month === currentMonth ? 'inout-label inout-now-label' : 'inout-label'}
                  x={centers[i]}
                  y={INNER_H + 18}
                  textAnchor="middle"
                >
                  {formatMonth(m.month).slice(0, 3)}
                </text>
              ) : null,
            )}
            {running && <rect className="chart-now" x={centers[n - 1]! - 3} y={INNER_H + 3} width={6} height={6} />}
          </Group>
        </svg>
        {hovered && hover.index !== null && (
          <ChartReadout x={MARGIN.left + centers[hover.index]!} plotWidth={width} title={formatMonth(hovered.month)}>
            <ReadoutLine label={inLabel} swatch="swatch-in">
              <Amount minor={hovered.in_minor} currency={currency} />
            </ReadoutLine>
            <ReadoutLine label={outLabel} swatch="swatch-out">
              <Amount minor={hovered.out_minor} currency={currency} />
            </ReadoutLine>
          </ChartReadout>
        )}
      </div>
    </ChartFrame>
  );
}

function InOutTable({
  months,
  currency,
  inLabel,
  outLabel,
}: {
  months: InOutMonth[];
  currency: Currency;
  inLabel: string;
  outLabel: string;
}) {
  const withBalance = months.some((m) => m.balance_minor !== undefined);
  return (
    <table className="ledger">
      <thead>
        <tr>
          <th scope="col">Month</th>
          <th scope="col" className="num">
            {inLabel}
          </th>
          <th scope="col" className="num">
            {outLabel}
          </th>
          {withBalance && (
            <th scope="col" className="num">
              Balance at month end
            </th>
          )}
        </tr>
      </thead>
      <tbody>
        {months.map((m) => (
          <tr key={m.month}>
            <th scope="row">{formatMonth(m.month)}</th>
            <td className="num">
              <Amount minor={m.in_minor} currency={currency} />
            </td>
            <td className="num">
              <Amount minor={m.out_minor} currency={currency} />
            </td>
            {withBalance && (
              <td className="num">{m.balance_minor !== undefined && <Amount minor={m.balance_minor} currency={currency} />}</td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
