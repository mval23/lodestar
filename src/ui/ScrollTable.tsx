import type { ReactNode } from 'react';

// A table that may be wider than a phone: it scrolls sideways inside its
// card instead of widening the whole page (which makes a phone zoom the page
// out). The region takes focus, so a keyboard can scroll it too, and its
// label names it for a screen reader.
export function ScrollTable({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="table-scroll" tabIndex={0} role="region" aria-label={label}>
      {children}
    </div>
  );
}
