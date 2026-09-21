import { activityPath, budgetLinePath, isUuid, lastTwelveMonths, monthFromParam, monthParam, monthRange } from './routes';

describe('isUuid', () => {
  it('accepts a uuid and refuses anything else', () => {
    expect(isUuid('0a8f7b2e-1c3d-4e5f-8a9b-0c1d2e3f4a5b')).toBe(true);
    expect(isUuid('not-an-id')).toBe(false);
    expect(isUuid('')).toBe(false);
    expect(isUuid(undefined)).toBe(false);
    // A malformed id must be refused before any query runs, so that it looks
    // exactly like another person's id: both end in "Not found".
    expect(isUuid("' or 1=1 --")).toBe(false);
  });
});

describe('months in addresses', () => {
  it('reads YYYY-MM and hands back the first of the month', () => {
    expect(monthFromParam('2026-09')).toBe('2026-09-01');
    expect(monthFromParam('2026-01')).toBe('2026-01-01');
  });

  it('refuses a month that is not one', () => {
    for (const bad of ['2026-13', '2026-00', '2026-9', '202609', 'september', '2026-09-01', undefined]) {
      expect(monthFromParam(bad)).toBeNull();
    }
  });

  it('round-trips', () => {
    expect(monthParam('2026-09-01')).toBe('2026-09');
    expect(monthFromParam(monthParam('2026-12-01'))).toBe('2026-12-01');
  });

  it('gives the range of a month, including a leap February', () => {
    expect(monthRange('2026-09-01')).toEqual({ from: '2026-09-01', to: '2026-09-30', next: '2026-10-01' });
    expect(monthRange('2026-02-01').to).toBe('2026-02-28');
    expect(monthRange('2028-02-01').to).toBe('2028-02-29');
    expect(monthRange('2026-12-01')).toEqual({ from: '2026-12-01', to: '2026-12-31', next: '2027-01-01' });
  });

  it('lists the twelve months ending with the one given', () => {
    const months = lastTwelveMonths('2026-09-01');
    expect(months).toHaveLength(12);
    expect(months[0]).toBe('2025-10-01');
    expect(months[11]).toBe('2026-09-01');
  });
});

describe('activityPath', () => {
  it('carries only the filters it is given', () => {
    expect(activityPath({})).toBe('/activity');
    expect(activityPath({ accountId: 'a1', kind: 'expense' })).toBe('/activity?kind=expense&accountId=a1');
    expect(activityPath({ categoryId: 'c1', from: '2026-09-01', to: '2026-09-30' })).toBe(
      '/activity?categoryId=c1&from=2026-09-01&to=2026-09-30',
    );
  });
});

describe('budgetLinePath', () => {
  it('addresses a category in a month, not a budget row', () => {
    expect(budgetLinePath('2026-09-01', 'c1')).toBe('/budgets/2026-09/c1');
  });
});
