// Money is integer minor units: cents for USD, whole pesos for COP.
// The browser only parses and formats; every sum is computed in SQL.
// Never introduce a float here, and never round to hide one.

export type Currency = 'USD' | 'COP';

export const CURRENCIES: Record<Currency, { exponent: number; label: string }> = {
  USD: { exponent: 2, label: 'US dollars' },
  COP: { exponent: 0, label: 'Colombian pesos' },
};

export function isCurrency(value: string): value is Currency {
  return value === 'USD' || value === 'COP';
}

export function exponentOf(currency: Currency): number {
  return CURRENCIES[currency].exponent;
}

const MINUS = '−'; // U+2212, not a hyphen

// Intl gives "$1,234.50" for USD. For pesos the code reads better than a
// second "$", so COP is formatted with its code: "COP 1,200,000".
const formatters = new Map<string, Intl.NumberFormat>();

function formatterFor(currency: Currency): Intl.NumberFormat {
  const key = currency;
  let formatter = formatters.get(key);
  if (!formatter) {
    const exponent = exponentOf(currency);
    formatter = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      currencyDisplay: currency === 'COP' ? 'code' : 'symbol',
      minimumFractionDigits: exponent,
      maximumFractionDigits: exponent,
    });
    formatters.set(key, formatter);
  }
  return formatter;
}

export type FormatOptions = {
  // Show "+" on positive amounts, for money in.
  signed?: boolean;
  // Drop the currency symbol or code, for tight columns with a header.
  bare?: boolean;
};

export function formatMoney(minor: number, currency: Currency, options: FormatOptions = {}): string {
  const negative = minor < 0;
  const magnitude = Math.abs(minor);
  const exponent = exponentOf(currency);
  const value = exponent === 0 ? magnitude : magnitude / 10 ** exponent;

  let text = options.bare
    ? new Intl.NumberFormat('en-US', { minimumFractionDigits: exponent, maximumFractionDigits: exponent }).format(value)
    : formatterFor(currency).format(value);

  // Intl emits a hyphen-minus; the brand uses a true minus sign.
  text = text.replace(/-/g, MINUS);
  if (negative) return MINUS + text;
  if (options.signed && minor > 0) return '+' + text;
  return text;
}

// Chart axes only (BRAND.md §6): "$1.2M", "$800", "COP 4.5M". Everywhere
// else an amount is written in full; an axis label only has to say roughly
// where a grid line sits, and the exact figures are one hover or one table
// away.
const axisFormatters = new Map<Currency, Intl.NumberFormat>();

export function formatMoneyAxis(minor: number, currency: Currency): string {
  let formatter = axisFormatters.get(currency);
  if (!formatter) {
    formatter = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      currencyDisplay: currency === 'COP' ? 'code' : 'symbol',
      notation: 'compact',
      maximumFractionDigits: 1,
    });
    axisFormatters.set(currency, formatter);
  }
  const text = formatter.format(Math.abs(minor) / 10 ** exponentOf(currency));
  return minor < 0 ? MINUS + text : text;
}

// Spoken by screen readers, which read "−" poorly.
export function describeMoney(minor: number, currency: Currency): string {
  const words = formatMoney(Math.abs(minor), currency);
  return minor < 0 ? `minus ${words}` : words;
}

export type ParseResult = { ok: true; minor: number } | { ok: false; message: string };

const ALLOWED = /^[0-9.,\s]*$/;

// Accepts what people actually type: "1234.5", "1,234.50", "$1,234.50", " 12 ".
// Rejects anything that would need rounding or a guess.
export function parseMoney(input: string, currency: Currency): ParseResult {
  const exponent = exponentOf(currency);
  let text = input.trim().replace(/^[$]/, '').replace(/^COP/i, '').trim();
  if (text === '') return { ok: false, message: 'Enter an amount.' };
  if (text.startsWith('-') || text.startsWith(MINUS)) {
    return { ok: false, message: 'Enter a positive amount. The kind of transaction sets the direction.' };
  }
  if (!ALLOWED.test(text)) return { ok: false, message: 'Enter an amount using digits, like 1,234.50.' };

  text = text.replace(/[\s,]/g, '');
  const parts = text.split('.');
  if (parts.length > 2) return { ok: false, message: 'Enter an amount with one decimal point.' };

  const whole = parts[0] ?? '';
  const fraction = parts[1] ?? '';
  if (whole === '' && fraction === '') return { ok: false, message: 'Enter an amount.' };
  if (!/^\d*$/.test(whole) || !/^\d*$/.test(fraction)) {
    return { ok: false, message: 'Enter an amount using digits, like 1,234.50.' };
  }

  if (exponent === 0 && fraction !== '') {
    return { ok: false, message: 'Colombian pesos don’t use decimals. Enter a whole amount.' };
  }
  if (fraction.length > exponent) {
    return { ok: false, message: `Enter at most ${exponent} decimal places.` };
  }

  const padded = fraction.padEnd(exponent, '0');
  const digits = `${whole === '' ? '0' : whole}${padded}`;
  if (digits.length > 15) return { ok: false, message: 'That amount is too large.' };

  const minor = Number(digits);
  if (!Number.isSafeInteger(minor)) return { ok: false, message: 'That amount is too large.' };
  return { ok: true, minor };
}

// For an <input> that holds an existing amount: "1234.50", no symbol.
export function toAmountInput(minor: number, currency: Currency): string {
  return formatMoney(Math.abs(minor), currency, { bare: true }).replace(/,/g, '');
}
