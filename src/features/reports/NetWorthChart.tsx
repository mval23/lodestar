import { AxisBottom } from '@visx/axis';
import { Group } from '@visx/group';
import { scaleLinear, scalePoint } from '@visx/scale';
import { Area, Bar, LinePath } from '@visx/shape';
import type { Currency } from '../../lib/money';
import { formatMonth } from '../../lib/dates';
import { Amount } from '../../ui/Amount';
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
} from '../../ui/Chart';
import { lineDomain } from '../../ui/chartDomain';
import type { NetWorthMonth } from './queries';

const HEIGHT = 240;
const INNER_H = HEIGHT - MARGIN.top - MARGIN.bottom;

// One ink line for net worth, framed on its own movement. A zero rule appears
// only when the line crosses zero, so a negative stretch reads as below the
// line rather than as a colour. The blue square marks now, and the figure
// for now sits in the caption, where it used to hang under the months.
//
// The Net worth report draws it detailed: what is owned as a light area above
// zero, cards and loans as grey bars below it, net worth as the line over
// both, and a dashed line where the period began. The frame then includes
// zero, since the bars stand on it.
export function NetWorthChart({
  rows,
  currency,
  currentMonth,
  detailed = false,
  start,
  nowLabel = 'This month',
}: {
  rows: NetWorthMonth[];
  currency: Currency;
  currentMonth: string;
  detailed?: boolean;
  // Net worth where the period began, drawn as a dashed line.
  start?: { label: string; value: number } | null;
  nowLabel?: string;
}) {
  const { ref, width } = useChartWidth();
  const innerWidth = width - MARGIN.left - MARGIN.right;

  const months = scalePoint({ domain: rows.map((row) => row.month), range: [0, innerWidth], padding: 0.5 });
  const values = rows.map((row) => row.net_worth_minor);
  const framed = detailed
    ? frameWithZero([...values, ...rows.map((row) => row.assets_minor), ...rows.map((row) => row.liabilities_minor), start?.value ?? 0])
    : lineDomain(start ? [...values, start.value] : values);
  const { low, high, showZero } = framed;
  const amounts = scaleLinear({ domain: [low, high], range: [INNER_H, 0], nice: true });
  const zero = amounts(0);
  const barWidth = Math.max(4, Math.min(24, months.step() * 0.5));
  const latest = rows[rows.length - 1];
  const centers = rows.map((row) => months(row.month) ?? 0);
  const hover = usePlotHover(centers);
  const hovered = hover.index !== null ? rows[hover.index] : undefined;
  const step = monthLabelStep(months.step());
  const labelled = rows.filter((_, i) => (rows.length - 1 - i) % step === 0).map((row) => row.month);

  return (
    <ChartFrame
      title="Net worth"
      caption={
        <>
          {detailed
            ? 'At the end of each month: what you own above zero, cards and loans below, net worth as the line.'
            : 'Everything you own, less what you owe, at the end of each month.'}
          {latest && (
            <>
              {' '}
              {detailed ? `${formatMonth(latest.month)}: ` : 'Now '}
              <Amount minor={latest.net_worth_minor} currency={currency} />.
            </>
          )}
        </>
      }
      legend={
        <ChartLegend
          items={[
            { className: 'swatch-in swatch-line', label: 'Net worth' },
            ...(detailed
              ? [
                  { className: 'swatch-area', label: 'What you own' },
                  { className: 'swatch-out', label: 'Cards and loans' },
                ]
              : []),
            ...(start ? [{ className: 'swatch-dash', label: start.label }] : []),
            { className: 'swatch-now', label: nowLabel },
          ]}
        />
      }
      table={<NetWorthTable rows={rows} currency={currency} />}
    >
      <div className="chart-plot" ref={ref}>
        <svg
          width={width}
          height={HEIGHT}
          viewBox={`0 0 ${width} ${HEIGHT}`}
          className="chart"
          role="img"
          aria-label={`Net worth over the last ${rows.length} months. The table view has the exact figures.`}
          {...hover.handlers}
        >
          <Group left={MARGIN.left} top={MARGIN.top}>
            <ValueAxis scale={amounts} innerWidth={innerWidth} currency={currency} />
            {showZero && <line className="chart-zero" x1={0} x2={innerWidth} y1={zero} y2={zero} />}
            {detailed && (
              <>
                {/* From zero up to what is owned: the area stands on zero, like the bars. */}
                <Area
                  className="area-own"
                  data={rows}
                  x={(row) => months(row.month) ?? 0}
                  y0={() => zero}
                  y1={(row) => amounts(row.assets_minor)}
                />
                {rows.map((row) =>
                  row.liabilities_minor < 0 ? (
                    <Bar
                      key={row.month}
                      className="bar-out"
                      x={(months(row.month) ?? 0) - barWidth / 2}
                      y={zero}
                      width={barWidth}
                      height={amounts(row.liabilities_minor) - zero}
                      rx={2}
                    />
                  ) : null,
                )}
              </>
            )}
            {start && (
              <line className="line-start" x1={0} x2={innerWidth} y1={amounts(start.value)} y2={amounts(start.value)} />
            )}

            <LinePath
              className="line-net"
              data={rows}
              x={(row) => months(row.month) ?? 0}
              y={(row) => amounts(row.net_worth_minor)}
            />

            {rows.map((row) => {
              const x = months(row.month) ?? 0;
              const y = amounts(row.net_worth_minor);
              const current = row.month === currentMonth;
              return current ? (
                <rect key={row.month} className="chart-now" x={x - 4} y={y - 4} width={8} height={8} />
              ) : (
                <circle key={row.month} className="line-dot" cx={x} cy={y} r={2.5} />
              );
            })}

            {hovered && hover.index !== null && (
              <>
                <line className="chart-hover-rule" x1={centers[hover.index]} x2={centers[hover.index]} y1={0} y2={INNER_H} />
                <circle className="chart-hover-dot" cx={centers[hover.index]} cy={amounts(hovered.net_worth_minor)} r={4} />
              </>
            )}

            <AxisBottom
              top={INNER_H}
              scale={months}
              tickValues={labelled}
              tickFormat={(month) => formatMonth(String(month)).slice(0, 3)}
              hideAxisLine
              hideTicks
              tickClassName="chart-tick"
              tickLabelProps={() => ({ textAnchor: 'middle', dy: '0.6em' })}
            />
          </Group>
        </svg>
        {hovered && hover.index !== null && (
          <ChartReadout x={MARGIN.left + centers[hover.index]!} plotWidth={width} title={formatMonth(hovered.month)}>
            <ReadoutLine label="Net worth" swatch="swatch-in">
              <Amount minor={hovered.net_worth_minor} currency={currency} />
            </ReadoutLine>
            <ReadoutLine label="Assets">
              <Amount minor={hovered.assets_minor} currency={currency} />
            </ReadoutLine>
            <ReadoutLine label="Cards and loans">
              <Amount minor={hovered.liabilities_minor} currency={currency} />
            </ReadoutLine>
          </ChartReadout>
        )}
      </div>
    </ChartFrame>
  );
}

// A frame that always includes zero, padded so nothing touches the edge.
function frameWithZero(values: number[]): { low: number; high: number; showZero: boolean } {
  const low = Math.min(0, ...values);
  const high = Math.max(0, ...values);
  const pad = (high - low || 100) * 0.05;
  return { low: low < 0 ? low - pad : 0, high: high + pad, showZero: low < 0 };
}

function NetWorthTable({ rows, currency }: { rows: NetWorthMonth[]; currency: Currency }) {
  return (
    <table className="ledger">
      <caption className="visually-hidden">Assets, what you owe, and net worth for each month</caption>
      <thead>
        <tr>
          <th scope="col">Month</th>
          <th scope="col" className="num">
            Assets
          </th>
          <th scope="col" className="num">
            Owed
          </th>
          <th scope="col" className="num">
            Net worth
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.month}>
            <th scope="row">{formatMonth(row.month)}</th>
            <td className="num">
              <Amount minor={row.assets_minor} currency={currency} />
            </td>
            <td className="num">
              <Amount minor={row.liabilities_minor} currency={currency} />
            </td>
            <td className="num">
              <Amount minor={row.net_worth_minor} currency={currency} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
