// "What stands out": one or two sentences a dashboard leads with, only when
// something is unusual. The rules are plain functions over figures the
// database has already summed; they choose words, never add money up.
//
// A finding is a sentence in parts: text, and amounts the page formats (and
// a screen reader reads in full). Weight orders findings: over plan before
// ahead of pace before a month that differs from normal.

export type FindingPart = string | { minor: number; signed?: boolean };
export type Finding = { key: string; weight: number; parts: FindingPart[] };

export type PaceLine = {
  category_name: string;
  planned_minor: number;
  spent_minor: number;
  pace_minor: number;
  gap_minor: number;
  days_left: number;
  status: 'over' | 'ahead' | 'on_pace';
};

export type MonthSoFar = {
  day_of_month: number;
  money_out_minor: number;
  typical_out_minor: number;
  typical_months: number;
};

// Ahead of pace by more than this share of the plan is worth saying.
export const AHEAD_SHARE = 0.15;
// Money out this far from a typical month to date is worth saying.
export const OUT_SHARE = 0.1;

const days = (n: number) => (n === 1 ? '1 day' : `${n} days`);

export function overviewFindings(lines: PaceLine[], soFar: MonthSoFar | null, monthShort: string): Finding[] {
  const findings: Finding[] = [];

  const over = lines.filter((l) => l.status === 'over').sort((a, b) => (b.spent_minor - b.planned_minor) - (a.spent_minor - a.planned_minor));
  const worst = over[0];
  if (worst) {
    const others = over.length - 1;
    findings.push({
      key: 'over',
      weight: 3,
      parts: [
        `${worst.category_name} is over plan by `,
        { minor: worst.spent_minor - worst.planned_minor },
        others > 0 ? `, and ${others} more ${others === 1 ? 'category is' : 'categories are'} over plan.` : '.',
      ],
    });
  }

  const ahead = lines
    .filter((l) => l.status === 'ahead' && l.planned_minor > 0 && l.gap_minor > l.planned_minor * AHEAD_SHARE)
    .sort((a, b) => b.gap_minor - a.gap_minor)[0];
  if (ahead) {
    const left = Math.max(0, ahead.planned_minor - ahead.spent_minor);
    findings.push({
      key: 'ahead',
      weight: 2,
      parts:
        ahead.days_left > 0
          ? [`${ahead.category_name} is `, { minor: ahead.gap_minor }, ' ahead of pace, with ', { minor: left }, ` left for ${days(ahead.days_left)}.`]
          : [`${ahead.category_name} is `, { minor: ahead.gap_minor }, ' ahead of pace.'],
    });
  }

  if (soFar && soFar.typical_months > 0 && soFar.typical_out_minor > 0) {
    const diff = soFar.money_out_minor - soFar.typical_out_minor;
    if (Math.abs(diff) > soFar.typical_out_minor * OUT_SHARE) {
      findings.push({
        key: 'out',
        weight: 1,
        parts: [
          'Money out is ',
          { minor: Math.abs(diff) },
          ` ${diff < 0 ? 'below' : 'above'} a typical ${monthShort} 1–${soFar.day_of_month}.`,
        ],
      });
    }
  }

  return findings.sort((a, b) => b.weight - a.weight);
}
