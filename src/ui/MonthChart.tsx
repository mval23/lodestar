import { Link } from 'react-router';
import { AxisBottom } from '@visx/axis';
import { Group } from '@visx/group';
import { scaleBand, scaleLinear, scalePoint } from '@visx/scale';
import { Bar } from '@visx/shape';
import { describeMoney, type Currency } from '../lib/money';
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
import { lineDomain } from './chartDomain';

// Two month-by-month charts for the detail pages. Money in is ink, money out
// is grey, and blue marks only the current month. Each one carries its table,
// so the exact figures are always one switch away, and one hover or tap
// shows them for a single month.

const HEIGHT = 220;
const INNER_H = HEIGHT - MARGIN.top - MARGIN.bottom;

const shortMonth = (month: string) => formatMonth(month).slice(0, 3);

// Every `step`th month from the end, so the current month always keeps its
// label however many have to be dropped.
function labelled<T>(items: T[], step: number): T[] {
  return items.filter((_, i) => (items.length - 1 - i) % step === 0);
}

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
  const { ref, width } = useChartWidth();
  const innerW = width - MARGIN.left - MARGIN.right;
  const months = scaleBand({ domain: rows.map((r) => r.month), range: [0, innerW], padding: 0.3 });
  const largest = Math.max(1, ...rows.map((r) => Math.max(r.value, r.plan ?? 0)));
  const amounts = scaleLinear({ domain: [0, largest], range: [INNER_H, 0], nice: true });
  const hasPlan = rows.some((r) => r.plan !== undefined && r.plan !== null);
  const centers = rows.map((r) => (months(r.month) ?? 0) + months.bandwidth() / 2);
  const hover = usePlotHover(centers);
  const hovered = hover.index !== null ? rows[hover.index] : undefined;
  const swatch = tone === 'in' ? 'swatch-in' : 'swatch-out';

  return (
    <ChartFrame
      title={title}
      caption={caption}
      legend={
        <ChartLegend
          items={[
            { className: swatch, label: valueLabel },
            ...(hasPlan && planLabel ? [{ className: 'swatch-in swatch-line', label: planLabel }] : []),
            { className: 'swatch-now', label: 'This month' },
          ]}
        />
      }
      table={<BarTable rows={rows} currency={currency} valueLabel={valueLabel} planLabel={hasPlan ? planLabel : undefined} linkFor={linkFor} />}
    >
      <div className="chart-plot" ref={ref}>
        <svg
          width={width}
          height={HEIGHT}
          viewBox={`0 0 ${width} ${HEIGHT}`}
          className="chart"
          role="img"
          aria-label={`${title}, ${rows.length} months. The table view has the exact figures.`}
          {...hover.handlers}
        >
          <Group left={MARGIN.left} top={MARGIN.top}>
            <ValueAxis scale={amounts} innerWidth={innerW} currency={currency} />
            {hover.index !== null && (
              // Bars mark their month with a tinted column: a rule would sit
              // on the bar itself and vanish.
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
              tickValues={labelled(rows, monthLabelStep(months.step())).map((r) => r.month)}
              tickFormat={(m) => shortMonth(String(m))}
              hideAxisLine
              hideTicks
              tickClassName="chart-tick"
              tickLabelProps={() => ({ textAnchor: 'middle', dy: '0.6em' })}
            />
          </Group>
        </svg>
        {hovered && hover.index !== null && (
          <ChartReadout x={MARGIN.left + centers[hover.index]!} plotWidth={width} title={formatMonth(hovered.month)}>
            <ReadoutLine label={valueLabel} swatch={swatch}>
              <Amount minor={hovered.value} currency={currency} />
            </ReadoutLine>
            {planLabel && hovered.plan !== undefined && hovered.plan !== null && (
              <ReadoutLine label={planLabel}>
                <Amount minor={hovered.plan} currency={currency} />
              </ReadoutLine>
            )}
          </ChartReadout>
        )}
      </div>
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
  const { ref, width } = useChartWidth();
  const innerW = width - MARGIN.left - MARGIN.right;
  const all = [...rows, ...ahead];
  // The target is part of the picture, so the range always reaches it.
  const values = [...all.map((p) => p.value), ...(target !== undefined && target !== null ? [target] : [])];
  const { low, high, showZero } = lineDomain(values);
  const months = scalePoint({ domain: all.map((p) => p.month), range: [0, innerW], padding: 0.3 });
  const amounts = scaleLinear({ domain: [low, high], range: [INNER_H, 0], nice: true });
  const points = (list: LinePoint[]) => list.map((p) => `${months(p.month) ?? 0},${amounts(p.value)}`).join(' ');
  const now = all.find((p) => p.month === currentMonth);
  const lastPast = rows[rows.length - 1];
  const centers = all.map((p) => months(p.month) ?? 0);
  const hover = usePlotHover(centers);
  const hovered = hover.index !== null ? all[hover.index] : undefined;
  const hoveredAhead = hover.index !== null && hover.index >= rows.length;

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
      <div className="chart-plot" ref={ref}>
        <svg
          width={width}
          height={HEIGHT}
          viewBox={`0 0 ${width} ${HEIGHT}`}
          className="chart"
          role="img"
          aria-label={`${title}. The table view has the exact figures.`}
          {...hover.handlers}
        >
          <Group left={MARGIN.left} top={MARGIN.top}>
            <ValueAxis scale={amounts} innerWidth={innerW} currency={currency} />
            {showZero && <line className="chart-zero" x1={0} x2={innerW} y1={amounts(0)} y2={amounts(0)} />}
            {target !== undefined && target !== null && (
              <line className="chart-target" x1={0} x2={innerW} y1={amounts(target)} y2={amounts(target)} />
            )}
            {rows.length > 0 && <polyline className="line-net" points={points(rows)} />}
            {ahead.length > 0 && lastPast && <polyline className="line-ahead" points={points([lastPast, ...ahead])} />}
            {now && (
              <>
                <line className="chart-now-rule" x1={months(now.month) ?? 0} x2={months(now.month) ?? 0} y1={0} y2={INNER_H} />
                <circle className="chart-now" cx={months(now.month) ?? 0} cy={amounts(now.value)} r={4.5} />
              </>
            )}
            {hovered && hover.index !== null && (
              <>
                <line className="chart-hover-rule" x1={centers[hover.index]} x2={centers[hover.index]} y1={0} y2={INNER_H} />
                <circle className="chart-hover-dot" cx={centers[hover.index]} cy={amounts(hovered.value)} r={3.5} />
              </>
            )}
            <AxisBottom
              top={INNER_H}
              scale={months}
              tickValues={labelled(all, monthLabelStep(months.step())).map((p) => p.month)}
              tickFormat={(m) => shortMonth(String(m))}
              hideAxisLine
              hideTicks
              tickClassName="chart-tick"
              tickLabelProps={() => ({ textAnchor: 'middle', dy: '0.6em' })}
            />
          </Group>
        </svg>
        {hovered && hover.index !== null && (
          <ChartReadout x={MARGIN.left + centers[hover.index]!} plotWidth={width} title={formatMonth(hovered.month)}>
            <ReadoutLine
              label={hoveredAhead ? (aheadLabel ?? 'Ahead') : valueLabel}
              swatch={hoveredAhead ? 'swatch-out' : 'swatch-in'}
            >
              <Amount minor={hovered.value} currency={currency} />
            </ReadoutLine>
          </ChartReadout>
        )}
      </div>
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
