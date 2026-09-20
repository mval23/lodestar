import { useId, useState, type ReactNode } from 'react';

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
  caption?: string;
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
