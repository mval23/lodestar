// Turning the Notion hub into Lodestar rows.
//
// Every rule here comes from CLAUDE.md's migration section, and every one of
// them is pure: extraction and import do the talking to services, this file
// only decides what the data means. That is what makes it testable without a
// Notion token and without a database.
//
// The guiding principle applies here more than anywhere: migrate the data and
// the intent, never the mechanics. Notion's empty-relation trick for
// direction becomes an explicit kind; its savings categories become goals;
// its rollups and formulas become queries and are not migrated at all.

/** Notion's Account Type select → Lodestar's account_type enum. */
export const ACCOUNT_TYPES = {
  checking: 'checking',
  savings: 'savings',
  'credit card': 'credit_card',
  credit: 'credit_card',
  cash: 'cash',
  investment: 'investment',
  loan: 'loan',
  'money owed to me': 'other_asset',
  'other asset': 'other_asset',
};

export function accountTypeFor(notionType, name) {
  const key = String(notionType ?? '').trim().toLowerCase();
  if (ACCOUNT_TYPES[key]) return ACCOUNT_TYPES[key];
  // The money-owed fund is an asset, not a savings pot: it is money that
  // exists but is not yours to spend yet.
  if (/owed|lend|loan to/i.test(String(name ?? ''))) return 'other_asset';
  return 'other_asset';
}

/**
 * Dollars to cents, exactly. Notion stores a float; every amount in the hub
 * has at most two decimals, so fixing to two and stripping the point is
 * lossless, where multiplying by 100 would not always be.
 */
export function toCents(amount) {
  if (amount === null || amount === undefined) return null;
  const value = Number(amount);
  if (!Number.isFinite(value)) return null;
  const negative = value < 0;
  const [whole, fraction = ''] = Math.abs(value).toFixed(2).split('.');
  const cents = Number(`${whole}${fraction}`);
  return negative ? -cents : cents;
}

/** Direction, which Notion encodes by which relation is filled. */
export function kindOf(sourceId, destinationId) {
  if (sourceId && destinationId) return 'transfer';
  if (sourceId) return 'expense';
  if (destinationId) return 'income';
  return null;
}

/** A row's identity in Lodestar, keyed by its Notion page id so a re-run inserts nothing. */
export function sourceRefFor(pageId) {
  return `notion:${pageId}`;
}

/** Tags are kept, appended to the notes, because Lodestar has no tag field. */
export function notesFor(notes, tags) {
  const parts = [];
  const trimmedNotes = String(notes ?? '').trim();
  if (trimmedNotes) parts.push(trimmedNotes);
  const list = (tags ?? []).map((tag) => String(tag).trim()).filter(Boolean);
  if (list.length > 0) parts.push(`Tags: ${list.join(', ')}`);
  const joined = parts.join('\n');
  return joined === '' ? null : joined.slice(0, 4000);
}

/**
 * Builds the Lodestar rows, plus the list of rows a person has to decide
 * about. Nothing is dropped silently: anything that cannot be migrated
 * appears in `review` with the reason and its Notion page id.
 */
export function planMigration({ accounts, categories, transactions, savingsCategoryNames = [] }) {
  const savings = new Set(savingsCategoryNames.map((name) => name.trim().toLowerCase()));

  const accountByNotionId = new Map();
  const plannedAccounts = accounts.map((account) => {
    const row = {
      notion_id: account.id,
      name: account.name.trim(),
      type: accountTypeFor(account.type, account.name),
      opening_balance_minor: toCents(account.starting_balance) ?? 0,
      source_ref: sourceRefFor(account.id),
    };
    accountByNotionId.set(account.id, row);
    return row;
  });

  const categoryByNotionId = new Map();
  const groups = new Set();
  const plannedCategories = categories.map((category) => {
    const group = String(category.group ?? '').trim();
    if (group) groups.add(group);
    const row = {
      notion_id: category.id,
      name: category.name.trim(),
      // Notion has no income categories in the hub; anything that is not a
      // savings label is spending.
      kind: category.kind === 'income' ? 'income' : 'expense',
      group,
      is_savings: savings.has(category.name.trim().toLowerCase()),
      budget_minor: toCents(category.budget),
      source_ref: sourceRefFor(category.id),
    };
    categoryByNotionId.set(category.id, row);
    return row;
  });

  const review = [];
  const rows = [];
  // Goals: one per fund account that savings actually flowed into. Which
  // savings category sent the money matters, because each category carries its
  // own budget: Sinking Funds may cover several funds while Emergency Fund
  // covers one.
  const goalAccounts = new Map();
  const contributions = [];

  for (const txn of transactions) {
    const flag = (reason) => review.push({ notion_id: txn.id, description: txn.description ?? '', date: txn.date ?? '', reason });

    const kind = kindOf(txn.source_id, txn.destination_id);
    if (!kind) {
      // Notion's own "Errors" view: neither side filled.
      flag('Neither Source nor Destination is set, so there is no direction to migrate.');
      continue;
    }
    if (!txn.date) {
      flag('No date.');
      continue;
    }
    const amount = toCents(txn.amount);
    if (amount === null || amount === 0) {
      flag('No amount, or an amount of zero.');
      continue;
    }
    if (amount < 0) {
      flag('A negative amount: direction comes from Source and Destination, so the sign is ambiguous.');
      continue;
    }
    if (kind === 'transfer' && txn.source_id === txn.destination_id) {
      flag('A transfer from an account to itself.');
      continue;
    }

    const from = txn.source_id ? accountByNotionId.get(txn.source_id) : null;
    const to = txn.destination_id ? accountByNotionId.get(txn.destination_id) : null;
    if ((txn.source_id && !from) || (txn.destination_id && !to)) {
      flag('Points at an account that is not in the Accounts database.');
      continue;
    }

    const category = txn.category_id ? categoryByNotionId.get(txn.category_id) : null;
    if (txn.category_id && !category) {
      flag('Points at a category that is not in the Category database.');
      continue;
    }

    // A savings transfer is a contribution: the category named the fund, and
    // in Lodestar the destination account's goal says that instead.
    if (kind === 'transfer' && category?.is_savings && to) {
      goalAccounts.set(to.notion_id, { account_notion_id: to.notion_id, name: to.name });
      contributions.push({
        category_notion_id: category.notion_id,
        account_notion_id: to.notion_id,
        amount_minor: amount,
        occurred_on: txn.date,
      });
    }

    rows.push({
      notion_id: txn.id,
      kind,
      occurred_on: txn.date,
      amount_minor: amount,
      from_account_notion_id: txn.source_id ?? null,
      to_account_notion_id: txn.destination_id ?? null,
      // Transfers never carry a category, whatever Notion filed them under.
      category_notion_id: kind === 'transfer' ? null : (txn.category_id ?? null),
      description: (txn.description ?? '').trim().slice(0, 140) || (kind === 'income' ? 'Income' : 'Expense'),
      notes: notesFor(txn.notes, txn.tags),
      status: 'cleared',
      source_ref: sourceRefFor(txn.id),
    });
  }

  // A category used only to label savings is not a spending category in
  // Lodestar: its budget moves to the goals, and the category itself is not
  // migrated.
  const keptCategories = plannedCategories.filter((category) => !category.is_savings);
  const savingsCategories = plannedCategories.filter((category) => category.is_savings);
  const goals = assignGoalPlans([...goalAccounts.values()], savingsCategories, contributions);

  return {
    accounts: plannedAccounts,
    groups: [...groups].sort(),
    categories: keptCategories,
    budgets: keptCategories
      .filter((category) => (category.budget_minor ?? 0) > 0)
      .map((category) => ({ category_notion_id: category.notion_id, amount_minor: category.budget_minor })),
    goals,
    transactions: rows,
    review,
    duplicates: findDuplicates(rows),
  };
}

/**
 * Each savings category carries its own budget, and each goal belongs to the
 * category that actually funded it. A category covering several funds — the
 * Sinking Funds case — has its budget split between them by each fund's share
 * of the last six months of contributions, which is the owner's own rule. The
 * last goal in a split takes the remainder, so the parts add back to the whole
 * rather than losing a cent to rounding.
 */
export function assignGoalPlans(goals, savingsCategories, contributions, monthsBack = 6) {
  if (goals.length === 0) return [];

  const cutoff = sixMonthsBefore(latestDate(contributions), monthsBack);
  const recent = contributions.filter((row) => row.occurred_on >= cutoff);

  // Which category funded each goal: the one that put the most into it, so a
  // fund that once received a stray transfer is not reassigned by it.
  const totalsByPair = new Map();
  for (const row of recent) {
    const key = `${row.category_notion_id}|${row.account_notion_id}`;
    totalsByPair.set(key, (totalsByPair.get(key) ?? 0) + row.amount_minor);
  }
  const allTimeByPair = new Map();
  for (const row of contributions) {
    const key = `${row.category_notion_id}|${row.account_notion_id}`;
    allTimeByPair.set(key, (allTimeByPair.get(key) ?? 0) + row.amount_minor);
  }

  const ownerOf = new Map();
  for (const goal of goals) {
    let best = null;
    for (const category of savingsCategories) {
      const key = `${category.notion_id}|${goal.account_notion_id}`;
      const amount = allTimeByPair.get(key) ?? 0;
      if (amount > 0 && (!best || amount > best.amount)) best = { category, amount };
    }
    if (best) ownerOf.set(goal.account_notion_id, best.category);
  }

  const planned = new Map();
  for (const category of savingsCategories) {
    const mine = goals.filter((goal) => ownerOf.get(goal.account_notion_id)?.notion_id === category.notion_id);
    const budget = category.budget_minor ?? 0;
    if (mine.length === 0 || budget <= 0) continue;

    const shares = mine.map((goal) => totalsByPair.get(`${category.notion_id}|${goal.account_notion_id}`) ?? 0);
    const total = shares.reduce((sum, value) => sum + value, 0);
    let assigned = 0;
    mine.forEach((goal, index) => {
      const isLast = index === mine.length - 1;
      const share = isLast
        ? budget - assigned
        : total > 0
          ? Math.round((shares[index] / total) * budget)
          : Math.round(budget / mine.length);
      assigned += share;
      planned.set(goal.account_notion_id, share);
    });
  }

  return goals.map((goal) => ({
    ...goal,
    from_category: ownerOf.get(goal.account_notion_id)?.name ?? null,
    monthly_plan_minor: planned.get(goal.account_notion_id) ?? null,
  }));
}

function latestDate(rows) {
  return rows.reduce((latest, row) => (row.occurred_on > latest ? row.occurred_on : latest), '1970-01-01');
}

function sixMonthsBefore(isoDate, monthsBack) {
  const [year, month, day] = isoDate.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1 - monthsBack, day || 1));
  return date.toISOString().slice(0, 10);
}

/**
 * Rows that look like the same event twice. They are reported, never removed:
 * two identical purchases on one day are perfectly ordinary, and only a
 * person can tell the difference.
 */
export function findDuplicates(rows) {
  const groups = new Map();
  for (const row of rows) {
    const key = [row.occurred_on, row.amount_minor, row.kind, row.description.trim().toLowerCase()].join('|');
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return [...groups.values()]
    .filter((group) => group.length > 1)
    .map((group) => ({
      occurred_on: group[0].occurred_on,
      amount_minor: group[0].amount_minor,
      description: group[0].description,
      count: group.length,
      notion_ids: group.map((row) => row.notion_id),
    }));
}
