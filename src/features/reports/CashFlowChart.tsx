import { Link } from 'react-router';
import { AxisBottom } from '@visx/axis';
import { Group } from '@visx/group';
import { scaleBand, scaleLinear } from '@visx/scale';
import { Bar, LinePath } from '@visx/shape';
import { formatMoney, type Currency } from '../../lib/money';
import { formatMonth } from '../../lib/dates';
import { monthPath } from '../../lib/routes';
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
import type { CashFlowMonth } from './queries';

const HEIGHT = 240;
const INNER_H = HEIGHT - MARGIN.top - MARGIN.bottom;

// Money in is ink, money out is grey, and they are told apart by lightness
// as well as position. Blue marks only "now": on Reports, which counts
// complete months, that is the latest complete month. Gains and losses are
// never red against green.
//
// On the Cash flow report the net is drawn too, as an ink line, and the
// same months a year earlier as a dashed one (only for months that had
// activity then), so the comparison is on the chart, not only in a table.
export function CashFlowChart({
  rows,
  currency,
  currentMonth,
  nowLabel = 'This month',
  netLine = false,
  previousNet,
}: {
  rows: CashFlowMonth[];
  currency: Currency;
  currentMonth: string;
  nowLabel?: string;
  netLine?: boolean;
  // Net for the same month a year earlier, null where that month was empty.
  previousNet?: (number | null)[];
}) {
  const { ref, width } = useChartWidth();
  const innerWidth = width - MARGIN.left - MARGIN.right;

  const months = scaleBand({
    domain: rows.map((row) => row.month),
    range: [0, innerWidth],
    padding: 0.25,
  });
  const largest = Math.max(1, ...rows.map((row) => Math.max(row.money_in_minor, row.money_out_minor)));
  const previous = previousNet ?? [];
  const lows = [0, ...(netLine ? rows.map((row) => row.net_minor) : []), ...previous.map((v) => v ?? 0)];
  const amounts = scaleLinear({ domain: [Math.min(...lows), largest], range: [INNER_H, 0], nice: true });
  // Bars stand on zero, which is the bottom unless a net line dips below it.
  const zero = amounts(0);
  const priorPoints = rows
    .map((row, i) => ({ month: row.month, value: previous[i] ?? null }))
    .filter((point): point is { month: string; value: number } => point.value !== null);
  const pairWidth = months.bandwidth() / 2;
  const centers = rows.map((row) => (months(row.month) ?? 0) + months.bandwidth() / 2);
  const hover = usePlotHover(centers);
  const hovered = hover.index !== null ? rows[hover.index] : undefined;
  const step = monthLabelStep(months.step());
  const labelled = rows.filter((_, i) => (rows.length - 1 - i) % step === 0).map((row) => row.month);

  return (
    <ChartFrame
      title="Cash flow"
      caption="Money in and money out each month. Transfers between your own accounts are left out."
      legend={
        <ChartLegend
          items={[
            { className: 'swatch-in', label: 'Money in' },
            { className: 'swatch-out', label: 'Money out' },
            ...(netLine ? [{ className: 'swatch-in swatch-line', label: 'Net' }] : []),
            ...(priorPoints.length > 0 ? [{ className: 'swatch-dash', label: 'Net, a year earlier' }] : []),
            { className: 'swatch-now', label: nowLabel },
          ]}
        />
      }
      table={<CashFlowTable rows={rows} currency={currency} />}
    >
      <div className="chart-plot" ref={ref}>
        <svg
          width={width}
          height={HEIGHT}
          viewBox={`0 0 ${width} ${HEIGHT}`}
          className="chart"
          role="img"
          aria-label={`Money in and out for the last ${rows.length} months. The table view has the exact figures.`}
          {...hover.handlers}
        >
          <Group left={MARGIN.left} top={MARGIN.top}>
            <ValueAxis scale={amounts} innerWidth={innerWidth} currency={currency} />
            {hover.index !== null && (
              // A month of bars is marked with a tinted column: a rule would
              // run down the seam between money in and money out and vanish.
              <rect
                className="chart-hover-band"
                x={centers[hover.index]! - months.step() / 2}
                y={0}
                width={months.step()}
                height={INNER_H}
              />
            )}

            {rows.map((row) => {
              const x = months(row.month) ?? 0;
              const current = row.month === currentMonth;
              return (
                <Group key={row.month}>
                  <Bar
                    className="bar-in"
                    x={x}
                    y={amounts(row.money_in_minor)}
                    width={pairWidth}
                    height={zero - amounts(row.money_in_minor)}
                    rx={2}
                  />
                  <Bar
                    className="bar-out"
                    x={x + pairWidth}
                    y={amounts(row.money_out_minor)}
                    width={pairWidth}
                    height={zero - amounts(row.money_out_minor)}
                    rx={2}
                  />
                  {current && (
                    // The fix: a blue square marking where "now" is.
                    <rect className="chart-now" x={x + months.bandwidth() / 2 - 3} y={INNER_H + 4} width={6} height={6} />
                  )}
                </Group>
              );
            })}

            {zero < INNER_H && <line className="chart-zero" x1={0} x2={innerWidth} y1={zero} y2={zero} />}
            {priorPoints.length > 1 && (
              <LinePath
                className="line-prior"
                data={priorPoints}
                x={(point) => (months(point.month) ?? 0) + months.bandwidth() / 2}
                y={(point) => amounts(point.value)}
              />
            )}
            {netLine && (
              <>
                <LinePath
                  className="line-net"
                  data={rows}
                  x={(row) => (months(row.month) ?? 0) + months.bandwidth() / 2}
                  y={(row) => amounts(row.net_minor)}
                />
                {rows.map((row) => (
                  <circle
                    key={row.month}
                    className="line-dot"
                    cx={(months(row.month) ?? 0) + months.bandwidth() / 2}
                    cy={amounts(row.net_minor)}
                    r={3}
                  />
                ))}
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
            <ReadoutLine label="Money in" swatch="swatch-in">
              <Amount minor={hovered.money_in_minor} currency={currency} />
            </ReadoutLine>
            <ReadoutLine label="Money out" swatch="swatch-out">
              <Amount minor={hovered.money_out_minor} currency={currency} />
            </ReadoutLine>
            <ReadoutLine label="Net">
              <Amount minor={hovered.net_minor} currency={currency} signed />
            </ReadoutLine>
            {previous[hover.index] !== undefined && previous[hover.index] !== null && (
              <ReadoutLine label="A year earlier">
                <Amount minor={previous[hover.index]!} currency={currency} signed />
              </ReadoutLine>
            )}
          </ChartReadout>
        )}
      </div>
    </ChartFrame>
  );
}

function CashFlowTable({ rows, currency }: { rows: CashFlowMonth[]; currency: Currency }) {
  return (
    <table className="ledger">
      <caption className="visually-hidden">Money in, money out and the net for each month</caption>
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
            Net
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.month}>
            <th scope="row">
              <Link to={monthPath(row.month)}>{formatMonth(row.month)}</Link>
            </th>
            <td className="num">
              <Amount minor={row.money_in_minor} currency={currency} />
            </td>
            <td className="num">
              <Amount minor={row.money_out_minor} currency={currency} />
            </td>
            <td className="num">
              <Amount minor={row.net_minor} currency={currency} signed />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function cashFlowSummaryLabel(rows: CashFlowMonth[], currency: Currency): string {
  if (rows.length === 0) return 'No months yet';
  const latest = rows[rows.length - 1]!;
  return `${formatMonth(latest.month)}: ${formatMoney(latest.net_minor, currency, { signed: true })}`;
}
