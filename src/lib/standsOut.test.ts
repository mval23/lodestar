import {
  cashFlowFindings,
  categoryFindings,
  monthFindings,
  netWorthFindings,
  overviewFindings,
  type MonthSoFar,
  type PaceLine,
} from './standsOut';

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

describe('cashFlowFindings', () => {
  const month = (m: string) => ({ '2025-11-01': 'November 2025', '2026-01-01': 'January 2026' })[m] ?? m;
  const now = { money_in_minor: 6607000, money_out_minor: 4593845, net_minor: 2013155, active_months: 12 };
  const before = { money_in_minor: 6330000, money_out_minor: 4315464, net_minor: 2014536, active_months: 12 };
  const months = [
    { month: '2025-10-01', net_minor: 180000, active: true },
    { month: '2025-11-01', net_minor: 105877, active: true },
    { month: '2025-12-01', net_minor: 0, active: false },
  ];
  const text = (findings: ReturnType<typeof cashFlowFindings>) =>
    findings.map((f) => f.parts.map((p) => (typeof p === 'string' ? p : `[${p.signed ? 's' : ''}${p.minor}]`)).join('')).join(' ');

  it('says a net within 2% of the earlier one held steady, and why', () => {
    expect(text(cashFlowFindings(now, before, months, 'Oct 2024 – Sep 2025', month))).toBe(
      'Net cash flow held steady at [s2013155], [1381] below Oct 2024 – Sep 2025: money in rose [277000] and money out rose [278381].' +
        ' Every month ended positive; November 2025 was the lowest at [s105877].',
    );
  });

  it('says a net rose or fell when it moved further', () => {
    const lower = { ...before, net_minor: 1500000 };
    expect(text(cashFlowFindings(now, lower, [], 'the year before', month))).toMatch(/^Net cash flow rose to \[s2013155\], \[513155\] above the year before/);
  });

  it('counts the months that ended negative, ignoring empty ones', () => {
    const mixed = [...months, { month: '2026-01-01', net_minor: -42000, active: true }];
    expect(text(cashFlowFindings(now, null, mixed, '', month))).toBe(
      'Net cash flow was [s2013155] over the period. 1 of 3 months ended negative; January 2026 was the lowest at [s-42000].',
    );
  });
});

describe('netWorthFindings', () => {
  const text = (findings: ReturnType<typeof netWorthFindings>) =>
    findings.map((f) => f.parts.map((p) => (typeof p === 'string' ? p : `[${p.signed ? 's' : ''}${p.minor}]`)).join('')).join(' ');
  const change = { change_minor: 2013155, cash_flow_minor: 2013155, openings_minor: 0, moved_minor: 0 };

  it('compares with the period before and names where the change came from', () => {
    const before = { change_minor: 2014536, cash_flow_minor: 2014536, openings_minor: 0, moved_minor: 0 };
    expect(
      text(netWorthFindings(change, before, 12, { start_minor: 4000000, end_minor: 5557411 }, { start_minor: -1600000, end_minor: -1144256 }, 'Car loan')),
    ).toBe(
      'Net worth rose [2013155] in 12 months, almost the same as the period before ([s2014536]). All of it came from net cash flow.' +
        ' What you own grew by [1557411] and what you owe fell by [455744], mostly the Car loan.',
    );
  });

  it('gives the cash flow share when openings or moves played a part', () => {
    const mixed = { change_minor: 300000, cash_flow_minor: 250000, openings_minor: 60000, moved_minor: -10000 };
    expect(text(netWorthFindings(mixed, null, 6, null, null, null))).toBe('Net worth rose [300000] in 6 months. Net cash flow gave [s250000] of it.');
  });

  it('says what is owed rose without naming an account', () => {
    expect(
      text(netWorthFindings({ ...change, change_minor: -5000, cash_flow_minor: -5000 }, null, 1, { start_minor: 100, end_minor: 100 }, { start_minor: -100, end_minor: -5100 }, null)),
    ).toBe('Net worth fell [5000] in 1 month. All of it came from net cash flow. What you owe rose by [5000].');
  });
});

describe('monthFindings', () => {
  const text = (findings: ReturnType<typeof monthFindings>) =>
    findings.map((f) => f.parts.map((p) => (typeof p === 'string' ? p : `[${p.minor}]`)).join('')).join(' ');
  const soFar = { day_of_month: 24, money_out_minor: 318507, typical_out_minor: 363990, typical_months: 6, money_in_minor: 305000 };
  const cats = [
    { name: 'Rent', spent_minor: 165000, typical_minor: 165000 },
    { name: 'Travel', spent_minor: 0, typical_minor: 30000 },
    { name: 'Groceries', spent_minor: 38043, typical_minor: 44010 },
  ];

  it('says spending is below typical, and names the category that is most of it', () => {
    expect(text(monthFindings(soFar, cats, 'a typical Sep 1–24', true))).toBe(
      'Spending is [45483] below a typical Sep 1–24, mostly because nothing went on Travel.' +
        ' Money out is [13507] more than money in so far.',
    );
  });

  it('says nothing about spending within 10% of typical, and names no category that is a small part', () => {
    expect(text(monthFindings({ ...soFar, money_out_minor: 350000, money_in_minor: 400000 }, cats, 'x', true))).toBe('');
    const spread = [
      { name: 'A', spent_minor: 0, typical_minor: 10000 },
      { name: 'B', spent_minor: 0, typical_minor: 10000 },
    ];
    expect(text(monthFindings({ ...soFar, money_in_minor: 400000 }, spread, 'a typical September', false))).toBe(
      'Spending is [45483] below a typical September.',
    );
  });
});

describe('categoryFindings', () => {
  const text = (findings: ReturnType<typeof categoryFindings>) =>
    findings.map((f) => f.parts.map((p) => (typeof p === 'string' ? p : `[${p.minor}]`)).join('')).join(' ');
  const figures = { typical_minor: 35152, months: 11, last3_minor: 97957, prev3_minor: 119461, planned_months: 11, over_plan_months: 9 };

  it('compares the average with the plan, counts the months over it, and gives the trend', () => {
    expect(text(categoryFindings('Dining out', 'expense', figures, 30000))).toBe(
      'Dining out averaged [35152] a month against a [30000] plan, and was over plan in 9 of the 11 months with one.' +
        ' Its spending is down 18% over the last 3 months: [97957] against [119461] in the 3 before.',
    );
  });

  it('stays quiet about a steady trend, a short history, or plans it was mostly under', () => {
    expect(text(categoryFindings('Rent', 'expense', { ...figures, months: 2, prev3_minor: 97957 }, null))).toBe('');
    expect(text(categoryFindings('Salary', 'income', { ...figures, over_plan_months: 1, prev3_minor: 97957 }, null))).toBe(
      'Salary averaged [35152] a month.',
    );
  });
});
