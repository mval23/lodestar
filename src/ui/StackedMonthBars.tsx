import { useId } from 'react';
import { AxisBottom } from '@visx/axis';
import { Group } from '@visx/group';
import { scaleBand, scaleLinear } from '@visx/scale';
import type { Currency } from '../lib/money';
import { formatMonth } from '../lib/dates';
import { Amount } from './Amount';
import {
  CHART_MARGIN as MARGIN,
  ChartFrame,
  ChartReadout,
  ReadoutLine,
  ValueAxis,
  monthLabelStep,
  useChartWidth,
  usePlotHover,
} from './Chart';

// Each month's spending as one bar split by category: the breakdown, and the
// only chart in Lodestar allowed the category colours. They come in a fixed
// order, never cycled, and every one is named in the legend. The largest
// fixed cost is the grey base, so the flexible categories above it are what
// the eye compares; spending with no category is hatched. The bars add up to
// each month's money out, which the caller passes from Postgres.

const HEIGHT = 300;
const INNER_H = HEIGHT - MARGIN.top - MARGIN.bottom;

// 'fixed' is grey; c2 to c8 are the breakdown colours (c1 is left out: it is
// the accent blue, which marks only "now"); 'none' is hatched.
export type StackTone = 'ink' | 'fixed' | 'c2' | 'c3' | 'c4' | 'c5' | 'c6' | 'c7' | 'c8' | 'none';

// Series sharing a group (the smaller categories, all in c8) share one
// legend entry, named by the group.
export type StackSeries = { key: string; label: string; tone: StackTone; values: Map<string, number>; group?: string };

export function StackedMonthBars({
  title,
  caption,
  months,
  series,
  totals,
  currency,
  currentMonth,
  direction = 'up',
}: {
  title: string;
  caption?: string;
  months: string[];
  // Bottom to top (or, drawn down, top to bottom).
  series: StackSeries[];
  // Each month's total, from Postgres. Without it the readout gives none.
  totals?: Map<string, number>;
  currency: Currency;
  // The latest month, marked in blue.
  currentMonth: string;
  // 'down' draws below zero, for what is owed: values stay positive, the
  // axis reads negative.
  direction?: 'up' | 'down';
}) {
  const down = direction === 'down';
  // The tallest stack, for the scale only; nothing here is shown as a sum.
  const stackHeight = (m: string) => series.reduce((top, s) => top + Math.max(0, s.values.get(m) ?? 0), 0);
  const { ref, width } = useChartWidth();
  const hatchId = useId();
  const innerW = width - MARGIN.left - MARGIN.right;
  const x = scaleBand({ domain: months, range: [0, innerW], padding: 0.3 });
  const largest = Math.max(1, ...months.map((m) => totals?.get(m) ?? stackHeight(m)));
  const y = scaleLinear({ domain: down ? [-largest, 0] : [0, largest], range: [INNER_H, 0], nice: true });
  // Where a stack that has reached `level` ends, up or down from zero.
  const at = (level: number) => y(down ? -level : level);
  const centers = months.map((m) => (x(m) ?? 0) + x.bandwidth() / 2);
  const hover = usePlotHover(centers);
  const hovered = hover.index !== null ? months[hover.index] : undefined;
  const fill = (tone: StackTone) => (tone === 'none' ? `url(#${hatchId})` : undefined);
  const legend = series.filter((s, i) => !s.group || series.findIndex((o) => o.group === s.group) === i);

  return (
    <ChartFrame
      title={title}
      caption={caption}
      legend={
        <>
          {legend.map((s) => (
            <span key={s.key} className="legend-item">
              <span className={`swatch stack-swatch-${s.tone}`} aria-hidden />
              {s.group ?? s.label}
            </span>
          ))}
          <span className="legend-item">
            <span className="swatch swatch-now" aria-hidden />
            Latest month
          </span>
        </>
      }
      table={<StackTable months={months} series={series} totals={totals} currency={currency} sign={down ? -1 : 1} />}
    >
      <div className="chart-plot" ref={ref}>
        <svg
          width={width}
          height={HEIGHT}
          viewBox={`0 0 ${width} ${HEIGHT}`}
          className="chart"
          role="img"
          aria-label={`${title}, ${months.length} months. The table view has every figure.`}
          {...hover.handlers}
        >
          <defs>
            <pattern id={hatchId} width={6} height={6} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect className="hatch-ground" width={6} height={6} />
              <rect className="hatch-line" width={3} height={6} />
            </pattern>
          </defs>
          <Group left={MARGIN.left} top={MARGIN.top}>
            <ValueAxis scale={y} innerWidth={innerW} currency={currency} />
            {hover.index !== null && (
              <rect
                className="chart-hover-band"
                x={centers[hover.index]! - x.step() / 2}
                y={0}
                width={x.step()}
                height={INNER_H}
              />
            )}
            {months.map((month) => {
              let base = 0;
              const left = x(month) ?? 0;
              return (
                <Group key={month}>
                  {series.map((s) => {
                    const value = s.values.get(month) ?? 0;
                    if (value <= 0) return null;
                    const top = Math.min(at(base + value), at(base));
                    const bottom = Math.max(at(base + value), at(base));
                    base += value;
                    return (
                      <rect
                        key={s.key}
                        className={`stack-${s.tone}`}
                        fill={fill(s.tone)}
                        x={left}
                        y={top}
                        width={x.bandwidth()}
                        height={Math.max(0, bottom - top)}
                      />
                    );
                  })}
                  {month === currentMonth && (
                    <rect className="chart-now" x={left + x.bandwidth() / 2 - 3} y={INNER_H + 4} width={6} height={6} />
                  )}
                </Group>
              );
            })}
            <AxisBottom
              top={INNER_H}
              scale={x}
              tickValues={months.filter((_, i) => (months.length - 1 - i) % monthLabelStep(x.step()) === 0)}
              tickFormat={(m) => formatMonth(String(m)).slice(0, 3)}
              hideAxisLine
              hideTicks
              tickClassName="chart-tick"
              tickLabelProps={() => ({ textAnchor: 'middle', dy: '0.6em' })}
            />
          </Group>
        </svg>
        {hovered && hover.index !== null && (
          <ChartReadout x={MARGIN.left + centers[hover.index]!} plotWidth={width} title={formatMonth(hovered)}>
            {[...series]
              .reverse()
              .filter((s) => (s.values.get(hovered) ?? 0) > 0)
              .map((s) => (
                <ReadoutLine key={s.key} label={s.label} swatch={`stack-swatch-${s.tone}`}>
                  <Amount minor={(down ? -1 : 1) * (s.values.get(hovered) ?? 0)} currency={currency} />
                </ReadoutLine>
              ))}
            {totals && (
              <ReadoutLine label="Total">
                <Amount minor={down ? -(totals.get(hovered) ?? 0) : (totals.get(hovered) ?? 0)} currency={currency} />
              </ReadoutLine>
            )}
          </ChartReadout>
        )}
      </div>
    </ChartFrame>
  );
}

function StackTable({
  months,
  series,
  totals,
  currency,
  sign,
}: {
  months: string[];
  series: StackSeries[];
  totals?: Map<string, number>;
  currency: Currency;
  sign: 1 | -1;
}) {
  return (
    <table className="ledger">
      <thead>
        <tr>
          <th scope="col">Month</th>
          {series.map((s) => (
            <th key={s.key} scope="col" className="num">
              {s.label}
            </th>
          ))}
          {totals && (
            <th scope="col" className="num">
              Total
            </th>
          )}
        </tr>
      </thead>
      <tbody>
        {months.map((month) => (
          <tr key={month}>
            <th scope="row">{formatMonth(month)}</th>
            {series.map((s) => (
              <td key={s.key} className="num">
                <Amount minor={sign * (s.values.get(month) ?? 0)} currency={currency} />
              </td>
            ))}
            {totals && (
              <td className="num">
                <Amount minor={sign * (totals.get(month) ?? 0)} currency={currency} />
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
