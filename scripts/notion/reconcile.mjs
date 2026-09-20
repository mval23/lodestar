// Parity between Notion and Lodestar, to the cent.
//
// The owner's own formula is the contract: Current Balance = Starting Balance
// + In − Out. If Lodestar computes the same number for every account, and the
// same monthly totals by kind, the migration carried the facts across. These
// functions are pure so the check can be run on a plan before anything is
// written, and again on what the database reports afterwards.

/** What Lodestar will hold for each account, computed the way Notion does. */
export function balancesFromPlan(plan) {
  const balances = new Map(
    plan.accounts.map((account) => [
      account.notion_id,
      { notion_id: account.notion_id, name: account.name, opening_minor: account.opening_balance_minor, in_minor: 0, out_minor: 0 },
    ]),
  );

  for (const row of plan.transactions) {
    if (row.from_account_notion_id && balances.has(row.from_account_notion_id)) {
      balances.get(row.from_account_notion_id).out_minor += row.amount_minor;
    }
    if (row.to_account_notion_id && balances.has(row.to_account_notion_id)) {
      balances.get(row.to_account_notion_id).in_minor += row.amount_minor;
    }
  }

  return [...balances.values()].map((account) => ({
    ...account,
    balance_minor: account.opening_minor + account.in_minor - account.out_minor,
  }));
}

/** Money in and out per month, transfers excluded, matching monthly_cash_flow. */
export function monthlyTotalsFromPlan(plan) {
  const months = new Map();
  for (const row of plan.transactions) {
    if (row.kind === 'transfer') continue;
    const month = `${row.occurred_on.slice(0, 7)}-01`;
    const entry = months.get(month) ?? { month, money_in_minor: 0, money_out_minor: 0 };
    if (row.kind === 'income') entry.money_in_minor += row.amount_minor;
    else entry.money_out_minor += row.amount_minor;
    months.set(month, entry);
  }
  return [...months.values()].sort((a, b) => a.month.localeCompare(b.month));
}

/**
 * Compares what Notion reports with what Lodestar computes. Any difference at
 * all is a failure: "close enough" is how a migration loses money quietly.
 */
export function compareBalances(notionBalances, lodestarBalances) {
  const byName = new Map(lodestarBalances.map((account) => [account.name.trim().toLowerCase(), account]));
  const rows = notionBalances.map((expected) => {
    const actual = byName.get(expected.name.trim().toLowerCase());
    const actualMinor = actual ? actual.balance_minor : null;
    return {
      name: expected.name,
      expected_minor: expected.balance_minor,
      actual_minor: actualMinor,
      difference_minor: actualMinor === null ? null : actualMinor - expected.balance_minor,
      ok: actualMinor !== null && actualMinor === expected.balance_minor,
    };
  });

  const missing = lodestarBalances
    .filter((account) => !notionBalances.some((n) => n.name.trim().toLowerCase() === account.name.trim().toLowerCase()))
    .map((account) => ({
      name: account.name,
      expected_minor: null,
      actual_minor: account.balance_minor,
      difference_minor: null,
      ok: false,
    }));

  const all = [...rows, ...missing];
  return { rows: all, ok: all.every((row) => row.ok) };
}

export function compareMonthlyTotals(expected, actual) {
  const byMonth = new Map(actual.map((row) => [row.month, row]));
  const months = [...new Set([...expected.map((r) => r.month), ...actual.map((r) => r.month)])].sort();
  const rows = months.map((month) => {
    const want = expected.find((row) => row.month === month) ?? { money_in_minor: 0, money_out_minor: 0 };
    const got = byMonth.get(month) ?? { money_in_minor: 0, money_out_minor: 0 };
    return {
      month,
      expected_in_minor: want.money_in_minor,
      actual_in_minor: got.money_in_minor,
      expected_out_minor: want.money_out_minor,
      actual_out_minor: got.money_out_minor,
      ok: want.money_in_minor === got.money_in_minor && want.money_out_minor === got.money_out_minor,
    };
  });
  return { rows, ok: rows.every((row) => row.ok) };
}

const format = (minor) => {
  if (minor === null || minor === undefined) return '—';
  const sign = minor < 0 ? '−' : '';
  const value = Math.abs(minor);
  return `${sign}$${Math.floor(value / 100).toLocaleString('en-US')}.${String(value % 100).padStart(2, '0')}`;
};

/** A report a person can read and sign off, rather than a pile of JSON. */
export function reconciliationReport({ balances, monthly, plan }) {
  const lines = [];
  lines.push('# Notion migration: reconciliation');
  lines.push('');
  lines.push(`Generated ${new Date().toISOString().slice(0, 10)}. Amounts are USD.`);
  lines.push('');
  lines.push(`- Transactions to import: **${plan.transactions.length}**`);
  lines.push(`- Accounts: **${plan.accounts.length}** · Categories: **${plan.categories.length}** · Goals: **${plan.goals.length}**`);
  lines.push(`- Rows needing a decision: **${plan.review.length}**`);
  lines.push(`- Possible duplicate groups: **${plan.duplicates.length}**`);
  lines.push('');

  lines.push('## Account balances');
  lines.push('');
  lines.push('| Account | Notion | Lodestar | Difference |');
  lines.push('|---|---:|---:|---:|');
  for (const row of balances.rows) {
    lines.push(
      `| ${row.name} | ${format(row.expected_minor)} | ${format(row.actual_minor)} | ${row.ok ? '—' : format(row.difference_minor)} |`,
    );
  }
  lines.push('');
  lines.push(balances.ok ? '**Every account matches to the cent.**' : '**Some accounts do not match. Do not cut over.**');
  lines.push('');

  lines.push('## Monthly totals by kind');
  lines.push('');
  lines.push('| Month | In (Notion) | In (Lodestar) | Out (Notion) | Out (Lodestar) |');
  lines.push('|---|---:|---:|---:|---:|');
  for (const row of monthly.rows) {
    lines.push(
      `| ${row.month.slice(0, 7)} | ${format(row.expected_in_minor)} | ${format(row.actual_in_minor)} | ${format(row.expected_out_minor)} | ${format(row.actual_out_minor)} |`,
    );
  }
  lines.push('');
  lines.push(monthly.ok ? '**Every month matches to the cent.**' : '**Some months do not match. Do not cut over.**');
  lines.push('');

  if (plan.review.length > 0) {
    lines.push('## Rows that need a decision');
    lines.push('');
    lines.push('These are not imported. Fix them in Notion and run the extract again, or accept their loss knowingly.');
    lines.push('');
    lines.push('| Date | Description | Why | Notion page |');
    lines.push('|---|---|---|---|');
    for (const row of plan.review) {
      lines.push(`| ${row.date || '—'} | ${row.description || '—'} | ${row.reason} | \`${row.notion_id}\` |`);
    }
    lines.push('');
  }

  if (plan.duplicates.length > 0) {
    lines.push('## Possible duplicates');
    lines.push('');
    lines.push('Same date, amount and description. Two identical purchases on one day are ordinary, so these are');
    lines.push('imported as they are; check them and delete any that are genuinely the same event twice.');
    lines.push('');
    lines.push('| Date | Amount | Description | Times |');
    lines.push('|---|---:|---|---:|');
    for (const row of plan.duplicates) {
      lines.push(`| ${row.occurred_on} | ${format(row.amount_minor)} | ${row.description} | ${row.count} |`);
    }
    lines.push('');
  }

  return lines.join('\n');
}
