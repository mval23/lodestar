import { describeMoney, formatMoney, type Currency, type FormatOptions } from '../lib/money';

// Every amount on screen goes through here: tabular figures, a true minus
// sign, and a spoken form that screen readers read correctly.
export function Amount({
  minor,
  currency,
  signed,
  bare,
  className,
}: {
  minor: number;
  currency: Currency;
  className?: string;
} & FormatOptions) {
  const options: FormatOptions = { signed, bare };
  return (
    <span className={['num', className].filter(Boolean).join(' ')}>
      <span aria-hidden="true">{formatMoney(minor, currency, options)}</span>
      <span className="visually-hidden">{describeMoney(minor, currency)}</span>
    </span>
  );
}
