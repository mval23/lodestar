import { emptyTables, USER_ID, type Tables } from '../../e2e/fixtures';

// A made-up person's money, rich enough to fill every screen for the README.
// Synthetic throughout: no real names, accounts or amounts.

const now = new Date();
const monthStart = (offset: number) => {
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1));
  return date.toISOString().slice(0, 10);
};
const thisMonth = monthStart(0);
const day = (d: number) => `${thisMonth.slice(0, 8)}${String(Math.min(d, now.getUTCDate())).padStart(2, '0')}`;
const inDays = (n: number) => new Date(now.getTime() + n * 86_400_000).toISOString().slice(0, 10);

const stamp = { created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' };

type Account = [id: string, name: string, type: string, opening: number, moneyIn: number, moneyOut: number, liability?: boolean];
const accountList: Account[] = [
  ['acc-chk', 'Everyday checking', 'checking', 180000, 688200, 512400],
  ['acc-save', 'High-yield savings', 'savings', 900000, 245000, 0],
  ['acc-trip', 'Trip to Lisbon', 'savings', 60000, 95000, 0],
  ['acc-cash', 'Wallet', 'cash', 12000, 20000, 18450],
  ['acc-inv', 'Index funds', 'investment', 1450000, 60000, 0],
  ['acc-owed', 'Owed by Sam', 'other_asset', 35000, 0, 10000],
  ['acc-card', 'Blue card', 'credit_card', -42000, 118000, 96320, true],
  ['acc-car', 'Car loan', 'loan', -860000, 45000, 0, true],
];

// Category ids and names, grouped.
const groups = [
  { id: 'grp-home', name: 'Home' },
  { id: 'grp-daily', name: 'Day to day' },
  { id: 'grp-fun', name: 'Lifestyle' },
];
const categoryList: [id: string, name: string, kind: 'expense' | 'income', group: string | null][] = [
  ['cat-rent', 'Rent', 'expense', 'grp-home'],
  ['cat-utilities', 'Utilities', 'expense', 'grp-home'],
  ['cat-internet', 'Phone & internet', 'expense', 'grp-home'],
  ['cat-groceries', 'Groceries', 'expense', 'grp-daily'],
  ['cat-transport', 'Transport', 'expense', 'grp-daily'],
  ['cat-health', 'Health', 'expense', 'grp-daily'],
  ['cat-dining', 'Eating out', 'expense', 'grp-fun'],
  ['cat-subs', 'Subscriptions', 'expense', 'grp-fun'],
  ['cat-gifts', 'Gifts', 'expense', 'grp-fun'],
  ['cat-salary', 'Salary', 'income', null],
  ['cat-freelance', 'Freelance', 'income', null],
];

type Txn = [d: number, kind: 'expense' | 'income' | 'transfer', amount: number, description: string, from: string | null, to: string | null, category: string | null];
const txnList: Txn[] = [
  [23, 'expense', 6240, 'Corner market', 'acc-card', null, 'cat-groceries'],
  [22, 'expense', 1850, 'Lunch with Ana', 'acc-cash', null, 'cat-dining'],
  [21, 'expense', 1599, 'Streaming plan', 'acc-card', null, 'cat-subs'],
  [20, 'transfer', 25000, 'Lisbon fund', 'acc-chk', 'acc-trip', null],
  [19, 'expense', 4200, 'Train pass', 'acc-chk', null, 'cat-transport'],
  [18, 'income', 42000, 'Logo project', null, 'acc-chk', 'cat-freelance'],
  [17, 'expense', 11875, 'Weekly shop', 'acc-card', null, 'cat-groceries'],
  [15, 'income', 323100, 'Payroll', null, 'acc-chk', 'cat-salary'],
  [15, 'transfer', 45000, 'Emergency fund', 'acc-chk', 'acc-save', null],
  [14, 'expense', 3600, 'Pharmacy', 'acc-card', null, 'cat-health'],
  [12, 'expense', 17900, 'Electricity and water', 'acc-chk', null, 'cat-utilities'],
  [10, 'expense', 5500, 'Phone and fiber', 'acc-chk', null, 'cat-internet'],
  [8, 'expense', 3275, 'Birthday flowers', 'acc-card', null, 'cat-gifts'],
  [6, 'expense', 9460, 'Weekly shop', 'acc-card', null, 'cat-groceries'],
  [3, 'expense', 4380, 'Dinner out', 'acc-card', null, 'cat-dining'],
  [1, 'expense', 145000, 'Rent', 'acc-chk', null, 'cat-rent'],
  [1, 'income', 323100, 'Payroll', null, 'acc-chk', 'cat-salary'],
];

// Planned and spent this month, per category.
const budgetList: [category: string, planned: number, spent: number][] = [
  ['cat-rent', 145000, 145000],
  ['cat-utilities', 20000, 17900],
  ['cat-internet', 5500, 5500],
  ['cat-groceries', 30000, 27575],
  ['cat-transport', 8000, 4200],
  ['cat-health', 5000, 3600],
  ['cat-dining', 5000, 6230],
  ['cat-subs', 2500, 1599],
  ['cat-gifts', 4000, 3275],
];

// Twelve months of money in and out, newest first, as the view returns them.
const flow = [
  [688200, 443670], [646200, 468100], [662400, 431900], [646200, 512300],
  [701500, 455800], [646200, 470200], [646200, 489600], [598000, 452100],
  [646200, 438700], [612400, 501200], [646200, 447300], [580000, 466900],
];

export function readmeTables(): Tables {
  const tables = emptyTables();
  tables.profiles = { ...tables.profiles, display_name: 'Alex Rivera' };

  tables.accounts = accountList.map(([id, name, type, opening], index) => ({
    id, user_id: USER_ID, name, type, opening_balance_minor: opening, opening_date: null,
    sort_order: index, archived_at: null, source_ref: null, ...stamp,
  }));
  tables.account_balances = accountList.map(([id, name, type, opening, moneyIn, moneyOut, liability], index) => ({
    user_id: USER_ID, account_id: id, name, type, is_liability: Boolean(liability), sort_order: index,
    archived_at: null, opening_balance_minor: opening, money_in_minor: moneyIn, money_out_minor: moneyOut,
    balance_minor: opening + moneyIn - moneyOut,
  }));

  tables.category_groups = groups.map((group, index) => ({ ...group, user_id: USER_ID, sort_order: index, ...stamp }));
  tables.categories = categoryList.map(([id, name, kind, group], index) => ({
    id, user_id: USER_ID, group_id: group, name, kind, sort_order: index, archived_at: null, source_ref: null, ...stamp,
  }));
  tables.category_usage = categoryList.map(([id, , kind], index) => ({
    user_id: USER_ID, category_id: id, kind, last_used_at: '2026-09-01T00:00:00Z', use_count: 20 - index,
  }));

  tables.transactions = txnList.map(([d, kind, amount, description, from, to, category], index) => ({
    id: `0c000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    user_id: USER_ID, kind, occurred_on: day(d), amount_minor: amount, from_account_id: from, to_account_id: to,
    category_id: category, category_kind: category ? categoryList.find((c) => c[0] === category)![2] : null,
    description, notes: null, recurring_item_id: null, import_batch_id: null, source_ref: null, ...stamp,
  }));

  tables.budget_progress = budgetList.map(([category, planned, spent], index) => {
    const [, name, , group] = categoryList.find((c) => c[0] === category)!;
    return {
      user_id: USER_ID, budget_id: `bud-${index}`, category_id: category, category_name: name, group_id: group,
      month: thisMonth, planned_minor: planned, spent_minor: spent, left_minor: planned - spent,
    };
  });

  const goal = (id: string, account: string, name: string, target: number | null, date: string | null, plan: number | null, balance: number, contributed: number, order: number) => ({
    user_id: USER_ID, goal_id: id, account_id: account, name, target_minor: target, target_date: date,
    monthly_plan_minor: plan, sort_order: order, achieved_at: null, archived_at: null, balance_minor: balance,
    remaining_minor: target === null ? null : Math.max(0, target - balance), this_month: thisMonth,
    this_month_contributed_minor: contributed,
  });
  tables.goal_progress = [
    goal('goal-1', 'acc-save', 'Emergency fund', 1500000, null, 45000, 1145000, 45000, 0),
    goal('goal-2', 'acc-trip', 'Trip to Lisbon', 250000, `${now.getUTCFullYear() + 1}-05-01`, 25000, 155000, 25000, 1),
    goal('goal-3', 'acc-inv', 'Long-term investing', null, null, 30000, 1510000, 0, 2),
  ];

  const bill = (id: string, name: string, label: string, amount: number, category: string, due: string, unit = 'month', variable = false) => ({
    id, user_id: USER_ID, name, label, kind: 'expense', amount_minor: amount, amount_is_variable: variable,
    from_account_id: label === 'subscription' ? 'acc-card' : 'acc-chk', to_account_id: null, category_id: category,
    category_kind: 'expense', cadence_unit: unit, cadence_interval: 1, anchor_on: due, next_due_on: due,
    ends_on: null, archived_at: null, ...stamp,
  });
  tables.recurring_items = [
    bill('bill-1', 'Phone and fiber', 'bill', 5500, 'cat-internet', inDays(2)),
    bill('bill-2', 'Music', 'subscription', 1099, 'cat-subs', inDays(4)),
    bill('bill-3', 'Rent', 'bill', 145000, 'cat-rent', inDays(7)),
    bill('bill-4', 'Electricity and water', 'bill', 18000, 'cat-utilities', inDays(18), 'month', true),
    bill('bill-5', 'Streaming plan', 'subscription', 1599, 'cat-subs', inDays(27)),
    bill('bill-6', 'Cloud storage', 'subscription', 9999, 'cat-subs', inDays(140), 'year'),
  ];

  const toGoals = 70000;
  const [income, expense] = flow[0];
  tables.month_summary = [{
    user_id: USER_ID, month: thisMonth, income_minor: income, income_count: 3, expense_minor: expense,
    expense_count: 12, transfer_minor: toGoals, transfer_count: 2, to_goals_minor: toGoals, net_minor: income - expense,
  }];
  tables.monthly_cash_flow = flow.map(([moneyIn, moneyOut], offset) => ({
    user_id: USER_ID, month: monthStart(offset), money_in_minor: moneyIn, money_out_minor: moneyOut, net_minor: moneyIn - moneyOut,
  }));

  const assets = tables.account_balances.filter((a) => !a.is_liability).reduce((s, a) => s + (a.balance_minor as number), 0);
  const liabilities = tables.account_balances.filter((a) => a.is_liability).reduce((s, a) => s + (a.balance_minor as number), 0);
  // Walk back from today: each earlier month had less saved and more owed.
  tables.net_worth_by_month = flow.map((_, offset) => {
    const saved = flow.slice(0, offset).reduce((sum, [moneyIn, moneyOut]) => sum + moneyIn - moneyOut, 0);
    const assetsThen = assets - Math.round(saved * 0.8);
    const liabilitiesThen = liabilities - offset * 42000;
    return {
      user_id: USER_ID, month: monthStart(offset), assets_minor: assetsThen,
      liabilities_minor: liabilitiesThen, net_worth_minor: assetsThen + liabilitiesThen,
    };
  });

  tables.account_month_flow = [];
  tables.account_ledger = [];
  return tables;
}
