import { describeMoney, formatMoney, formatMoneyAxis, parseMoney, toAmountInput } from './money';

const MINUS = '−';
const NBSP = ' '; // Intl keeps the code attached to the number

describe('formatMoney', () => {
  it('formats dollars with a symbol and cents', () => {
    expect(formatMoney(123450, 'USD')).toBe('$1,234.50');
    expect(formatMoney(0, 'USD')).toBe('$0.00');
    expect(formatMoney(5, 'USD')).toBe('$0.05');
  });

  it('formats pesos with the code and no decimals', () => {
    expect(formatMoney(1200000, 'COP')).toBe(`COP${NBSP}1,200,000`);
    expect(formatMoney(0, 'COP')).toBe(`COP${NBSP}0`);
  });

  it('uses a true minus sign, never a hyphen', () => {
    expect(formatMoney(-8420, 'USD')).toBe(`${MINUS}$84.20`);
    expect(formatMoney(-8420, 'USD')).not.toContain('-');
    expect(formatMoney(-1200000, 'COP')).toBe(`${MINUS}COP${NBSP}1,200,000`);
  });

  it('marks money in when asked', () => {
    expect(formatMoney(12000, 'USD', { signed: true })).toBe('+$120.00');
    expect(formatMoney(-12000, 'USD', { signed: true })).toBe(`${MINUS}$120.00`);
    expect(formatMoney(0, 'USD', { signed: true })).toBe('$0.00');
  });

  it('can drop the symbol for a column with a header', () => {
    expect(formatMoney(123450, 'USD', { bare: true })).toBe('1,234.50');
    expect(formatMoney(1200000, 'COP', { bare: true })).toBe('1,200,000');
  });

  it('describes an amount in words for screen readers', () => {
    expect(describeMoney(-8420, 'USD')).toBe('minus $84.20');
    expect(describeMoney(8420, 'USD')).toBe('$84.20');
  });
});

describe('parseMoney', () => {
  it.each([
    ['1234.50', 123450],
    ['1,234.50', 123450],
    ['$1,234.50', 123450],
    ['  12  ', 1200],
    ['0.05', 5],
    ['.5', 50],
    ['1234.5', 123450],
  ])('reads %s as %i cents', (input, minor) => {
    expect(parseMoney(input, 'USD')).toEqual({ ok: true, minor });
  });

  it('reads whole pesos', () => {
    expect(parseMoney('1,200,000', 'COP')).toEqual({ ok: true, minor: 1200000 });
    expect(parseMoney('COP 5000', 'COP')).toEqual({ ok: true, minor: 5000 });
  });

  it('refuses decimals in pesos instead of rounding them away', () => {
    const result = parseMoney('1000.50', 'COP');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/don’t use decimals/);
  });

  it('refuses a third decimal place rather than rounding', () => {
    const result = parseMoney('1.005', 'USD');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/at most 2 decimal places/);
  });

  it('refuses a negative amount, and says why', () => {
    for (const input of ['-5', `${MINUS}5`]) {
      const result = parseMoney(input, 'USD');
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.message).toMatch(/positive/);
    }
  });

  it.each(['', '   ', 'abc', '1.2.3', '12a', '$'])('refuses %s', (input) => {
    expect(parseMoney(input, 'USD').ok).toBe(false);
  });

  it('refuses an amount too large to hold exactly', () => {
    expect(parseMoney('99999999999999999', 'COP').ok).toBe(false);
  });

  it('never loses a cent to floating point', () => {
    // 0.1 + 0.2 territory: these are exactly the inputs a float would ruin.
    expect(parseMoney('0.10', 'USD')).toEqual({ ok: true, minor: 10 });
    expect(parseMoney('0.20', 'USD')).toEqual({ ok: true, minor: 20 });
    expect(parseMoney('8.20', 'USD')).toEqual({ ok: true, minor: 820 });
    expect(parseMoney('1.15', 'USD')).toEqual({ ok: true, minor: 115 });
    expect(parseMoney('4.35', 'USD')).toEqual({ ok: true, minor: 435 });
    expect(parseMoney('1234567.89', 'USD')).toEqual({ ok: true, minor: 123456789 });
  });
});

describe('toAmountInput', () => {
  it('round-trips through the form field', () => {
    for (const minor of [0, 5, 820, 123450, 999999999]) {
      const text = toAmountInput(minor, 'USD');
      expect(parseMoney(text, 'USD')).toEqual({ ok: true, minor });
    }
    for (const minor of [0, 5000, 1200000]) {
      const text = toAmountInput(minor, 'COP');
      expect(parseMoney(text, 'COP')).toEqual({ ok: true, minor });
    }
  });
});

describe('formatMoneyAxis', () => {
  it('writes an axis label short, for chart axes only', () => {
    expect(formatMoneyAxis(0, 'USD')).toBe('$0');
    expect(formatMoneyAxis(80_000, 'USD')).toBe('$800');
    expect(formatMoneyAxis(120_000_000, 'USD')).toBe('$1.2M');
    expect(formatMoneyAxis(4_500_000, 'COP')).toBe(`COP${NBSP}4.5M`);
  });

  it('keeps the true minus sign', () => {
    expect(formatMoneyAxis(-250_000, 'USD')).toBe('−$2.5K');
  });
});
