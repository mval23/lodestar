import { AxisBottom } from '@visx/axis';
import { Group } from '@visx/group';
import { scaleLinear, scalePoint } from '@visx/scale';
import { LinePath } from '@visx/shape';
import type { Currency } from '../../lib/money';
import { formatMonth } from '../../lib/dates';
import { Amount } from '../../ui/Amount';
import { ChartFrame, ChartLegend } from '../../ui/Chart';
import { lineDomain } from '../../ui/chartDomain';
import type { NetWorthMonth } from './queries';

const WIDTH = 720;
const HEIGHT = 240;
const MARGIN = { top: 12, right: 8, bottom: 28, left: 8 };

// One ink line for net worth, framed on its own movement. A zero rule appears
// only when the line crosses zero, so a negative stretch reads as below the
// line rather than as a colour. The blue square marks now.
export function NetWorthChart({
  rows,
  currency,
  currentMonth,
}: {
  rows: NetWorthMonth[];
  currency: Currency;
  currentMonth: string;
}) {
  const innerWidth = WIDTH - MARGIN.left - MARGIN.right;
  const innerHeight = HEIGHT - MARGIN.top - MARGIN.bottom;

  const months = scalePoint({ domain: rows.map((row) => row.month), range: [0, innerWidth], padding: 0.5 });
  const values = rows.map((row) => row.net_worth_minor);
  const { low, high, showZero } = lineDomain(values);
  const amounts = scaleLinear({ domain: [low, high], range: [innerHeight, 0], nice: true });
  const latest = rows[rows.length - 1];

  return (
    <ChartFrame
      title="Net worth"
      caption="Everything you own, less what you owe, at the end of each month."
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
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="chart"
        role="img"
        aria-label={`Net worth over the last ${rows.length} months. The table view has the exact figures.`}
      >
        <Group left={MARGIN.left} top={MARGIN.top}>
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

          <AxisBottom
            top={innerHeight}
            scale={months}
            tickFormat={(month) => formatMonth(String(month)).slice(0, 3)}
            hideAxisLine
            hideTicks
            tickClassName="chart-tick"
            tickLabelProps={() => ({ textAnchor: 'middle', dy: '0.6em' })}
          />
        </Group>
      </svg>
      {latest && (
        <p className="footnote flush">
          Now: <Amount minor={latest.net_worth_minor} currency={currency} />
        </p>
      )}
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
