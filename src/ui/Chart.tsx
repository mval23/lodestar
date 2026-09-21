import { useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { formatMoneyAxis, type Currency } from '../lib/money';

// Every chart in Lodestar carries the same contract: a title, a "Show as
// table" switch, and the same data underneath both. A chart nobody can read
// is not information, so the table is not a fallback for failure — it is the
// second half of the chart.
export function ChartFrame({
  title,
  caption,
  legend,
  table,
  children,
}: {
  title: string;
  caption?: ReactNode;
  legend?: ReactNode;
  table: ReactNode;
  children: ReactNode;
}) {
  const [asTable, setAsTable] = useState(false);
  const regionId = useId();

  return (
    <section className="group chart-card">
      <header className="chart-head">
        <div>
          <h2 className="headline">{title}</h2>
          {caption && <p className="footnote flush">{caption}</p>}
        </div>
        <button
          type="button"
          className="btn btn-plain"
          aria-expanded={asTable}
          aria-controls={regionId}
          onClick={() => setAsTable((current) => !current)}
        >
          {asTable ? 'Show as chart' : 'Show as table'}
        </button>
      </header>

      <div id={regionId}>
        {asTable ? (
          <div className="table-wrap">{table}</div>
        ) : (
          <>
            {children}
            {legend && <p className="chart-legend">{legend}</p>}
          </>
        )}
      </div>
    </section>
  );
}

export function ChartLegend({ items }: { items: { className: string; label: string }[] }) {
  return (
    <>
      {items.map((item) => (
        <span key={item.label} className="legend-item">
          <span className={`swatch ${item.className}`} aria-hidden />
          {item.label}
        </span>
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// Drawing at the real size. A chart used to be drawn 720 wide and scaled to
// fit, so its 12 px labels became 16 px on a desktop and 5 px on a phone.
// Now it measures the width it is given and draws at exactly that, in CSS
// pixels: a label is the size it says, and the hairlines stay hairlines.
// ---------------------------------------------------------------------------

// Charts share one set of margins. The trailing side holds the amounts, as
// Apple's charts do; the bottom holds the months.
export const CHART_MARGIN = { top: 12, right: 60, bottom: 28, left: 4 };

export function useChartWidth(fallback = 720) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(fallback);

  useLayoutEffect(() => {
    const element = ref.current;
    // Without ResizeObserver (a test environment), the fallback stands.
    if (!element || typeof ResizeObserver === 'undefined') return;
    const measure = () => {
      const next = Math.round(element.getBoundingClientRect().width);
      if (next > 0) setWidth(Math.max(240, next));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return { ref, width };
}

// Which month the pointer is over: the nearest column to it, on hover, on a
// press, or under a finger as it slides. Listening on the whole plot rather
// than on targets over it leaves any links in the chart clickable.
export function usePlotHover(xs: number[], left: number = CHART_MARGIN.left) {
  const [index, setIndex] = useState<number | null>(null);

  const pick = (event: React.PointerEvent<SVGSVGElement>) => {
    if (xs.length === 0) return;
    const box = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - box.left - left;
    let nearest = 0;
    for (let i = 1; i < xs.length; i += 1) {
      if (Math.abs(xs[i]! - x) < Math.abs(xs[nearest]! - x)) nearest = i;
    }
    setIndex(nearest);
  };

  return {
    index,
    handlers: {
      onPointerMove: pick,
      onPointerDown: pick,
      onPointerLeave: () => setIndex(null),
    },
  };
}

// The amounts on a light grid: three to five round values, labelled short
// on the trailing side. The grid is drawn at the labelled values, so every
// line can be read.
type LinearScale = ((value: number) => number | undefined) & { ticks: (count?: number) => number[] };

export function ValueAxis({
  scale,
  innerWidth,
  currency,
}: {
  scale: LinearScale;
  innerWidth: number;
  currency: Currency;
}) {
  return (
    <g aria-hidden="true">
      {scale.ticks(4).map((value) => {
        const y = scale(value) ?? 0;
        return (
          <g key={value}>
            <line className="chart-grid" x1={0} x2={innerWidth} y1={y} y2={y} />
            <text className="chart-axis-label" x={innerWidth + 8} y={y} dominantBaseline="middle">
              {formatMoneyAxis(value, currency)}
            </text>
          </g>
        );
      })}
    </g>
  );
}

// Month labels thin out when columns are narrow, so they never collide:
// every label on a desktop, every other one or fewer on a phone.
export function monthLabelStep(columnWidth: number): number {
  return Math.max(1, Math.ceil(34 / Math.max(1, columnWidth)));
}

// The exact figures for the month under the pointer, in real text beside a
// thin rule. It repeats what the table says, so it is hidden from screen
// readers, who have the table.
export function ChartReadout({
  x,
  plotWidth,
  title,
  children,
}: {
  x: number;
  plotWidth: number;
  title: string;
  children: ReactNode;
}) {
  const width = 176;
  const left = Math.min(Math.max(0, x - width / 2), Math.max(0, plotWidth - width));
  return (
    <div className="chart-readout" style={{ left, width }} aria-hidden="true">
      <p className="chart-readout-title">{title}</p>
      {children}
    </div>
  );
}

export function ReadoutLine({ label, children, swatch }: { label: string; children: ReactNode; swatch?: string }) {
  return (
    <p className="chart-readout-line">
      <span className="chart-readout-label">
        {swatch && <span className={`swatch ${swatch}`} />}
        {label}
      </span>
      <span className="num">{children}</span>
    </p>
  );
}
