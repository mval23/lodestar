import { overviewFindings, type MonthSoFar, type PaceLine } from './standsOut';

function line(name: string, planned: number, spent: number, pace: number, daysLeft = 6): PaceLine {
  return {
    category_name: name,
    planned_minor: planned,
    spent_minor: spent,
    pace_minor: pace,
    gap_minor: spent - pace,
    days_left: daysLeft,
    status: spent > planned ? 'over' : spent > pace ? 'ahead' : 'on_pace',
  };
}

const typicalMonth: MonthSoFar = { day_of_month: 24, money_out_minor: 318507, typical_out_minor: 363990, typical_months: 6 };

describe('overviewFindings', () => {
  it('says nothing when every line is on pace and the month is normal', () => {
    const quiet = { ...typicalMonth, money_out_minor: 360000 };
    expect(overviewFindings([line('Rent', 165000, 165000, 165000)], quiet, 'Sep')).toEqual([]);
  });

  it('leads with the line furthest over plan, and counts the others', () => {
    const findings = overviewFindings(
      [line('Subscriptions', 8000, 8247, 6400), line('Dining out', 30000, 34000, 24000)],
      null,
      'Sep',
    );
    expect(findings[0]).toEqual({
      key: 'over',
      weight: 3,
      parts: ['Dining out is over plan by ', { minor: 4000 }, ', and 1 more category is over plan.'],
    });
  });

  it('names a line well ahead of pace, with what is left and for how long', () => {
    const findings = overviewFindings([line('Dining out', 30000, 29977, 24000)], null, 'Sep');
    expect(findings).toEqual([
      {
        key: 'ahead',
        weight: 2,
        parts: ['Dining out is ', { minor: 5977 }, ' ahead of pace, with ', { minor: 23 }, ' left for 6 days.'],
      },
    ]);
  });

  it('leaves out a line only a little ahead of pace', () => {
    // 2.49 ahead on a 160.00 plan is under 15% of the plan.
    expect(overviewFindings([line('Utilities', 16000, 15249, 15000)], null, 'Sep')).toEqual([]);
  });

  it('says when money out is well away from a typical month to date', () => {
    expect(overviewFindings([], typicalMonth, 'Sep')).toEqual([
      { key: 'out', weight: 1, parts: ['Money out is ', { minor: 45483 }, ' below a typical Sep 1–24.'] },
    ]);
  });

  it('makes no comparison without earlier months', () => {
    expect(overviewFindings([], { ...typicalMonth, typical_months: 0, typical_out_minor: 0 }, 'Sep')).toEqual([]);
  });

  it('orders findings over plan, then ahead of pace, then the month', () => {
    const keys = overviewFindings(
      [line('Dining out', 30000, 29977, 24000), line('Subscriptions', 8000, 8247, 6400)],
      typicalMonth,
      'Sep',
    ).map((f) => f.key);
    expect(keys).toEqual(['over', 'ahead', 'out']);
  });
});
