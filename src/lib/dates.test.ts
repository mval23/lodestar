import { addMonths, formatDate, formatDateShort, formatMonth, monthStartInZone, monthStartOf, todayInZone } from './dates';

describe('todayInZone', () => {
  it('reads today in the given zone, not the browser default', () => {
    // At any instant these two zones can be on different days; both must be
    // valid dates, and the far-east zone is never behind the far-west one.
    const east = todayInZone('Pacific/Kiritimati'); // UTC+14
    const west = todayInZone('Pacific/Pago_Pago'); // UTC−11
    expect(east).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(west).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(east >= west).toBe(true);
  });

  it('falls back to a usable date for an unknown zone', () => {
    expect(todayInZone('Mars/Olympus')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('monthStartInZone', () => {
  it('is the first of the current month', () => {
    expect(monthStartInZone('America/Bogota')).toMatch(/^\d{4}-\d{2}-01$/);
  });
});

describe('formatDate', () => {
  it('formats a stored date without shifting it', () => {
    expect(formatDate('2026-09-19')).toBe('Sep 19, 2026');
    expect(formatDate('2026-01-01')).toBe('Jan 1, 2026');
    expect(formatDateShort('2026-09-19')).toBe('Sep 19');
  });

  it('returns the input unchanged when it cannot be read', () => {
    expect(formatDate('not-a-date')).toBe('not-a-date');
  });
});

describe('addMonths', () => {
  it('moves whole months and rolls the year', () => {
    expect(addMonths('2026-09-01', 1)).toBe('2026-10-01');
    expect(addMonths('2026-12-01', 1)).toBe('2027-01-01');
    expect(addMonths('2026-01-01', -1)).toBe('2025-12-01');
    expect(addMonths('2026-09-01', 0)).toBe('2026-09-01');
  });

  it('never lands on a day other than the first, which budgets require', () => {
    for (let delta = -24; delta <= 24; delta += 1) {
      expect(addMonths('2026-03-01', delta)).toMatch(/-01$/);
    }
  });
});

describe('formatMonth and monthStartOf', () => {
  it('names a month and finds the month a date belongs to', () => {
    expect(formatMonth('2026-09-01')).toBe('September 2026');
    expect(monthStartOf('2026-09-19')).toBe('2026-09-01');
  });
});
