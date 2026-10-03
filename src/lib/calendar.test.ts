import { addDays, addMonthsClamped, clampDay, endOfWeek, isIsoDate, monthGrid, startOfWeek } from './calendar';

describe('calendar', () => {
  it('reads only real ISO dates', () => {
    expect(isIsoDate('2026-10-17')).toBe(true);
    expect(isIsoDate('2026-02-30')).toBe(false);
    expect(isIsoDate('10/17/2026')).toBe(false);
  });

  it('adds days across months and years', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
  });

  it('adds months, clamping to a shorter month', () => {
    expect(addMonthsClamped('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonthsClamped('2028-01-31', 1)).toBe('2028-02-29');
    expect(addMonthsClamped('2026-03-15', -12)).toBe('2025-03-15');
  });

  it('draws six Sunday-first weeks around the month', () => {
    const grid = monthGrid('2026-10-17');
    expect(grid).toHaveLength(6);
    // October 1, 2026 is a Thursday.
    expect(grid[0]).toEqual(['2026-09-27', '2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03']);
    expect(grid[5]![6]).toBe('2026-11-07');
  });

  it('finds the week a day sits in', () => {
    expect(startOfWeek('2026-10-17')).toBe('2026-10-11');
    expect(endOfWeek('2026-10-17')).toBe('2026-10-17');
  });

  it('keeps a day inside its bounds', () => {
    expect(clampDay('2026-10-17', undefined, '2026-10-02')).toBe('2026-10-02');
    expect(clampDay('2026-10-17', '2026-11-01')).toBe('2026-11-01');
  });
});
