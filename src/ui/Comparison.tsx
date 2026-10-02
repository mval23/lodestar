import type { Currency } from '../lib/money';
import { Amount } from './Amount';

// A figure's context in one line: the signed difference and what it is
// compared with, such as "−$454.83 vs a typical Sep 1–24". The sign carries
// the direction; nothing is coloured, so more or less is never good or bad
// by colour alone.
export function Comparison({ delta, currency, against }: { delta: number; currency: Currency; against: string }) {
  return (
    <span className="comparison">
      <Amount minor={delta} currency={currency} signed /> {against}
    </span>
  );
}
