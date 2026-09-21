import { Link } from 'react-router';
import { AxisBottom } from '@visx/axis';
import { Group } from '@visx/group';
import { scaleBand, scaleLinear, scalePoint } from '@visx/scale';
import { Bar } from '@visx/shape';
import { describeMoney, type Currency } from '../lib/money';
import { formatMonth } from '../lib/dates';
import { Amount } from './Amount';
import { ChartFrame, ChartLegend } from './Chart';

// Two month-by-month charts for the detail pages. Money in is ink, money out
// is grey, and blue marks only the current month. Each one carries its table,
// so the exact figures are always one switch away.

const WIDTH = 720;
const HEIGHT = 220;
const MARGIN = { top: 12, right: 8, bottom: 28, left: 8 };
const INNER_W = WIDTH - MARGIN.left - MARGIN.right;
const INNER_H = HEIGHT - MARGIN.top - MARGIN.bottom;

const shortMonth = (month: string) => formatMonth(month).slice(0, 3);

export type BarRow = { month: string; value: number; plan?: number | null };

export function MonthBars({
  title,
  caption,
  rows,
  currency,
  currentMonth,
  tone,
  valueLabel,
  planLabel,
  linkFor,
}: {
  title: string;
  caption?: string;
  rows: BarRow[];
  currency: Currency;
  currentMonth: string;
  tone: 'in' | 'out';
  valueLabel: string;
  planLabel?: string;
  linkFor?: (month: string) => string;
}) {
  const months = scaleBand({ domain: rows.map((r) => r.month), range: [0, INNER_W], padding: 0.3 });
  const largest = Math.max(1, ...rows.map((r) => Math.max(r.value, r.plan ?? 0)));
  const amounts = scaleLinear({ domain: [0, largest], range: [INNER_H, 0], nice: true });
  const hasPlan = rows.some((r) => r.plan !== undefined && r.plan !== null);

  return (
    <ChartFrame
      title={title}
      caption={caption}
      legend={
        <ChartLegend
          items={[
            { className: tone === 'in' ? 'swatch-in' : 'swatch-out', label: valueLabel },
            ...(hasPlan && planLabel ? [{ className: 'swatch-in swatch-line', label: planLabel }] : []),
            { className: 'swatch-now', label: 'This month' },
          ]}
        />
      }
      table={<BarTable rows={rows} currency={currency} valueLabel={valueLabel} planLabel={hasPlan ? planLabel : undefined} linkFor={linkFor} />}
    >
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="chart"
        role="img"
        aria-label={`${title}, ${rows.length} months. The table view has the exact figures.`}
      >
        <Group left={MARGIN.left} top={MARGIN.top}>
          {[0.25, 0.5, 0.75, 1].map((step) => (
            <line key={step} className="chart-grid" x1={0} x2={INNER_W} y1={amounts(largest * step)} y2={amounts(largest * step)} />
          ))}
          {rows.map((row) => {
            const x = months(row.month) ?? 0;
            const bar = (
              <Bar
                className={tone === 'in' ? 'bar-in' : 'bar-out'}
                x={x}
                y={amounts(row.value)}
                width={months.bandwidth()}
                height={INNER_H - amounts(row.value)}
                rx={2}
              />
            );
            return (
              <Group key={row.month}>
                {linkFor ? (
                  <Link to={linkFor(row.month)} aria-label={`${formatMonth(row.month)}: ${describeMoney(row.value, currency)}`}>
                    {bar}
                  </Link>
                ) : (
                  bar
                )}
                {row.plan !== undefined && row.plan !== null && (
                  <line className="chart-plan" x1={x - 3} x2={x + months.bandwidth() + 3} y1={amounts(row.plan)} y2={amounts(row.plan)} />
                )}
                {row.month === currentMonth && (
                  <rect className="chart-now" x={x + months.bandwidth() / 2 - 3} y={INNER_H + 4} width={6} height={6} />
                )}
              </Group>
            );
          })}
          <AxisBottom
            top={INNER_H}
            scale={months}
            tickFormat={(m) => shortMonth(String(m))}
            hideAxisLine
            hideTicks
            tickClassName="chart-tick"
            tickLabelProps={() => ({ textAnchor: 'middle', dy: '0.6em' })}
          />
        </Group>
      </svg>
    </ChartFrame>
  );
}

function BarTable({
  rows,
  currency,
  valueLabel,
  planLabel,
  linkFor,
}: {
  rows: BarRow[];
  currency: Currency;
  valueLabel: string;
  planLabel?: string;
  linkFor?: (month: string) => string;
}) {
  return (
    <table className="ledger">
      <thead>
        <tr>
          <th scope="col">Month</th>
          {planLabel && (
            <th scope="col" className="num">
              {planLabel}
            </th>
          )}
          <th scope="col" className="num">
            {valueLabel}
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.month}>
            <th scope="row">{linkFor ? <Link to={linkFor(row.month)}>{formatMonth(row.month)}</Link> : formatMonth(row.month)}</th>
            {planLabel && (
              <td className="num">{row.plan === null || row.plan === undefined ? '—' : <Amount minor={row.plan} currency={currency} />}</td>
            )}
            <td className="num">
              <Amount minor={row.value} currency={currency} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export type LinePoint = { month: string; value: number };

// A balance over time. An optional dashed continuation shows where a plan
// leads, and an optional target draws a dashed rule at that height.
export function MonthLine({
  title,
  caption,
  rows,
  ahead = [],
  target,
  currency,
  currentMonth,
  valueLabel,
  aheadLabel,
}: {
  title: string;
  caption?: string;
  rows: LinePoint[];
  ahead?: LinePoint[];
  target?: number | null;
  currency: Currency;
  currentMonth: string;
  valueLabel: string;
  aheadLabel?: string;
}) {
  const all = [...rows, ...ahead];
  const values = [...all.map((p) => p.value), target ?? 0, 0];
  const low = Math.min(...values);
  const high = Math.max(1, ...values);
  const months = scalePoint({ domain: all.map((p) => p.month), range: [0, INNER_W], padding: 0.3 });
  const amounts = scaleLinear({ domain: [low, high], range: [INNER_H, 0], nice: true });
  const points = (list: LinePoint[]) => list.map((p) => `${months(p.month) ?? 0},${amounts(p.value)}`).join(' ');
  const now = all.find((p) => p.month === currentMonth);
  const lastPast = rows[rows.length - 1];
  // Only every other label fits once the chart looks ahead as well as back.
  const every = all.length > 14 ? 3 : all.length > 8 ? 2 : 1;

  return (
    <ChartFrame
      title={title}
      caption={caption}
      legend={
        <ChartLegend
          items={[
            { className: 'swatch-in', label: valueLabel },
            ...(ahead.length > 0 && aheadLabel ? [{ className: 'swatch-out swatch-line', label: aheadLabel }] : []),
            { className: 'swatch-now', label: 'This month' },
          ]}
        />
      }
      table={<LineTable rows={rows} ahead={ahead} currency={currency} valueLabel={valueLabel} aheadLabel={aheadLabel} />}
    >
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="chart"
        role="img"
        aria-label={`${title}. The table view has the exact figures.`}
      >
        <Group left={MARGIN.left} top={MARGIN.top}>
          {[0.25, 0.5, 0.75, 1].map((step) => {
            const y = amounts(low + (high - low) * step);
            return <line key={step} className="chart-grid" x1={0} x2={INNER_W} y1={y} y2={y} />;
          })}
          {low < 0 && <line className="chart-zero" x1={0} x2={INNER_W} y1={amounts(0)} y2={amounts(0)} />}
          {target !== undefined && target !== null && (
            <line className="chart-target" x1={0} x2={INNER_W} y1={amounts(target)} y2={amounts(target)} />
          )}
          {rows.length > 0 && <polyline className="line-net" points={points(rows)} />}
          {ahead.length > 0 && lastPast && <polyline className="line-ahead" points={points([lastPast, ...ahead])} />}
          {now && (
            <>
              <line className="chart-now-rule" x1={months(now.month) ?? 0} x2={months(now.month) ?? 0} y1={0} y2={INNER_H} />
              <circle className="chart-now" cx={months(now.month) ?? 0} cy={amounts(now.value)} r={4.5} />
            </>
          )}
          <AxisBottom
            top={INNER_H}
            scale={months}
            tickValues={all.filter((_, i) => i % every === 0 || i === all.length - 1).map((p) => p.month)}
            tickFormat={(m) => shortMonth(String(m))}
            hideAxisLine
            hideTicks
            tickClassName="chart-tick"
            tickLabelProps={() => ({ textAnchor: 'middle', dy: '0.6em' })}
          />
        </Group>
      </svg>
    </ChartFrame>
  );
}

function LineTable({
  rows,
  ahead,
  currency,
  valueLabel,
  aheadLabel,
}: {
  rows: LinePoint[];
  ahead: LinePoint[];
  currency: Currency;
  valueLabel: string;
  aheadLabel?: string;
}) {
  return (
    <table className="ledger">
      <thead>
        <tr>
          <th scope="col">Month</th>
          <th scope="col" className="num">
            {valueLabel}
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((p) => (
          <tr key={p.month}>
            <th scope="row">{formatMonth(p.month)}</th>
            <td className="num">
              <Amount minor={p.value} currency={currency} />
            </td>
          </tr>
        ))}
        {ahead.map((p) => (
          <tr key={p.month}>
            <th scope="row">
              {formatMonth(p.month)} <span className="secondary">({aheadLabel ?? 'ahead'})</span>
            </th>
            <td className="num secondary">
              <Amount minor={p.value} currency={currency} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
