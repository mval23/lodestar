// The vertical range for a balance line. A balance is read for its movement,
// and pinning the axis to zero flattens it: a net worth of $65,000 that moved
// four percent over the year becomes a straight line in the top fifth of the
// frame. So zero joins the range only when the line actually reaches it, and
// the rest is padded so the line never touches the edge.
//
// The range never crosses zero on the data's behalf: an all-positive series
// never grows a negative stretch, and an all-negative one (a loan) never grows
// a positive one. `showZero` says whether a zero rule belongs on the chart.
export function lineDomain(values: number[]): { low: number; high: number; showZero: boolean } {
  if (values.length === 0) return { low: 0, high: 1, showZero: false };

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;
  // A flat line still needs some room: five percent of its size, and at
  // least one currency unit so a zero balance has a range at all.
  const pad = span > 0 ? span * 0.1 : Math.max(Math.abs(max) * 0.05, 100);

  let low = min - pad;
  let high = max + pad;
  // Zero counts as the positive side: an all-zero line, or a new account,
  // draws upwards from zero rather than collapsing to nothing.
  if (min >= 0 && low < 0) low = 0;
  if (max < 0 && high > 0) high = 0;

  return { low, high, showZero: low < 0 && high > 0 };
}
