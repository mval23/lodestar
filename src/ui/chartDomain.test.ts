import { lineDomain } from './chartDomain';

describe('lineDomain', () => {
  it('frames a balance that stays well above zero, instead of pinning it to zero', () => {
    const { low, high, showZero } = lineDomain([6_200_000, 6_350_000, 6_491_000]);
    expect(low).toBeGreaterThan(6_000_000);
    expect(high).toBeGreaterThan(6_491_000);
    expect(showZero).toBe(false);
  });

  it('keeps zero, and its rule, when the line crosses it', () => {
    expect(lineDomain([-50_000, 20_000, 80_000])).toMatchObject({ showZero: true });
    const { low, high } = lineDomain([-50_000, 20_000, 80_000]);
    expect(low).toBeLessThan(-50_000);
    expect(high).toBeGreaterThan(80_000);
  });

  it('never invents a negative stretch for a series that starts at zero', () => {
    expect(lineDomain([0, 30_000, 60_000]).low).toBe(0);
  });

  it('never invents a positive stretch for a loan', () => {
    const { high, showZero } = lineDomain([-1_180_000, -1_000_000, -940_000]);
    expect(high).toBeLessThanOrEqual(0);
    expect(showZero).toBe(false);
  });

  it('marks zero when a loan is paid off, since the line lands on it', () => {
    expect(lineDomain([-100_000, -50_000, 0]).showZero).toBe(true);
  });

  it('gives a flat line room above and below', () => {
    const { low, high } = lineDomain([500_000, 500_000]);
    expect(low).toBeLessThan(500_000);
    expect(high).toBeGreaterThan(500_000);
  });

  it('gives an all-zero line a range to draw in', () => {
    const { low, high } = lineDomain([0, 0, 0]);
    expect(low).toBe(0);
    expect(high).toBeGreaterThan(0);
  });

  it('includes a target that sits beyond the data', () => {
    const { high } = lineDomain([620_000, 650_000, 1_800_000]);
    expect(high).toBeGreaterThan(1_800_000);
  });
});
