// Percentages for display, from figures the database returned: a share of a
// total and a change on an earlier figure. Intl formats them, and a falling
// change carries a true minus sign.

// A share as a percentage, one decimal: "19.6%".
export function share(part: number, whole: number): string {
  if (whole === 0) return '—';
  return new Intl.NumberFormat('en-US', { style: 'percent', maximumFractionDigits: 1 }).format(part / whole);
}

// A signed percentage change, true minus: "+4.4%", "−0.1%".
export function percentChange(current: number, before: number): string {
  if (before === 0) return '';
  const text = new Intl.NumberFormat('en-US', {
    style: 'percent',
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
    signDisplay: 'exceptZero',
  }).format((current - before) / Math.abs(before));
  return text.replace('-', '−');
}
