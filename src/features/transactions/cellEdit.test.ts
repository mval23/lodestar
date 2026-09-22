import { nextCell, parseCell } from './cellEdit';

const ROWS = ['a', 'b', 'c'];
const CURRENT = { occurred_on: '2026-09-27', description: 'EPM', amount_minor: 17900 };
const CONTEXT = { currency: 'USD' as const, fallbackDescription: 'Housing & Utilities' };

describe('nextCell', () => {
  it('moves along a row with Tab, and wraps onto the next', () => {
    expect(nextCell(ROWS, { row: 'a', field: 'date' }, 'right')).toEqual({ row: 'a', field: 'description' });
    expect(nextCell(ROWS, { row: 'a', field: 'amount' }, 'right')).toEqual({ row: 'b', field: 'date' });
  });

  it('moves back with Shift+Tab, and wraps onto the previous row', () => {
    expect(nextCell(ROWS, { row: 'b', field: 'description' }, 'left')).toEqual({ row: 'b', field: 'date' });
    expect(nextCell(ROWS, { row: 'b', field: 'date' }, 'left')).toEqual({ row: 'a', field: 'amount' });
  });

  it('keeps the column with Enter and Shift+Enter', () => {
    expect(nextCell(ROWS, { row: 'a', field: 'amount' }, 'down')).toEqual({ row: 'b', field: 'amount' });
    expect(nextCell(ROWS, { row: 'c', field: 'date' }, 'up')).toEqual({ row: 'b', field: 'date' });
  });

  it('ends the edit off the edge of the table', () => {
    expect(nextCell(ROWS, { row: 'c', field: 'amount' }, 'down')).toBeNull();
    expect(nextCell(ROWS, { row: 'c', field: 'amount' }, 'right')).toBeNull();
    expect(nextCell(ROWS, { row: 'a', field: 'date' }, 'up')).toBeNull();
    expect(nextCell(ROWS, { row: 'a', field: 'date' }, 'left')).toBeNull();
  });

  it('goes nowhere from a row it does not know', () => {
    expect(nextCell(ROWS, { row: 'gone', field: 'date' }, 'down')).toBeNull();
  });
});

describe('parseCell', () => {
  it('writes nothing when a cell is left as it was', () => {
    expect(parseCell('date', '2026-09-27', CURRENT, CONTEXT)).toEqual({ ok: true, changes: null });
    expect(parseCell('description', '  EPM ', CURRENT, CONTEXT)).toEqual({ ok: true, changes: null });
    expect(parseCell('amount', '179.00', CURRENT, CONTEXT)).toEqual({ ok: true, changes: null });
  });

  it('changes the date, and refuses one that does not exist', () => {
    expect(parseCell('date', '2026-09-26', CURRENT, CONTEXT)).toEqual({
      ok: true,
      changes: { occurred_on: '2026-09-26' },
    });
    expect(parseCell('date', '2026-02-31', CURRENT, CONTEXT)).toMatchObject({ ok: false });
    expect(parseCell('date', '', CURRENT, CONTEXT)).toMatchObject({ ok: false, message: 'Enter a date.' });
  });

  it('changes the description, and falls back to the category when emptied', () => {
    expect(parseCell('description', 'EPM water', CURRENT, CONTEXT)).toEqual({
      ok: true,
      changes: { description: 'EPM water' },
    });
    expect(parseCell('description', '   ', CURRENT, CONTEXT)).toEqual({
      ok: true,
      changes: { description: 'Housing & Utilities' },
    });
  });

  it('reads the amount as money, in integer minor units', () => {
    expect(parseCell('amount', '$1,790.50', CURRENT, CONTEXT)).toEqual({ ok: true, changes: { amount_minor: 179050 } });
  });

  it('refuses an amount it would have to round, a negative one, or zero', () => {
    expect(parseCell('amount', '10.005', CURRENT, CONTEXT)).toMatchObject({ ok: false });
    expect(parseCell('amount', '-5', CURRENT, CONTEXT)).toMatchObject({ ok: false });
    expect(parseCell('amount', '0', CURRENT, CONTEXT)).toEqual({ ok: false, message: 'Enter an amount above zero.' });
  });

  it('takes whole pesos in COP', () => {
    const cop = { ...CONTEXT, currency: 'COP' as const };
    expect(parseCell('amount', '1,200,000', { ...CURRENT, amount_minor: 1 }, cop)).toEqual({
      ok: true,
      changes: { amount_minor: 1200000 },
    });
    expect(parseCell('amount', '1200.50', CURRENT, cop)).toMatchObject({ ok: false });
  });
});
