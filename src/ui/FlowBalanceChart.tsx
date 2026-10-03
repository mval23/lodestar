import { AxisBottom } from '@visx/axis';
import { Group } from '@visx/group';
import { scaleBand, scaleLinear } from '@visx/scale';
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

// What moved an account's balance: money in each month as an ink bar above
// zero, money out as a grey bar below, and the balance at each month end as
// a line through them. Blue marks only the current month. Every figure is a
// month's total from Postgres; the drawing only places them.

const HEIGHT = 340;
const INNER_H = HEIGHT - MARGIN.top - MARGIN.bottom;

export type FlowMonth = { month: string; in_minor: number; out_minor: number; balance_minor: number };

export function FlowBalanceChart({
  title,
  caption,
  months,
  currency,
  currentMonth,
  balanceLabel = 'Balance at month end',
}: {
  title: string;
  caption?: string;
  months: FlowMonth[];
  currency: Currency;
  currentMonth: string;
  balanceLabel?: string;
}) {
  const { ref, width } = useChartWidth();
  const innerW = width - MARGIN.left - MARGIN.right;
  const x = scaleBand({ domain: months.map((m) => m.month), range: [0, innerW], padding: 0.3 });
  const high = Math.max(1, ...months.map((m) => Math.max(m.in_minor, m.balance_minor)));
  const low = Math.min(0, ...months.map((m) => Math.min(-m.out_minor, m.balance_minor)));
  const y = scaleLinear({ domain: [low, high], range: [INNER_H, 0], nice: true });
  const zero = y(0);
  const centers = months.map((m) => (x(m.month) ?? 0) + x.bandwidth() / 2);
  const hover = usePlotHover(centers);
  const hovered = hover.index !== null ? months[hover.index] : undefined;
  const points = months.map((m, i) => `${centers[i]},${y(m.balance_minor)}`).join(' ');

  return (
    <ChartFrame
      title={title}
      caption={caption}
      legend={
        <ChartLegend
          items={[
            { className: 'swatch-in', label: 'Money in' },
            { className: 'swatch-out', label: 'Money out' },
            { className: 'swatch-in swatch-line', label: balanceLabel },
            { className: 'swatch-now', label: 'This month' },
          ]}
        />
      }
      table={<FlowTable months={months} currency={currency} balanceLabel={balanceLabel} />}
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
          <Group left={MARGIN.left} top={MARGIN.top}>
            <ValueAxis scale={y} innerWidth={innerW} currency={currency} />
            <line className="chart-zero-solid" x1={0} x2={innerW} y1={zero} y2={zero} />
            {hover.index !== null && (
              <rect className="chart-hover-band" x={centers[hover.index]! - x.step() / 2} y={0} width={x.step()} height={INNER_H} />
            )}
            {months.map((m) => {
              const left = x(m.month) ?? 0;
              return (
                <Group key={m.month}>
                  {m.in_minor > 0 && <rect className="bar-in" x={left} y={y(m.in_minor)} width={x.bandwidth()} height={zero - y(m.in_minor)} rx={2} />}
                  {m.out_minor > 0 && <rect className="bar-out" x={left} y={zero} width={x.bandwidth()} height={y(-m.out_minor) - zero} rx={2} />}
                  {m.month === currentMonth && (
                    <rect className="chart-now" x={left + x.bandwidth() / 2 - 3} y={INNER_H + 4} width={6} height={6} />
                  )}
                </Group>
              );
            })}
            {/* A halo in the surface colour keeps the line legible over ink bars. */}
            {months.length > 1 && <polyline className="line-halo" points={points} />}
            {months.length > 1 && <polyline className="line-net" points={points} />}
            {months.map((m, i) =>
              m.month === currentMonth ? (
                <rect key={m.month} className="chart-now" x={centers[i]! - 4} y={y(m.balance_minor) - 4} width={8} height={8} />
              ) : (
                <circle key={m.month} className="chart-dot" cx={centers[i]} cy={y(m.balance_minor)} r={2.5} />
              ),
            )}
            <AxisBottom
              top={INNER_H}
              scale={x}
              tickValues={months.map((m) => m.month).filter((_, i) => (months.length - 1 - i) % monthLabelStep(x.step()) === 0)}
              tickFormat={(m) => formatMonth(String(m)).slice(0, 3)}
              hideAxisLine
              hideTicks
              tickClassName="chart-tick"
              tickLabelProps={() => ({ textAnchor: 'middle', dy: '0.6em' })}
            />
          </Group>
        </svg>
        {hovered && hover.index !== null && (
          <ChartReadout x={MARGIN.left + centers[hover.index]!} plotWidth={width} title={formatMonth(hovered.month)}>
            <ReadoutLine label="Money in" swatch="swatch-in">
              <Amount minor={hovered.in_minor} currency={currency} />
            </ReadoutLine>
            <ReadoutLine label="Money out" swatch="swatch-out">
              <Amount minor={hovered.out_minor} currency={currency} />
            </ReadoutLine>
            <ReadoutLine label={balanceLabel}>
              <Amount minor={hovered.balance_minor} currency={currency} />
            </ReadoutLine>
          </ChartReadout>
        )}
      </div>
    </ChartFrame>
  );
}

function FlowTable({ months, currency, balanceLabel }: { months: FlowMonth[]; currency: Currency; balanceLabel: string }) {
  return (
    <table className="ledger">
      <thead>
        <tr>
          <th scope="col">Month</th>
          <th scope="col" className="num">
            Money in
          </th>
          <th scope="col" className="num">
            Money out
          </th>
          <th scope="col" className="num">
            {balanceLabel}
          </th>
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
            <td className="num">
              <Amount minor={m.balance_minor} currency={currency} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
