import {
  accountTypeFor,
  findDuplicates,
  kindOf,
  notesFor,
  planMigration,
  splitSavingsBudget,
  toCents,
} from './transform.mjs';
import { balancesFromPlan, compareBalances, compareMonthlyTotals, monthlyTotalsFromPlan } from './reconcile.mjs';

// Synthetic throughout: no real account names, amounts or descriptions.
const ACCOUNTS = [
  { id: 'acc-chk', name: 'Everyday checking', type: 'Checking', starting_balance: 1000 },
  { id: 'acc-fund', name: 'Rainy day fund', type: 'Savings', starting_balance: 0 },
  { id: 'acc-trip', name: 'Trip fund', type: 'Savings', starting_balance: 0 },
  { id: 'acc-card', name: 'Blue card', type: 'Credit Card', starting_balance: -200 },
  { id: 'acc-owed', name: 'Money owed to me', type: 'Other', starting_balance: 50 },
];

const CATEGORIES = [
  { id: 'cat-groceries', name: 'Groceries', group: 'Essentials', budget: 400 },
  { id: 'cat-rent', name: 'Rent', group: 'Essentials', budget: 1200 },
  { id: 'cat-sinking', name: 'Sinking Funds', group: 'Saving', budget: 300 },
];

const SAVINGS = ['Sinking Funds'];

function txn(over) {
  return { id: 'txn-1', description: 'Market', date: '2026-09-19', amount: 45.5, source_id: 'acc-chk', ...over };
}

describe('toCents', () => {
  it('converts dollars exactly, including the ones a float would spoil', () => {
    expect(toCents(45.5)).toBe(4550);
    expect(toCents(1.15)).toBe(115);
    expect(toCents(8.2)).toBe(820);
    expect(toCents(4.35)).toBe(435);
    expect(toCents(1234567.89)).toBe(123456789);
    expect(toCents(0)).toBe(0);
    expect(toCents(-200)).toBe(-20000);
  });

  it('has nothing to say about a missing or unreadable amount', () => {
    expect(toCents(null)).toBeNull();
    expect(toCents(undefined)).toBeNull();
    expect(toCents('abc')).toBeNull();
  });
});

describe('kindOf', () => {
  it('reads direction from which relation Notion filled', () => {
    expect(kindOf('acc-chk', null)).toBe('expense');
    expect(kindOf(null, 'acc-chk')).toBe('income');
    expect(kindOf('acc-chk', 'acc-fund')).toBe('transfer');
    expect(kindOf(null, null)).toBeNull();
  });
});

describe('accountTypeFor', () => {
  it('maps the Notion types, and treats the money-owed fund as an asset', () => {
    expect(accountTypeFor('Checking')).toBe('checking');
    expect(accountTypeFor('Credit Card')).toBe('credit_card');
    expect(accountTypeFor('Savings')).toBe('savings');
    expect(accountTypeFor('Other', 'Money owed to me')).toBe('other_asset');
    expect(accountTypeFor(null, 'Something else')).toBe('other_asset');
  });
});

describe('notesFor', () => {
  it('keeps tags by appending them, since Lodestar has no tag field', () => {
    expect(notesFor('Split with Sam', ['holiday', 'shared'])).toBe('Split with Sam\nTags: holiday, shared');
    expect(notesFor('', ['holiday'])).toBe('Tags: holiday');
    expect(notesFor('Just a note', [])).toBe('Just a note');
    expect(notesFor('', [])).toBeNull();
  });
});

describe('planMigration', () => {
  const plan = (transactions) =>
    planMigration({ accounts: ACCOUNTS, categories: CATEGORIES, transactions, savingsCategoryNames: SAVINGS });

  it('carries each kind across with its accounts and category', () => {
    const result = plan([
      txn({ id: 't1', category_id: 'cat-groceries' }),
      txn({ id: 't2', description: 'Pay', amount: 2500, source_id: null, destination_id: 'acc-chk' }),
      txn({ id: 't3', description: 'To fund', amount: 100, destination_id: 'acc-fund' }),
    ]);

    expect(result.review).toEqual([]);
    expect(result.transactions).toHaveLength(3);
    expect(result.transactions[0]).toMatchObject({
      kind: 'expense',
      amount_minor: 4550,
      from_account_notion_id: 'acc-chk',
      to_account_notion_id: null,
      category_notion_id: 'cat-groceries',
      source_ref: 'notion:t1',
    });
    expect(result.transactions[1]).toMatchObject({ kind: 'income', to_account_notion_id: 'acc-chk' });
    expect(result.transactions[2]).toMatchObject({ kind: 'transfer', to_account_notion_id: 'acc-fund' });
  });

  it('never lets a transfer keep a category, whatever Notion filed it under', () => {
    const result = plan([txn({ id: 't1', destination_id: 'acc-fund', category_id: 'cat-sinking' })]);
    expect(result.transactions[0].category_notion_id).toBeNull();
  });

  it('turns a savings transfer into a goal on the destination account', () => {
    const result = plan([
      txn({ id: 't1', destination_id: 'acc-fund', category_id: 'cat-sinking' }),
      txn({ id: 't2', destination_id: 'acc-trip', category_id: 'cat-sinking' }),
    ]);
    expect(result.goals.map((goal) => goal.account_notion_id).sort()).toEqual(['acc-fund', 'acc-trip']);
    // The savings category itself does not become a spending category.
    expect(result.categories.map((c) => c.notion_id)).not.toContain('cat-sinking');
  });

  it('keeps every other category, with its group and budget', () => {
    const result = plan([]);
    expect(result.categories.map((c) => c.name).sort()).toEqual(['Groceries', 'Rent']);
    expect(result.groups).toEqual(['Essentials', 'Saving']);
    expect(result.budgets).toEqual([
      { category_notion_id: 'cat-groceries', amount_minor: 40000 },
      { category_notion_id: 'cat-rent', amount_minor: 120000 },
    ]);
  });

  it('flags rather than drops anything it cannot migrate', () => {
    const result = plan([
      txn({ id: 'e1', source_id: null, destination_id: null }),
      txn({ id: 'e2', date: null }),
      txn({ id: 'e3', amount: 0 }),
      txn({ id: 'e4', amount: -10 }),
      txn({ id: 'e5', destination_id: 'acc-chk' }),
      txn({ id: 'e6', source_id: 'acc-missing' }),
      txn({ id: 'e7', category_id: 'cat-missing' }),
    ]);

    expect(result.transactions).toEqual([]);
    expect(result.review.map((row) => row.notion_id)).toEqual(['e1', 'e2', 'e3', 'e4', 'e5', 'e6', 'e7']);
    expect(result.review[0].reason).toMatch(/Neither Source nor Destination/);
    expect(result.review[4].reason).toMatch(/to itself/);
  });

  it('names an unnamed row after its direction, because the database needs one', () => {
    const result = plan([txn({ id: 't1', description: '   ' })]);
    expect(result.transactions[0].description).toBe('Expense');
  });

  it('keys every row by its Notion page, so a second run inserts nothing', () => {
    const result = plan([txn({ id: 't1' })]);
    expect(result.transactions[0].source_ref).toBe('notion:t1');
    expect(result.accounts[0].source_ref).toBe('notion:acc-chk');
  });
});

describe('splitSavingsBudget', () => {
  const goals = [
    { account_notion_id: 'acc-fund', name: 'Rainy day fund' },
    { account_notion_id: 'acc-trip', name: 'Trip fund' },
  ];

  it('splits by each fund’s share of the last six months of contributions', () => {
    const rows = [
      { kind: 'transfer', to_account_notion_id: 'acc-fund', amount_minor: 30000, occurred_on: '2026-09-01' },
      { kind: 'transfer', to_account_notion_id: 'acc-trip', amount_minor: 10000, occurred_on: '2026-09-01' },
    ];
    // 75% and 25% of a $300 budget.
    expect(splitSavingsBudget(goals, rows, 30000).map((g) => g.monthly_plan_minor)).toEqual([22500, 7500]);
  });

  it('ignores contributions older than the window', () => {
    const rows = [
      { kind: 'transfer', to_account_notion_id: 'acc-fund', amount_minor: 30000, occurred_on: '2026-09-01' },
      { kind: 'transfer', to_account_notion_id: 'acc-trip', amount_minor: 90000, occurred_on: '2024-01-01' },
    ];
    expect(splitSavingsBudget(goals, rows, 30000).map((g) => g.monthly_plan_minor)).toEqual([30000, 0]);
  });

  it('splits evenly when there is nothing to measure', () => {
    expect(splitSavingsBudget(goals, [], 30000).map((g) => g.monthly_plan_minor)).toEqual([15000, 15000]);
  });

  it('gives the remainder to the last goal, so the parts add back to the whole', () => {
    const three = [...goals, { account_notion_id: 'acc-owed', name: 'Third' }];
    const shares = splitSavingsBudget(three, [], 10000).map((g) => g.monthly_plan_minor);
    expect(shares.reduce((a, b) => a + b, 0)).toBe(10000);
  });
});

describe('findDuplicates', () => {
  it('reports repeats without removing them', () => {
    const rows = [
      { notion_id: 'a', occurred_on: '2026-09-19', amount_minor: 450, kind: 'expense', description: 'Coffee' },
      { notion_id: 'b', occurred_on: '2026-09-19', amount_minor: 450, kind: 'expense', description: 'coffee' },
      { notion_id: 'c', occurred_on: '2026-09-19', amount_minor: 900, kind: 'expense', description: 'Lunch' },
    ];
    const duplicates = findDuplicates(rows);
    expect(duplicates).toHaveLength(1);
    expect(duplicates[0]).toMatchObject({ count: 2, notion_ids: ['a', 'b'] });
  });
});

describe('reconciliation', () => {
  const plan = planMigration({
    accounts: ACCOUNTS,
    categories: CATEGORIES,
    savingsCategoryNames: SAVINGS,
    transactions: [
      txn({ id: 't1', amount: 45.5, category_id: 'cat-groceries' }),
      txn({ id: 't2', description: 'Pay', amount: 2500, source_id: null, destination_id: 'acc-chk' }),
      txn({ id: 't3', description: 'To fund', amount: 100, destination_id: 'acc-fund' }),
    ],
  });

  it('computes each balance the way Notion does: opening + in − out', () => {
    const balances = balancesFromPlan(plan);
    const checking = balances.find((account) => account.notion_id === 'acc-chk');
    // 1000 + 2500 − 45.50 − 100 = 3354.50
    expect(checking.balance_minor).toBe(335450);
    expect(balances.find((a) => a.notion_id === 'acc-fund').balance_minor).toBe(10000);
    expect(balances.find((a) => a.notion_id === 'acc-card').balance_minor).toBe(-20000);
  });

  it('totals each month by kind, leaving transfers out', () => {
    expect(monthlyTotalsFromPlan(plan)).toEqual([
      { month: '2026-09-01', money_in_minor: 250000, money_out_minor: 4550 },
    ]);
  });

  it('passes only when every account matches to the cent', () => {
    const lodestar = balancesFromPlan(plan);
    const notion = lodestar.map((account) => ({ name: account.name, balance_minor: account.balance_minor }));
    expect(compareBalances(notion, lodestar).ok).toBe(true);

    const offByOneCent = notion.map((account, index) =>
      index === 0 ? { ...account, balance_minor: account.balance_minor + 1 } : account,
    );
    const result = compareBalances(offByOneCent, lodestar);
    expect(result.ok).toBe(false);
    expect(result.rows[0].difference_minor).toBe(-1);
  });

  it('fails when an account exists on one side only', () => {
    const lodestar = balancesFromPlan(plan);
    expect(compareBalances([], lodestar).ok).toBe(false);
    expect(compareBalances([{ name: 'Ghost account', balance_minor: 100 }], lodestar).ok).toBe(false);
  });

  it('compares months, and notices one that is missing entirely', () => {
    const expected = monthlyTotalsFromPlan(plan);
    expect(compareMonthlyTotals(expected, expected).ok).toBe(true);
    expect(compareMonthlyTotals(expected, []).ok).toBe(false);
  });
});
