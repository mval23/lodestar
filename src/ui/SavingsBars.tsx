import { AxisBottom } from '@visx/axis';
import { Group } from '@visx/group';
import { scaleBand, scaleLinear } from '@visx/scale';
import type { Currency } from '../lib/money';
import { formatMonth } from '../lib/dates';
import { signedShare } from '../lib/percent';
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

// Money into goal accounts each month as ink bars above zero, money taken
// back out as grey bars below, and the month's savings rate over each bar.
// A dashed line marks the monthly plan when the goals have one. Blue marks
// only the latest month.

const HEIGHT = 280;
const INNER_H = HEIGHT - MARGIN.top - MARGIN.bottom - 16;

export type SavingsMonth = { month: string; in_minor: number; out_minor: number; money_in_minor: number };

// A month's rate: what stayed in goals, of the money that came in.
const rateOf = (m: SavingsMonth) => (m.money_in_minor > 0 ? signedShare(m.in_minor - m.out_minor, m.money_in_minor).replace('+', '') : '—');

export function SavingsBars({
  title,
  caption,
  months,
  plan,
  currency,
  showRate = true,
  inLabel = 'Into goals',
  outLabel = 'Taken out',
}: {
  title: string;
  caption?: string;
  months: SavingsMonth[];
  // The goals' monthly plans together, or null without any.
  plan: number | null;
  currency: Currency;
  // Off for one goal, where money in has no part.
  showRate?: boolean;
  inLabel?: string;
  outLabel?: string;
}) {
  const { ref, width } = useChartWidth();
  const innerW = width - MARGIN.left - MARGIN.right;
  const x = scaleBand({ domain: months.map((m) => m.month), range: [0, innerW], padding: 0.3 });
  const high = Math.max(1, ...months.map((m) => m.in_minor), plan ?? 0);
  const low = Math.max(0, ...months.map((m) => m.out_minor));
  const y = scaleLinear({ domain: [-low, high], range: [INNER_H, 0], nice: true });
  const zero = y(0);
  const centers = months.map((m) => (x(m.month) ?? 0) + x.bandwidth() / 2);
  const hover = usePlotHover(centers);
  const hovered = hover.index !== null ? months[hover.index] : undefined;
  const latest = months[months.length - 1]?.month;

  return (
    <ChartFrame
      title={title}
      caption={caption}
      legend={
        <ChartLegend
          items={[
            { className: 'swatch-in', label: inLabel },
            { className: 'swatch-out', label: outLabel },
            ...(plan ? [{ className: 'swatch-dash', label: 'Monthly plan' }] : []),
            { className: 'swatch-now', label: 'Latest month' },
          ]}
        />
      }
      table={<SavingsTable months={months} currency={currency} showRate={showRate} inLabel={inLabel} outLabel={outLabel} />}
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
          <Group left={MARGIN.left} top={MARGIN.top + 16}>
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
                  {showRate && (
                    <text className="chart-axis-label savings-rate" x={left + x.bandwidth() / 2} y={y(Math.max(m.in_minor, 0)) - 6} textAnchor="middle">
                      {rateOf(m)}
                    </text>
                  )}
                  {m.month === latest && (
                    <rect className="chart-now" x={left + x.bandwidth() / 2 - 3} y={INNER_H + 4} width={6} height={6} />
                  )}
                </Group>
              );
            })}
            {plan !== null && <line className="line-prior" x1={0} x2={innerW} y1={y(plan)} y2={y(plan)} />}
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
            <ReadoutLine label={inLabel} swatch="swatch-in">
              <Amount minor={hovered.in_minor} currency={currency} />
            </ReadoutLine>
            <ReadoutLine label={outLabel} swatch="swatch-out">
              <Amount minor={hovered.out_minor} currency={currency} />
            </ReadoutLine>
            {showRate && <ReadoutLine label="Savings rate">{rateOf(hovered)}</ReadoutLine>}
          </ChartReadout>
        )}
      </div>
    </ChartFrame>
  );
}

function SavingsTable({
  months,
  currency,
  showRate,
  inLabel,
  outLabel,
}: {
  months: SavingsMonth[];
  currency: Currency;
  showRate: boolean;
  inLabel: string;
  outLabel: string;
}) {
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
          {showRate && (
            <>
              <th scope="col" className="num">
                Money in
              </th>
              <th scope="col" className="num">
                Savings rate
              </th>
            </>
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
            {showRate && (
              <>
                <td className="num">
                  <Amount minor={m.money_in_minor} currency={currency} />
                </td>
                <td className="num">{rateOf(m)}</td>
              </>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
