import { AxisBottom } from '@visx/axis';
import { Group } from '@visx/group';
import { scaleLinear, scalePoint } from '@visx/scale';
import { LinePath } from '@visx/shape';
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
export function NetWorthChart({
  rows,
  currency,
  currentMonth,
}: {
  rows: NetWorthMonth[];
  currency: Currency;
  currentMonth: string;
}) {
  const { ref, width } = useChartWidth();
  const innerWidth = width - MARGIN.left - MARGIN.right;

  const months = scalePoint({ domain: rows.map((row) => row.month), range: [0, innerWidth], padding: 0.5 });
  const values = rows.map((row) => row.net_worth_minor);
  const { low, high, showZero } = lineDomain(values);
  const amounts = scaleLinear({ domain: [low, high], range: [INNER_H, 0], nice: true });
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
          Everything you own, less what you owe, at the end of each month.
          {latest && (
            <>
              {' '}
              Now <Amount minor={latest.net_worth_minor} currency={currency} />.
            </>
          )}
        </>
      }
      legend={
        <ChartLegend
          items={[
            { className: 'swatch-in', label: 'Net worth' },
            { className: 'swatch-now', label: 'This month' },
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
            {showZero && <line className="chart-zero" x1={0} x2={innerWidth} y1={amounts(0)} y2={amounts(0)} />}

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
