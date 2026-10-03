import { Group } from '@visx/group';
import { scaleLinear } from '@visx/scale';
import type { Currency } from '../lib/money';
import { formatDateShort } from '../lib/dates';
import { Amount } from './Amount';
import {
  CHART_MARGIN as MARGIN,
  ChartFrame,
  ChartLegend,
  ChartReadout,
  ReadoutLine,
  ValueAxis,
  useChartWidth,
  usePlotHover,
} from './Chart';

// Spending added up day by day through one month: an ink line for the month
// and a grey dashed line for a typical month, so "how is the month going?"
// is the gap between them. In the month you are in, the ink line stops at
// today, marked by the blue "now" square; a past month draws in full with no
// square. The table has every day's figures.

const HEIGHT = 240;
const INNER_H = HEIGHT - MARGIN.top - MARGIN.bottom;

export type RunningDay = {
  day: string;
  day_of_month: number;
  spent_minor: number;
  running_minor: number;
  typical_running_minor: number;
  after_today: boolean;
};

export function RunningTotalChart({
  title,
  caption,
  days,
  currency,
  valueLabel,
  typicalLabel,
  showTypical,
}: {
  title: string;
  caption?: string;
  days: RunningDay[];
  currency: Currency;
  // The month, as the legend names it: "September 2026".
  valueLabel: string;
  typicalLabel: string;
  // Off when there are no earlier months to make a typical one from.
  showTypical: boolean;
}) {
  const { ref, width } = useChartWidth();
  const innerW = width - MARGIN.left - MARGIN.right;
  const drawn = days.filter((d) => !d.after_today);
  const inProgress = drawn.length < days.length;
  const last = drawn[drawn.length - 1];
  const largest = Math.max(
    1,
    ...drawn.map((d) => d.running_minor),
    ...(showTypical ? days.map((d) => d.typical_running_minor) : []),
  );
  const x = scaleLinear({ domain: [1, Math.max(2, days.length)], range: [0, innerW] });
  const y = scaleLinear({ domain: [0, largest], range: [INNER_H, 0], nice: true });
  const line = (list: RunningDay[], value: (d: RunningDay) => number) =>
    list.map((d) => `${x(d.day_of_month)},${y(value(d))}`).join(' ');
  const centers = days.map((d) => x(d.day_of_month));
  const hover = usePlotHover(centers);
  const hovered = hover.index !== null ? days[hover.index] : undefined;
  // The 1st, then every 5th day, as a calendar reads.
  const ticks = days.filter((d) => d.day_of_month === 1 || d.day_of_month % 5 === 0);

  return (
    <ChartFrame
      title={title}
      caption={caption}
      legend={
        <ChartLegend
          items={[
            { className: 'swatch-in swatch-line', label: valueLabel },
            ...(showTypical ? [{ className: 'swatch-dash', label: typicalLabel }] : []),
            ...(inProgress ? [{ className: 'swatch-now', label: 'Today' }] : []),
          ]}
        />
      }
      table={<RunningTable days={days} currency={currency} showTypical={showTypical} />}
    >
      <div className="chart-plot" ref={ref}>
        <svg
          width={width}
          height={HEIGHT}
          viewBox={`0 0 ${width} ${HEIGHT}`}
          className="chart"
          role="img"
          aria-label={`${title}. The table view has every day's figures.`}
          {...hover.handlers}
        >
          <Group left={MARGIN.left} top={MARGIN.top}>
            <ValueAxis scale={y} innerWidth={innerW} currency={currency} />
            {showTypical && <polyline className="line-prior" points={line(days, (d) => d.typical_running_minor)} />}
            {drawn.length > 0 && <polyline className="line-net" points={line(drawn, (d) => d.running_minor)} />}
            {inProgress && last && (
              <rect className="chart-now" x={x(last.day_of_month) - 4} y={y(last.running_minor) - 4} width={8} height={8} />
            )}
            {hovered && hover.index !== null && (
              <>
                <line className="chart-hover-rule" x1={centers[hover.index]} x2={centers[hover.index]} y1={0} y2={INNER_H} />
                {!hovered.after_today && (
                  <circle className="chart-hover-dot" cx={centers[hover.index]} cy={y(hovered.running_minor)} r={3.5} />
                )}
              </>
            )}
            <g aria-hidden="true">
              {ticks.map((d) => (
                <text key={d.day} className="chart-axis-label" x={x(d.day_of_month)} y={INNER_H + 18} textAnchor="middle">
                  {formatDateShort(d.day)}
                </text>
              ))}
            </g>
          </Group>
        </svg>
        {hovered && hover.index !== null && (
          <ChartReadout x={MARGIN.left + centers[hover.index]!} plotWidth={width} title={formatDateShort(hovered.day)}>
            {!hovered.after_today && (
              <ReadoutLine label="So far" swatch="swatch-in">
                <Amount minor={hovered.running_minor} currency={currency} />
              </ReadoutLine>
            )}
            {showTypical && (
              <ReadoutLine label="Typical">
                <Amount minor={hovered.typical_running_minor} currency={currency} />
              </ReadoutLine>
            )}
          </ChartReadout>
        )}
      </div>
    </ChartFrame>
  );
}

function RunningTable({ days, currency, showTypical }: { days: RunningDay[]; currency: Currency; showTypical: boolean }) {
  return (
    <table className="ledger">
      <thead>
        <tr>
          <th scope="col">Day</th>
          <th scope="col" className="num">
            Spent
          </th>
          <th scope="col" className="num">
            So far
          </th>
          {showTypical && (
            <th scope="col" className="num">
              Typical so far
            </th>
          )}
        </tr>
      </thead>
      <tbody>
        {days.map((d) => (
          <tr key={d.day}>
            <th scope="row">{formatDateShort(d.day)}</th>
            <td className="num">{d.after_today ? '—' : <Amount minor={d.spent_minor} currency={currency} />}</td>
            <td className="num">{d.after_today ? '—' : <Amount minor={d.running_minor} currency={currency} />}</td>
            {showTypical && (
              <td className="num secondary">
                <Amount minor={d.typical_running_minor} currency={currency} />
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
