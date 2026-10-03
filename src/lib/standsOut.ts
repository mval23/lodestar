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

// ---------------------------------------------------------------------------
// Reports. A report always has something to say about its period, so these
// return a finding even when nothing is unusual: how the period went, against
// the comparison period when that has anything in it. Every amount is a total
// Postgres returned, or the difference of two; nothing is summed here.

export type PeriodFlow = { money_in_minor: number; money_out_minor: number; net_minor: number; active_months: number };
export type MonthNet = { month: string; net_minor: number; active: boolean };

// A change within this share of the earlier figure reads as "held steady".
export const STEADY_SHARE = 0.02;

const steady = (change: number, before: number) => Math.abs(change) <= Math.abs(before) * STEADY_SHARE;
const moved = (change: number, up: string, down: string) => (change > 0 ? up : down);

function flowClause(name: string, change: number): FindingPart[] {
  return change === 0 ? [`${name} was unchanged`] : [`${name} ${moved(change, 'rose', 'fell')} `, { minor: Math.abs(change) }];
}

// beforeLabel names the comparison period, as "Oct 2024 – Sep 2025";
// monthName formats a month, as "November 2025".
export function cashFlowFindings(
  now: PeriodFlow,
  before: PeriodFlow | null,
  months: MonthNet[],
  beforeLabel: string,
  monthName: (month: string) => string,
): Finding[] {
  const findings: Finding[] = [];

  if (before && before.active_months > 0) {
    const change = now.net_minor - before.net_minor;
    const lead: FindingPart[] = steady(change, before.net_minor)
      ? ['Net cash flow held steady at ', { minor: now.net_minor, signed: true }]
      : [`Net cash flow ${moved(change, 'rose', 'fell')} to `, { minor: now.net_minor, signed: true }];
    findings.push({
      key: 'net',
      weight: 2,
      parts: [
        ...lead,
        ...(change === 0 ? [`, the same as ${beforeLabel}: `] : [', ', { minor: Math.abs(change) }, ` ${moved(change, 'above', 'below')} ${beforeLabel}: `]),
        ...flowClause('money in', now.money_in_minor - before.money_in_minor),
        ' and ',
        ...flowClause('money out', now.money_out_minor - before.money_out_minor),
        '.',
      ],
    });
  } else {
    findings.push({ key: 'net', weight: 2, parts: ['Net cash flow was ', { minor: now.net_minor, signed: true }, ' over the period.'] });
  }

  const active = months.filter((m) => m.active);
  if (active.length >= 2) {
    const lowest = active.reduce((low, m) => (m.net_minor < low.net_minor ? m : low));
    const negative = active.filter((m) => m.net_minor < 0).length;
    const opening =
      negative === 0
        ? 'Every month ended positive; '
        : negative === active.length
          ? 'Every month ended negative; '
          : `${negative} of ${active.length} months ended negative; `;
    findings.push({
      key: 'months',
      weight: 1,
      parts: [opening, `${monthName(lowest.month)} was the lowest at `, { minor: lowest.net_minor, signed: true }, '.'],
    });
  }

  return findings;
}

export type WorthChange = { change_minor: number; cash_flow_minor: number; openings_minor: number; moved_minor: number };
export type Balances = { start_minor: number; end_minor: number };

// owned and owed are where the period began and ended; owed is negative.
// mostlyFrom names the account behind most of a fall in what is owed.
export function netWorthFindings(
  now: WorthChange,
  before: WorthChange | null,
  months: number,
  owned: Balances | null,
  owed: Balances | null,
  mostlyFrom: string | null,
): Finding[] {
  const findings: Finding[] = [];
  const change = now.change_minor;
  const span = months === 1 ? '1 month' : `${months} months`;

  const lead: FindingPart[] =
    change === 0
      ? [`Net worth was unchanged over ${span}`]
      : [`Net worth ${moved(change, 'rose', 'fell')} `, { minor: Math.abs(change) }, ` in ${span}`];
  const against: FindingPart[] = !before
    ? ['.']
    : steady(change - before.change_minor, before.change_minor)
      ? [', almost the same as the period before (', { minor: before.change_minor, signed: true }, ').']
      : [', against ', { minor: before.change_minor, signed: true }, ' the period before.'];
  const source: FindingPart[] =
    change === 0
      ? []
      : now.openings_minor === 0 && now.moved_minor === 0
        ? [' All of it came from net cash flow.']
        : [' Net cash flow gave ', { minor: now.cash_flow_minor, signed: true }, ' of it.'];
  findings.push({ key: 'change', weight: 2, parts: [...lead, ...against, ...source] });

  if (owned && owed) {
    const own = owned.end_minor - owned.start_minor;
    // Owed is negative, so a rise in the balance is less owed.
    const less = owed.end_minor - owed.start_minor;
    const parts: FindingPart[] = [];
    if (own !== 0) parts.push(`What you own ${moved(own, 'grew', 'fell')} by `, { minor: Math.abs(own) });
    if (less !== 0) {
      parts.push(own !== 0 ? ' and what you owe ' : 'What you owe ', `${moved(less, 'fell', 'rose')} by `, { minor: Math.abs(less) });
      if (less > 0 && mostlyFrom) parts.push(`, mostly the ${mostlyFrom}`);
    }
    if (parts.length > 0) findings.push({ key: 'parts', weight: 1, parts: [...parts, '.'] });
  }

  return findings;
}

// ---------------------------------------------------------------------------
// The Month page: whether spending is running above or below a typical month
// cut at the same day, and which category explains most of it.

export type MonthCategoryLine = { name: string; spent_minor: number; typical_minor: number };

// A category explains the difference "mostly" when it carries at least this
// share of it, in the same direction.
export const MOSTLY_SHARE = 0.4;

export function monthFindings(
  soFar: MonthSoFar & { money_in_minor: number },
  categories: MonthCategoryLine[],
  // "a typical Sep 1–24", or "a typical September" for a whole month.
  against: string,
  inProgress: boolean,
): Finding[] {
  const findings: Finding[] = [];

  if (soFar.typical_months > 0 && soFar.typical_out_minor > 0) {
    const diff = soFar.money_out_minor - soFar.typical_out_minor;
    if (Math.abs(diff) > soFar.typical_out_minor * OUT_SHARE) {
      const lead = categories
        .map((c) => ({ ...c, gap: c.spent_minor - c.typical_minor }))
        .filter((c) => Math.sign(c.gap) === Math.sign(diff))
        .sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap))[0];
      const mostly = lead && Math.abs(lead.gap) >= Math.abs(diff) * MOSTLY_SHARE;
      findings.push({
        key: 'out',
        weight: 2,
        parts: [
          'Spending is ',
          { minor: Math.abs(diff) },
          ` ${diff < 0 ? 'below' : 'above'} ${against}`,
          ...(mostly
            ? diff < 0 && lead.spent_minor === 0
              ? [`, mostly because nothing went on ${lead.name}.`]
              : [`, mostly ${lead.name} (`, { minor: Math.abs(lead.gap) }, ` ${diff < 0 ? 'less' : 'more'}).`]
            : ['.']),
        ],
      });
    }
  }

  const net = soFar.money_in_minor - soFar.money_out_minor;
  if (net < 0 && soFar.money_out_minor > 0) {
    findings.push({
      key: 'net',
      weight: 1,
      parts: [`Money out ${inProgress ? 'is' : 'was'} `, { minor: -net }, ` more than money in${inProgress ? ' so far' : ''}.`],
    });
  }

  return findings.sort((a, b) => b.weight - a.weight);
}

// ---------------------------------------------------------------------------
// The Category page: how the category usually runs against its plan, and
// whether it is rising or falling.

export type CategoryFigures = {
  typical_minor: number | null;
  months: number;
  last3_minor: number;
  prev3_minor: number;
  planned_months: number;
  over_plan_months: number;
};

// A change in the last 3 months beyond this share of the 3 before is a trend.
export const TREND_SHARE = 0.15;

const percent = (share: number) =>
  new Intl.NumberFormat('en-US', { style: 'percent', maximumFractionDigits: 0 }).format(share);

export function categoryFindings(name: string, kind: 'expense' | 'income', figures: CategoryFigures, plan: number | null): Finding[] {
  const findings: Finding[] = [];
  const verb = kind === 'expense' ? 'spending' : 'income';

  if (figures.typical_minor !== null && figures.months >= 3) {
    const overPlan =
      kind === 'expense' && figures.planned_months > 0 && figures.over_plan_months * 2 >= figures.planned_months
        ? `, and was over plan in ${figures.over_plan_months} of the ${figures.planned_months} months with one`
        : '';
    findings.push({
      key: 'typical',
      weight: overPlan ? 2 : 1,
      parts:
        plan !== null && kind === 'expense'
          ? [`${name} averaged `, { minor: figures.typical_minor }, ' a month against a ', { minor: plan }, ` plan${overPlan}.`]
          : [`${name} averaged `, { minor: figures.typical_minor }, ` a month${overPlan}.`],
    });
  }

  if (figures.prev3_minor > 0) {
    const change = (figures.last3_minor - figures.prev3_minor) / figures.prev3_minor;
    if (Math.abs(change) > TREND_SHARE) {
      findings.push({
        key: 'trend',
        weight: 2,
        parts: [
          `Its ${verb} is ${change < 0 ? 'down' : 'up'} ${percent(Math.abs(change))} over the last 3 months: `,
          { minor: figures.last3_minor },
          ' against ',
          { minor: figures.prev3_minor },
          ' in the 3 before.',
        ],
      });
    }
  }

  return findings;
}

// ---------------------------------------------------------------------------
// Spending by category: how much one category carries, which flexible one
// grew most, and what still needs a category. Amounts are Postgres totals.

export type CategoryShare = { name: string; total_minor: number; compare_minor: number; fixed: boolean };

// One category is worth naming when it carries at least this share.
export const LARGE_SHARE = 0.25;
// A flexible category's growth is worth saying beyond this share.
export const GROWTH_SHARE = 0.1;

export function spendingFindings(
  total: number,
  categories: CategoryShare[],
  uncategorized: { minor: number; count: number },
): Finding[] {
  const findings: Finding[] = [];
  const largest = categories[0];
  if (largest && total > 0 && largest.total_minor >= total * LARGE_SHARE) {
    findings.push({
      key: 'largest',
      weight: 2,
      parts: [`${largest.name} alone is ${percent(largest.total_minor / total)} of spending.`],
    });
  }
  // The flexible category that grew by the most money, as the page's band
  // names it; worth a sentence only when that is more than a tenth.
  const grew = categories
    .filter((c) => !c.fixed && c.compare_minor > 0)
    .sort((a, b) => b.total_minor - b.compare_minor - (a.total_minor - a.compare_minor))[0];
  if (grew && grew.total_minor - grew.compare_minor > grew.compare_minor * GROWTH_SHARE) {
    findings.push({
      key: 'grew',
      weight: 2,
      parts: [
        `Among the flexible categories, ${grew.name} grew most: `,
        { minor: grew.total_minor - grew.compare_minor, signed: true },
        ` (${percent((grew.total_minor - grew.compare_minor) / grew.compare_minor)} more than before).`,
      ],
    });
  }
  if (uncategorized.count > 0) {
    findings.push({
      key: 'uncategorized',
      weight: 1,
      parts: [
        `${uncategorized.count} ${uncategorized.count === 1 ? 'expense' : 'expenses'} (`,
        { minor: uncategorized.minor },
        `) still ${uncategorized.count === 1 ? 'needs' : 'need'} a category.`,
      ],
    });
  }
  return findings;
}

// ---------------------------------------------------------------------------
// Budget vs actual: how the month ended against its plans, and the category
// whose plan most often does not hold.

export type PlanHistory = { name: string; over: number; planned: number; average_minor: number | null; plan_minor: number | null };

export function budgetFindings(
  month: string,
  inProgress: boolean,
  left: number,
  within: number,
  lines: number,
  worst: PlanHistory | null,
): Finding[] {
  const findings: Finding[] = [];
  if (lines > 0) {
    const verb = inProgress ? 'is' : 'ended';
    findings.push({
      key: 'month',
      weight: 2,
      parts:
        left >= 0
          ? [`${month} ${verb} `, { minor: left }, ` under plan, with ${within} of ${lines} categories within it.`]
          : [`${month} ${verb} `, { minor: -left }, ` over plan, with ${within} of ${lines} categories within it.`],
    });
  }
  if (worst && worst.planned >= 3 && worst.over * 2 > worst.planned) {
    findings.push({
      key: 'worst',
      weight: 1,
      parts:
        worst.average_minor !== null && worst.plan_minor !== null && worst.average_minor > worst.plan_minor
          ? [
              `${worst.name} was over plan in ${worst.over} of ${worst.planned} months and averaged `,
              { minor: worst.average_minor },
              ' against a ',
              { minor: worst.plan_minor },
              ' plan, so the plan may be set below what it usually costs.',
            ]
          : [`${worst.name} was over plan in ${worst.over} of ${worst.planned} months.`],
    });
  }
  return findings;
}

// ---------------------------------------------------------------------------
// Savings rate and goals: what went in and came back out, and the rate.

export function savingsFindings(
  putIn: number,
  takenOut: number,
  moneyIn: number,
  monthsOnPlan: { on: number; of: number } | null,
): Finding[] {
  const findings: Finding[] = [];
  if (putIn > 0 || takenOut > 0) {
    const rate = moneyIn > 0 ? ` That nets to a ${percent((putIn - takenOut) / moneyIn)} savings rate.` : '';
    findings.push({
      key: 'flow',
      weight: 2,
      parts:
        takenOut > 0
          ? ['You put ', { minor: putIn }, ' into goals and took ', { minor: takenOut }, ` back out.${rate}`]
          : ['You put ', { minor: putIn }, ` into goals and took nothing back out.${rate}`],
    });
  }
  if (monthsOnPlan && monthsOnPlan.of > 0) {
    findings.push({
      key: 'plan',
      weight: 1,
      parts: [
        monthsOnPlan.on === monthsOnPlan.of
          ? `Every month met the monthly plans for your goals.`
          : `${monthsOnPlan.on} of ${monthsOnPlan.of} months met the monthly plans for your goals.`,
      ],
    });
  }
  return findings;
}

// ---------------------------------------------------------------------------
// A budget line: where it stands against its pace this month, and whether the
// plan is realistic given how past months went.

export function budgetLineFindings(
  name: string,
  line: (PaceLine & { per_day_minor: number | null }) | null,
  history: { within: number; planned: number; typical_minor: number | null },
): Finding[] {
  const findings: Finding[] = [];
  if (line) {
    const left = line.planned_minor - line.spent_minor;
    if (line.status === 'over') {
      findings.push({ key: 'now', weight: 2, parts: [`${name} is over plan by `, { minor: -left }, '.'] });
    } else if (line.days_left > 0) {
      const gap = line.gap_minor;
      findings.push({
        key: 'now',
        weight: 2,
        parts: [
          `${name} is `,
          { minor: Math.abs(gap) },
          ` ${gap > 0 ? 'ahead of' : 'under'} pace, with `,
          { minor: left },
          ` left for ${days(line.days_left)}.`,
        ],
      });
    }
  }
  if (history.planned >= 3) {
    const over = history.planned - history.within;
    if (history.within * 2 >= history.planned) {
      findings.push({ key: 'realistic', weight: 1, parts: ['Most months land within the plan.'] });
    } else {
      findings.push({
        key: 'realistic',
        weight: 1,
        parts:
          history.typical_minor !== null
            ? [`It went over plan in ${over} of ${history.planned} months; a typical month is `, { minor: history.typical_minor }, '.']
            : [`It went over plan in ${over} of ${history.planned} months.`],
      });
    }
  }
  return findings;
}

// ---------------------------------------------------------------------------
// A goal: when its recent pace reaches the target, against the date, and what
// it needs a month to arrive on time.

export function goalFindings(
  name: string,
  pace: { avg_put_in_minor: number; estimated_month: string | null; needed_monthly_minor: number | null },
  targetMonth: string | null,
  // "Apr 2027", "Jun 30, 2027": formatted by the page.
  words: { estimate: string | null; target: string | null },
): Finding[] {
  const findings: Finding[] = [];
  if (pace.estimated_month && words.estimate) {
    let timing = '';
    if (targetMonth) {
      const [ey, em] = pace.estimated_month.split('-').map(Number);
      const [ty, tm] = targetMonth.split('-').map(Number);
      const diff = ((ty ?? 0) - (ey ?? 0)) * 12 + ((tm ?? 0) - (em ?? 0));
      timing =
        diff > 0
          ? `, ${diff === 1 ? 'a month' : `${diff} months`} early`
          : diff < 0
            ? `, ${-diff === 1 ? 'a month' : `${-diff} months`} late`
            : ', right on time';
    }
    findings.push({
      key: 'estimate',
      weight: 2,
      parts: ['At ', { minor: pace.avg_put_in_minor }, ` a month, ${name} is reached around ${words.estimate}${timing}.`],
    });
  }
  if (pace.needed_monthly_minor !== null && words.target) {
    findings.push({
      key: 'needed',
      weight: 1,
      parts: ['It needs ', { minor: pace.needed_monthly_minor }, ` a month to arrive by ${words.target}.`],
    });
  }
  return findings;
}

// ---------------------------------------------------------------------------
// Recurring payments: what the set-up items cost a year, the one that
// carries most of it, and what else looks recurring.

export function recurringFindings(
  totalYearly: number,
  largest: { name: string; yearly_minor: number } | null,
  possible: { found: number; yearly_minor: number },
): Finding[] {
  const findings: Finding[] = [];
  if (totalYearly > 0) {
    const carries = largest && largest.yearly_minor >= totalYearly * LARGE_SHARE ? `, and ${largest.name} is ${percent(largest.yearly_minor / totalYearly)} of that` : '';
    findings.push({
      key: 'total',
      weight: 2,
      parts: ['Bills and subscriptions you’ve set up come to ', { minor: totalYearly }, ` a year${carries}.`],
    });
  }
  if (possible.found > 0) {
    findings.push({
      key: 'possible',
      weight: 1,
      parts: [
        `${possible.found} more ${possible.found === 1 ? 'expense looks' : 'expenses look'} recurring but ${possible.found === 1 ? 'isn’t' : 'aren’t'} set up: together about `,
        { minor: possible.yearly_minor },
        ' a year.',
      ],
    });
  }
  return findings;
}

// ---------------------------------------------------------------------------
// Cash runway: how long cash and goal savings would last, with a group's
// spending alone, and without touching goal accounts. Months come from
// Postgres, already rounded.

const months = (n: number) => `${new Intl.NumberFormat('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(n)} months`;

export function runwayFindings(
  runway: number | null,
  available: number | null,
  group: { name: string; months: number } | null,
): Finding[] {
  const findings: Finding[] = [];
  if (runway !== null) {
    findings.push({
      key: 'runway',
      weight: 2,
      parts: [
        `Cash and goal savings would cover about ${months(runway)} of spending at the recent average${group ? `, or ${months(group.months)} of ${group.name} alone` : ''}.`,
      ],
    });
  }
  if (available !== null && runway !== null && available < runway) {
    findings.push({
      key: 'available',
      weight: 1,
      parts: [`Without touching goal accounts, available cash covers ${months(available)}.`],
    });
  }
  return findings;
}

// ---------------------------------------------------------------------------
// Debt repayment: how what is owed moved, the debt paid down most, and when
// a loan would be cleared at its recent payment.

export type DebtFigures = { name: string; type: string; paid_minor: number; months_with_purchases: number; months_paid_full: number };

export function debtFindings(
  owedChange: number,
  debts: DebtFigures[],
  payoff: { name: string; recent_minor: number; month: string } | null,
  months: number,
): Finding[] {
  const findings: Finding[] = [];
  const most = [...debts].sort((a, b) => b.paid_minor - a.paid_minor)[0];
  if (owedChange !== 0) {
    findings.push({
      key: 'change',
      weight: 2,
      parts: [
        `What’s owed ${owedChange > 0 ? 'fell' : 'rose'} by `,
        { minor: Math.abs(owedChange) },
        ` in ${months === 1 ? '1 month' : `${months} months`}`,
        ...(most && most.paid_minor > 0 ? [`; the most went to the ${most.name}: `, { minor: most.paid_minor }, '.'] : ['.']),
      ],
    });
  }
  for (const card of debts.filter((d) => d.type === 'credit_card' && d.months_with_purchases > 0)) {
    if (card.months_paid_full === card.months_with_purchases) {
      findings.push({
        key: `card-${card.name}`,
        weight: 1,
        parts: [`The ${card.name} was paid in full every month, so its balance is only the latest purchases.`],
      });
    }
  }
  if (payoff) {
    findings.push({
      key: 'payoff',
      weight: 1,
      parts: ['At ', { minor: payoff.recent_minor }, ` a month, the ${payoff.name} would be cleared around ${payoff.month}.`],
    });
  }
  return findings;
}
