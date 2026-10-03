// One synthetic Lodestar dataset (USD, cents), built row by row as the
// database would hold it, then every figure is derived the way the views do.
// It is the made-up person behind the report and dashboard mockups in
// docs/report-concepts/: 24 months, Oct 2024 to Sep 2026, eight accounts,
// four goals, bills and subscriptions. Nothing here is real financial data.
// Seeded, so every run gives the same rows.

let seed = 20261002;
const rand = () => {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const between = (lo, hi) => Math.round(lo + rand() * (hi - lo)); // cents

export const MONTHS = Array.from({ length: 24 }, (_, i) => {
  const d = new Date(Date.UTC(2024, 9 + i, 1));
  return { i, y: d.getUTCFullYear(), m: d.getUTCMonth() + 1 };
});
export const monthLabel = (i, long = false) => {
  const { y, m } = MONTHS[i];
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString('en-US', { month: 'short', timeZone: 'UTC', ...(long ? { year: 'numeric' } : {}) });
};
const day = (i, d) => {
  const { y, m } = MONTHS[i];
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${y}-${String(m).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`;
};

export const accounts = [
  { id: 'chk', name: 'Everyday checking', type: 'checking', opening: 420000 },
  { id: 'efund', name: 'Emergency fund', type: 'savings', opening: 600000 },
  { id: 'travel', name: 'Travel fund', type: 'savings', opening: 0 },
  { id: 'home', name: 'Home deposit', type: 'savings', opening: 300000 },
  { id: 'wallet', name: 'Wallet', type: 'cash', opening: 12000 },
  { id: 'invest', name: 'Retirement', type: 'investment', opening: 1850000 },
  { id: 'visa', name: 'Visa card', type: 'credit_card', opening: -124000 },
  { id: 'loan', name: 'Car loan', type: 'loan', opening: -1480000 },
];
export const isLiability = (a) => a.type === 'credit_card' || a.type === 'loan';
export const acct = Object.fromEntries(accounts.map((a) => [a.id, a]));

export const groups = {
  Essentials: ['Rent', 'Groceries', 'Utilities', 'Phone & internet', 'Transport', 'Insurance', 'Health'],
  Lifestyle: ['Dining out', 'Shopping', 'Subscriptions', 'Personal care', 'Travel', 'Gifts'],
};
export const groupOf = (c) => Object.keys(groups).find((g) => groups[g].includes(c)) ?? null;

export const goals = [
  { name: 'Emergency fund', account: 'efund', target: 1500000, targetDate: null, plan: 30000 },
  { name: 'Travel', account: 'travel', target: 400000, targetDate: '2027-06-30', plan: 20000 },
  { name: 'Home deposit', account: 'home', target: 4000000, targetDate: null, plan: 50000 },
  { name: 'Retirement', account: 'invest', target: null, targetDate: null, plan: 25000 },
];

// Bills and subscriptions the person set up; "Mark as paid" links their rows.
export const recurring = [
  { id: 'r-rent', label: 'bill', name: 'Rent', category: 'Rent', amount: 165000, variable: false, unit: 'month', every: 1 },
  { id: 'r-elec', label: 'bill', name: 'Electric bill', category: 'Utilities', amount: 11000, variable: true, unit: 'month', every: 1 },
  { id: 'r-net', label: 'bill', name: 'Home internet', category: 'Phone & internet', amount: 6500, variable: false, unit: 'month', every: 1 },
  { id: 'r-phone', label: 'bill', name: 'Phone plan', category: 'Phone & internet', amount: 3000, variable: false, unit: 'month', every: 1 },
  { id: 'r-ins', label: 'bill', name: 'Car insurance', category: 'Insurance', amount: 11800, variable: false, unit: 'month', every: 1 },
  { id: 'r-gym', label: 'subscription', name: 'Gym membership', category: 'Subscriptions', amount: 4500, variable: false, unit: 'month', every: 1 },
  { id: 'r-stream', label: 'subscription', name: 'Video streaming', category: 'Subscriptions', amount: 1549, variable: false, unit: 'month', every: 1 },
  { id: 'r-music', label: 'subscription', name: 'Music streaming', category: 'Subscriptions', amount: 1099, variable: false, unit: 'month', every: 1 },
  { id: 'r-loan', label: 'transfer', name: 'Car loan payment', category: null, amount: 38500, variable: false, unit: 'month', every: 1 },
];

export const tx = [];
const expense = (i, d, from, category, amount, description, recurringId = null) =>
  tx.push({ kind: 'expense', month: i, date: day(i, d), from, to: null, category, amount, description, recurringId });
const income = (i, d, to, category, amount, description) =>
  tx.push({ kind: 'income', month: i, date: day(i, d), from: null, to, category, amount, description });
const transfer = (i, d, from, to, amount, description, recurringId = null) =>
  tx.push({ kind: 'transfer', month: i, date: day(i, d), from, to, category: null, amount, description, recurringId });

const freelance = [0, 65000, 0, 40000, 0, 0, 90000, 0, 30000, 0, 75000, 0, 0, 82000, 0, 45000, 0, 60000, 0, 0, 110000, 0, 0, 50000];
const elecSeason = [9000, 10500, 13800, 14600, 13200, 11000, 9200, 8800, 10400, 13600, 14200, 11800];

for (const { i } of MONTHS) {
  const salary = i < 15 ? 245000 : 255000;
  income(i, 15, 'chk', 'Salary', salary, 'Salary');
  income(i, 31, 'chk', 'Salary', salary, 'Salary');
  if (freelance[i]) income(i, 22, 'chk', 'Freelance', freelance[i], 'Design project invoice');
  if (i === 2) income(i, 19, 'chk', 'Bonus', 150000, 'Year-end bonus');
  if (i === 14) income(i, 19, 'chk', 'Bonus', 200000, 'Year-end bonus');

  // Card: last month's statement paid in full on the 5th.
  const owed = i === 0 ? 124000 : tx.filter((t) => t.month === i - 1 && t.kind === 'expense' && t.from === 'visa').reduce((s, t) => s + t.amount, 0);
  transfer(i, 5, 'chk', 'visa', owed, 'Visa payment');

  // Bills and subscriptions (marked as paid)
  expense(i, 1, 'chk', 'Rent', i < 10 ? 160000 : 165000, 'Rent', 'r-rent');
  expense(i, 12, 'chk', 'Utilities', elecSeason[i % 12] + between(-600, 600), 'Electric bill', 'r-elec');
  expense(i, 9, 'chk', 'Utilities', between(3200, 4400), 'Water and gas');
  expense(i, 8, 'visa', 'Phone & internet', 6500, 'Home internet', 'r-net');
  expense(i, 8, 'visa', 'Phone & internet', 3000, 'Phone plan', 'r-phone');
  expense(i, 3, 'chk', 'Insurance', 11800, 'Car insurance', 'r-ins');
  expense(i, 2, 'chk', 'Subscriptions', 4500, 'Gym membership', 'r-gym');
  expense(i, 11, 'visa', 'Subscriptions', 1549, 'Video streaming', 'r-stream');
  expense(i, 14, 'visa', 'Subscriptions', 1099, 'Music streaming', 'r-music');
  // Not set up as bills: candidates for "possible recurring payments"
  expense(i, 17, 'visa', 'Subscriptions', 299, 'Cloud storage');
  if (i >= 18) expense(i, 6, 'visa', 'Subscriptions', 800, 'News subscription');
  if (i === 5 || i === 17) expense(i, 21, 'visa', 'Subscriptions', 9900, 'Photo app yearly plan');
  if (i >= 12) expense(i, 26, 'visa', 'Transport', 1800, 'Car wash');

  // Day-to-day spending
  const groceries = between(46000, 60000) + (i % 12 === 2 ? 9000 : 0);
  const shops = 4 + (i % 2);
  let left = groceries;
  for (let k = 0; k < shops; k++) {
    const amt = k === shops - 1 ? left : Math.round(groceries / shops + between(-1500, 1500));
    left -= amt;
    expense(i, 4 + k * 6, 'visa', 'Groceries', amt, k % 2 ? 'Corner market' : 'Grocery store');
  }
  for (let k = 0; k < 3; k++) expense(i, 7 + k * 9, 'visa', 'Transport', between(3800, 5200), 'Fuel');
  if (i === 13) expense(i, 18, 'visa', 'Transport', 85000, 'Car repair');
  const dining = between(17000, 30000) + (i >= 12 ? 3000 : 0);
  for (let k = 0; k < 5; k++) expense(i, 3 + k * 6, 'visa', 'Dining out', Math.round(dining / 5), 'Restaurant');
  for (let k = 0; k < 4; k++) expense(i, 2 + k * 7, 'wallet', 'Dining out', between(1400, 2600), 'Coffee');
  const shopping = between(14000, 36000) + (i % 12 === 1 ? 22000 : 0);
  expense(i, 13, 'visa', 'Shopping', Math.round(shopping * 0.6), 'Online order');
  expense(i, 24, 'visa', 'Shopping', shopping - Math.round(shopping * 0.6), 'Department store');
  expense(i, 16, 'visa', 'Personal care', between(4500, 8000), 'Haircut');
  if (rand() < 0.55) expense(i, 20, 'chk', 'Health', between(2500, 22000), 'Pharmacy');
  if (i === 8) expense(i, 10, 'visa', 'Travel', 110000, 'Summer trip');
  if (i === 20) expense(i, 10, 'visa', 'Travel', 145000, 'Summer trip');
  if (i === 14) expense(i, 22, 'visa', 'Travel', 38000, 'Holiday flights');
  if (i % 12 === 2) expense(i, 15, 'visa', 'Gifts', between(30000, 38000), 'Holiday gifts');
  if (i % 4 === 1) expense(i, 9, 'visa', 'Gifts', 5000, 'Birthday gift');
  // Recent imported rows not yet given a category
  if (i === 21) expense(i, 27, 'visa', null, 3850, 'POS 4471 PURCHASE');
  if (i === 22) expense(i, 27, 'visa', null, 6420, 'POS 9310 PURCHASE');
  if (i === 23) expense(i, 27, 'visa', null, 11280, 'ONLINE PMT 2208');

  // Transfers
  transfer(i, 6, 'chk', 'wallet', 10000, 'ATM withdrawal');
  transfer(i, 1, 'chk', 'efund', 30000, 'To emergency fund');
  transfer(i, 1, 'chk', 'travel', 20000, 'To travel fund');
  transfer(i, 1, 'chk', 'home', 50000, 'To home deposit');
  transfer(i, 1, 'chk', 'invest', 25000, 'To retirement');
  transfer(i, 20, 'chk', 'loan', 38500, 'Car loan payment', 'r-loan');
  if (i === 8) transfer(i, 12, 'travel', 'chk', 100000, 'From travel fund');
  if (i === 20) transfer(i, 12, 'travel', 'chk', 120000, 'From travel fund');
  if (i === 13) transfer(i, 19, 'efund', 'chk', 85000, 'From emergency fund');
}
// Visa purchases made in the final month stay owed at the period end.

// ---------- Views ----------
const sum = (rows) => rows.reduce((s, t) => s + t.amount, 0);
export const goalAccounts = new Set(goals.map((g) => g.account));

// monthly_cash_flow + month_summary
export const monthly = MONTHS.map(({ i }) => {
  const rows = tx.filter((t) => t.month === i);
  const income = sum(rows.filter((t) => t.kind === 'income'));
  const expenses = sum(rows.filter((t) => t.kind === 'expense'));
  const transfers = rows.filter((t) => t.kind === 'transfer');
  const toGoals = sum(transfers.filter((t) => goalAccounts.has(t.to) && !goalAccounts.has(t.from)));
  const fromGoals = sum(transfers.filter((t) => goalAccounts.has(t.from) && !goalAccounts.has(t.to)));
  const toDebt = sum(transfers.filter((t) => isLiability(acct[t.to])));
  const cardPay = sum(transfers.filter((t) => t.to === 'visa'));
  const loanPay = sum(transfers.filter((t) => t.to === 'loan'));
  const atm = sum(transfers.filter((t) => t.to === 'wallet'));
  const cardCharges = sum(rows.filter((t) => t.kind === 'expense' && t.from === 'visa'));
  return { i, income, expenses, net: income - expenses, transfers: sum(transfers), toGoals, fromGoals, toDebt, cardPay, loanPay, atm, cardCharges };
});

// account_month_flow closing balances
export const balances = {}; // id -> array of closing balance per month
for (const a of accounts) {
  let bal = a.opening;
  balances[a.id] = MONTHS.map(({ i }) => {
    for (const t of tx.filter((t) => t.month === i)) {
      if (t.to === a.id) bal += t.amount;
      if (t.from === a.id) bal -= t.amount;
    }
    return bal;
  });
}
export const openingBalance = (id) => acct[id].opening;
export const balanceAt = (id, i) => (i < 0 ? acct[id].opening : balances[id][i]);

// net_worth_by_month
export const netWorth = MONTHS.map(({ i }) => {
  let assets = 0, liabilities = 0;
  for (const a of accounts) (isLiability(a) ? (liabilities += balanceAt(a.id, i)) : (assets += balanceAt(a.id, i)));
  return { i, assets, liabilities, net: assets + liabilities };
});

// category_month_totals (expenses; null = uncategorized)
export const catMonth = (cat, i) => sum(tx.filter((t) => t.month === i && t.kind === 'expense' && t.category === cat));
export const expenseCategories = [...groups.Essentials, ...groups.Lifestyle];

// budgets: Oct 2025 onward
export const budgetPlan = {
  Rent: 165000, Groceries: 55000, Utilities: 16000, 'Phone & internet': 9500, Transport: 20000, Insurance: 11800, Health: 10000,
  'Dining out': 30000, Shopping: 25000, Subscriptions: 8000, 'Personal care': 7000, Travel: 15000, Gifts: 6000,
};

export const range = (a, b) => Array.from({ length: b - a + 1 }, (_, k) => a + k);
export const CUR = range(12, 23); // Oct 2025 – Sep 2026
export const PREV = range(0, 11); // Oct 2024 – Sep 2025
export const total = (key, months) => months.reduce((s, i) => s + monthly[i][key], 0);
