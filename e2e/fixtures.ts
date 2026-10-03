import { test as base, expect, type Page } from '@playwright/test';

// A stand-in Supabase, intercepted at the network boundary. Every response
// shape here matches what PostgREST actually returns; the database's own
// behaviour — RLS, constraints, the RPCs — is covered by the pgTAP suite
// against a real Postgres, which is the only place it can be tested honestly.
//
// Synthetic data throughout. Real financial data never goes in a test.

export const SUPABASE_HOST = 'https://e2e-test.supabase.co';

export type Tables = {
  profiles: Record<string, unknown>;
  accounts: Record<string, unknown>[];
  account_balances: Record<string, unknown>[];
  categories: Record<string, unknown>[];
  category_groups: Record<string, unknown>[];
  category_usage: Record<string, unknown>[];
  transactions: Record<string, unknown>[];
  budget_progress: Record<string, unknown>[];
  goal_progress: Record<string, unknown>[];
  recurring_items: Record<string, unknown>[];
  monthly_cash_flow: Record<string, unknown>[];
  net_worth_by_month: Record<string, unknown>[];
  import_batches: Record<string, unknown>[];
  account_month_flow?: Record<string, unknown>[];
  account_ledger?: Record<string, unknown>[];
  month_summary?: Record<string, unknown>[];
};

export const USER_ID = '00000000-0000-4000-8000-00000000000a';
export const EMAIL = 'synthetic@example.test';

// The stub's today. E2E_TODAY (YYYY-MM-DD) pins it, as the README
// screenshots do, so a picture taken on the 2nd still reads like mid-month;
// the browser's clock has to be pinned to the same day (pinClock).
export const stubNow = process.env.E2E_TODAY ? new Date(`${process.env.E2E_TODAY}T12:00:00Z`) : new Date();
const thisMonth = `${stubNow.toISOString().slice(0, 7)}-01`;
const today = stubNow.toISOString().slice(0, 10);
// Reports count complete months, so the data needs one before this month.
const lastMonth = (() => {
  const d = new Date(Date.UTC(stubNow.getUTCFullYear(), stubNow.getUTCMonth() - 1, 1));
  return d.toISOString().slice(0, 10);
})();

// Sets the page's clock to the stub's today when it is pinned.
export async function pinClock(page: Page) {
  if (process.env.E2E_TODAY) await page.clock.setFixedTime(stubNow);
}

export function emptyTables(): Tables {
  return {
    profiles: {
      id: USER_ID,
      display_name: 'Synthetic person',
      currency: 'USD',
      timezone: 'UTC',
      week_start: 1,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
    accounts: [],
    account_balances: [],
    categories: [],
    category_groups: [],
    category_usage: [],
    transactions: [],
    budget_progress: [],
    goal_progress: [],
    recurring_items: [],
    monthly_cash_flow: [],
    net_worth_by_month: [],
    import_batches: [],
  };
}

export function withData(): Tables {
  const tables = emptyTables();
  tables.accounts = [
    { id: 'acc-chk', user_id: USER_ID, name: 'Everyday checking', type: 'checking', opening_balance_minor: 100000, opening_date: null, sort_order: 0, archived_at: null, source_ref: null, created_at: '', updated_at: '' },
    { id: 'acc-card', user_id: USER_ID, name: 'Blue card', type: 'credit_card', opening_balance_minor: -20000, opening_date: null, sort_order: 1, archived_at: null, source_ref: null, created_at: '', updated_at: '' },
  ];
  tables.account_balances = [
    { user_id: USER_ID, account_id: 'acc-chk', name: 'Everyday checking', type: 'checking', is_liability: false, sort_order: 0, archived_at: null, opening_balance_minor: 100000, money_in_minor: 250000, money_out_minor: 64550, balance_minor: 285450 },
    { user_id: USER_ID, account_id: 'acc-card', name: 'Blue card', type: 'credit_card', is_liability: true, sort_order: 1, archived_at: null, opening_balance_minor: -20000, money_in_minor: 10000, money_out_minor: 21000, balance_minor: -31000 },
  ];
  tables.category_groups = [{ id: 'grp-1', user_id: USER_ID, name: 'Essentials', sort_order: 0, created_at: '', updated_at: '' }];
  tables.categories = [
    { id: 'cat-groceries', user_id: USER_ID, group_id: 'grp-1', name: 'Groceries', kind: 'expense', sort_order: 0, archived_at: null, source_ref: null, created_at: '', updated_at: '' },
    { id: 'cat-salary', user_id: USER_ID, group_id: null, name: 'Salary', kind: 'income', sort_order: 1, archived_at: null, source_ref: null, created_at: '', updated_at: '' },
  ];
  tables.category_usage = [
    { user_id: USER_ID, category_id: 'cat-groceries', kind: 'expense', last_used_at: '2026-09-01T00:00:00Z', use_count: 3 },
    { user_id: USER_ID, category_id: 'cat-salary', kind: 'income', last_used_at: null, use_count: 0 },
  ];
  tables.transactions = [
    { id: 'txn-1', user_id: USER_ID, kind: 'expense', occurred_on: today, amount_minor: 4550, from_account_id: 'acc-chk', to_account_id: null, category_id: 'cat-groceries', category_kind: 'expense', description: 'Market', notes: null, recurring_item_id: null, import_batch_id: null, source_ref: null, created_at: '', updated_at: '' },
    { id: 'txn-2', user_id: USER_ID, kind: 'income', occurred_on: today, amount_minor: 250000, from_account_id: null, to_account_id: 'acc-chk', category_id: 'cat-salary', category_kind: 'income', description: 'Pay', notes: null, recurring_item_id: null, import_batch_id: null, source_ref: null, created_at: '', updated_at: '' },
  ];
  tables.budget_progress = [
    { user_id: USER_ID, budget_id: 'bud-1', category_id: 'cat-groceries', category_name: 'Groceries', group_id: 'grp-1', month: thisMonth, planned_minor: 20000, spent_minor: 25550, left_minor: -5550 },
  ];
  tables.goal_progress = [
    { user_id: USER_ID, goal_id: 'goal-1', account_id: 'acc-chk', name: 'Rainy day fund', target_minor: 100000, target_date: null, monthly_plan_minor: 25000, sort_order: 0, achieved_at: null, archived_at: null, balance_minor: 50000, remaining_minor: 50000, this_month: thisMonth, this_month_contributed_minor: 10000 },
  ];
  tables.recurring_items = [
    { id: 'bill-1', user_id: USER_ID, name: 'Rent', label: 'bill', kind: 'expense', amount_minor: 120000, amount_is_variable: false, from_account_id: 'acc-chk', to_account_id: null, category_id: null, category_kind: 'expense', cadence_unit: 'month', cadence_interval: 1, anchor_on: today, next_due_on: today, ends_on: null, archived_at: null, created_at: '', updated_at: '' },
  ];
  tables.month_summary = [
    { user_id: USER_ID, month: thisMonth, income_minor: 688200, income_count: 4, expense_minor: 443670, expense_count: 12, transfer_minor: 70000, transfer_count: 1, to_goals_minor: 70000, net_minor: 244530 },
  ];
  // Newest first, as the Overview asks for them; the stub doesn't sort.
  tables.monthly_cash_flow = [
    { user_id: USER_ID, month: thisMonth, money_in_minor: 250000, money_out_minor: 64550, net_minor: 185450 },
    { user_id: USER_ID, month: lastMonth, money_in_minor: 250000, money_out_minor: 181200, net_minor: 68800 },
  ];
  tables.net_worth_by_month = [
    { user_id: USER_ID, month: thisMonth, assets_minor: 285450, liabilities_minor: -31000, net_worth_minor: 254450 },
    { user_id: USER_ID, month: lastMonth, assets_minor: 216650, liabilities_minor: -31000, net_worth_minor: 185650 },
  ];
  return tables;
}

// An account with a page of its own: detail pages only open real uuids.
export const LEDGER_ACCOUNT = '0a000000-0000-4000-8000-000000000001';

export function withLedger(): Tables {
  const tables = withData();
  tables.account_balances = [{ ...tables.account_balances[0], account_id: LEDGER_ACCOUNT, name: 'Everyday checking' }];
  tables.account_month_flow = [];
  const row = (n: number, day: string, description: string, amount: number, balance: number) => ({
    user_id: USER_ID,
    transaction_id: `0b000000-0000-4000-8000-00000000000${n}`,
    account_id: LEDGER_ACCOUNT,
    kind: 'expense',
    occurred_on: `${thisMonth.slice(0, 8)}${day}`,
    signed_amount_minor: -amount,
    description,
    category_id: 'cat-groceries',
    from_account_id: LEDGER_ACCOUNT,
    to_account_id: null,
    balance_after_minor: balance,
    created_at: '',
  });
  tables.account_ledger = [
    row(1, '12', 'Utilities', 17900, 383900),
    row(2, '11', 'Sparkling water', 400, 401800),
    row(3, '10', 'Phone bill', 4400, 402200),
  ];
  return tables;
}

function jwt(payload: object): string {
  const encode = (value: object) =>
    Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode(payload)}.synthetic-signature`;
}

// One signed-in session: it seeds storage, and it is what a successful
// sign-in at /auth/v1/token hands back.
function session() {
  // From the stub's today, so a pinned browser clock doesn't find it expired.
  const now = Math.floor(Math.max(Date.now(), stubNow.getTime()) / 1000);
  const expiresAt = now + 3600;
  return {
    // amr is how the real thing records an authentication, and what the
    // delete-account function reads to insist a password was proved just now.
    access_token: jwt({
      sub: USER_ID,
      iat: now,
      exp: expiresAt,
      role: 'authenticated',
      aud: 'authenticated',
      email: EMAIL,
      amr: [{ method: 'password', timestamp: now }],
    }),
    refresh_token: 'synthetic-refresh',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: expiresAt,
    user: {
      id: USER_ID,
      email: EMAIL,
      aud: 'authenticated',
      role: 'authenticated',
      app_metadata: {},
      user_metadata: {},
      created_at: '2026-01-01T00:00:00Z',
    },
  };
}

export async function signIn(page: Page) {
  // The key supabase-js derives from the project host.
  await page.addInitScript(
    ([key, value]) => window.localStorage.setItem(key as string, value as string),
    ['sb-e2e-test-auth-token', JSON.stringify(session())],
  );
}

type Options = {
  tables?: Tables;
  onWrite?: (table: string, body: unknown) => void;
  // Set it, and a sign-in with this password succeeds: what
  // re-authentication before an export or a deletion needs.
  password?: string;
};

// The Overview's two RPCs, answered from the stub's own tables in the shape
// Postgres returns. The real arithmetic is tested against Postgres in the
// schema check; here the figures only need to be consistent with the rows.
const dayOfMonth = Number(today.slice(8, 10));
const daysInMonth = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 0)).getUTCDate();

// A bill's due dates this month, walked from its anchor by its cadence, as
// recurrence_next does (month-end dates clamp).
function dueDatesThisMonth(item: Record<string, unknown>): string[] {
  const anchor = String(item.anchor_on);
  const [ay, am, ad] = anchor.split('-').map(Number) as [number, number, number];
  const step = Number(item.cadence_interval ?? 1);
  const out: string[] = [];
  for (let k = 0; k < 600; k++) {
    let due: string;
    if (item.cadence_unit === 'week') {
      due = new Date(Date.UTC(ay, am - 1, ad + 7 * step * k)).toISOString().slice(0, 10);
    } else {
      const months = (item.cadence_unit === 'year' ? 12 : 1) * step * k;
      const last = new Date(Date.UTC(ay, am - 1 + months + 1, 0)).getUTCDate();
      due = new Date(Date.UTC(ay, am - 1 + months, Math.min(ad, last))).toISOString().slice(0, 10);
    }
    if (due.slice(0, 7) > thisMonth.slice(0, 7)) break;
    if (due.slice(0, 7) === thisMonth.slice(0, 7)) out.push(due);
  }
  return out;
}

function budgetPaceOf(tables: Tables) {
  const bills = tables.recurring_items.filter((r) => r.kind === 'expense' && r.category_id && !r.archived_at);
  return tables.budget_progress
    .filter((row) => row.month === thisMonth)
    .map((row) => {
      const planned = Number(row.planned_minor), spent = Number(row.spent_minor);
      let billsMonth = 0, billsDue = 0;
      for (const bill of bills.filter((b) => b.category_id === row.category_id)) {
        for (const due of dueDatesThisMonth(bill)) {
          billsMonth += Number(bill.amount_minor);
          if (due <= today) billsDue += Number(bill.amount_minor);
        }
      }
      const pace = Math.min(planned, billsDue + Math.round((Math.max(planned - billsMonth, 0) * dayOfMonth) / daysInMonth));
      const daysLeft = daysInMonth - dayOfMonth;
      return {
        ...row,
        bills_month_minor: billsMonth,
        bills_due_minor: billsDue,
        pace_minor: pace,
        gap_minor: spent - pace,
        days_left: daysLeft,
        per_day_minor: daysLeft > 0 ? Math.floor(Math.max(planned - spent, 0) / daysLeft) : null,
        status: spent > planned ? 'over' : spent > pace ? 'ahead' : 'on_pace',
      };
    });
}

function monthToDateOf(tables: Tables) {
  const flowOf = (month: string) => tables.monthly_cash_flow.find((row) => row.month === month);
  const now = flowOf(thisMonth);
  const before = flowOf(lastMonth);
  const goals = (tables.month_summary ?? []).find((row) => row.month === thisMonth);
  return [
    {
      month: thisMonth,
      today,
      day_of_month: dayOfMonth,
      days_in_month: daysInMonth,
      money_in_minor: Number(now?.money_in_minor ?? 0),
      money_out_minor: Number(now?.money_out_minor ?? 0),
      to_goals_minor: Number(goals?.to_goals_minor ?? 0),
      typical_in_minor: Number(before?.money_in_minor ?? 0),
      typical_out_minor: Number(before?.money_out_minor ?? 0),
      typical_to_goals_minor: 0,
      typical_months: before ? 1 : 0,
    },
  ];
}

// The Reports functions, answered from monthly_cash_flow and
// net_worth_by_month. Transfers aren't in the stub's tables, so their
// buckets are zero unless a month row carries to_goals_minor (the README's
// data does); the real split is tested against Postgres.
function monthsFrom(from: string, to: string): string[] {
  const out: string[] = [];
  for (let m = from; m < to; ) {
    out.push(m);
    const d = new Date(`${m}T00:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() + 1);
    m = d.toISOString().slice(0, 10);
  }
  return out;
}

function reportCashFlowOf(tables: Tables, from: string, to: string) {
  return monthsFrom(from, to).map((month) => {
    const row = tables.monthly_cash_flow.find((r) => r.month === month);
    const moneyIn = Number(row?.money_in_minor ?? 0), moneyOut = Number(row?.money_out_minor ?? 0);
    return {
      month, money_in_minor: moneyIn, money_out_minor: moneyOut, net_minor: moneyIn - moneyOut,
      to_goals_minor: Number(row?.to_goals_minor ?? 0), from_goals_minor: 0, moved_in_minor: 0, moved_out_minor: 0, active: Boolean(row),
    };
  });
}

function totalsOf(tables: Tables, period: string, from: string, to: string) {
  const rows = reportCashFlowOf(tables, from, to);
  const moneyIn = rows.reduce((s, r) => s + r.money_in_minor, 0), moneyOut = rows.reduce((s, r) => s + r.money_out_minor, 0);
  return {
    period, period_from: from, period_to: to, money_in_minor: moneyIn, money_out_minor: moneyOut, net_minor: moneyIn - moneyOut,
    to_goals_minor: rows.reduce((s, r) => s + r.to_goals_minor, 0), from_goals_minor: 0, card_payments_minor: 0, loan_payments_minor: 0, cash_withdrawals_minor: 0,
    other_transfers_minor: 0, transfers_minor: rows.reduce((s, r) => s + r.to_goals_minor, 0), months: rows.length, active_months: rows.filter((r) => r.active).length,
  };
}

function reportSummaryOf(tables: Tables, from: string, to: string, compareFrom: string) {
  const length = monthsFrom(from, to).length;
  const compareTo = monthsFrom(compareFrom, '9999-01-01').slice(0, length + 1)[length] ?? compareFrom;
  return [totalsOf(tables, 'current', from, to), totalsOf(tables, 'compare', compareFrom, compareTo)];
}

function netWorthByAccountOf(tables: Tables) {
  return tables.account_balances.map((a) => ({
    account_id: a.account_id, name: a.name, type: a.type, is_liability: a.is_liability,
    include_in_net_worth: a.include_in_net_worth ?? true, archived_at: a.archived_at ?? null,
    start_minor: Number(a.balance_minor), end_minor: Number(a.balance_minor), change_minor: 0,
  }));
}

function netWorthChangeOf(tables: Tables, from: string, to: string) {
  const at = (month: string) => Number(tables.net_worth_by_month.find((r) => r.month === month)?.net_worth_minor ?? 0);
  const months = monthsFrom(from, to);
  const startMonth = monthsFrom('1970-01-01', from).at(-1) ?? from;
  const start = at(startMonth), end = at(months.at(-1) ?? from);
  return [{ start_minor: start, end_minor: end, change_minor: end - start, cash_flow_minor: end - start, openings_minor: 0, moved_minor: 0 }];
}

// The Month and Category functions, from the stub's transactions. There is
// no history before this month here, so nothing is typical; the averages are
// tested against Postgres.
function expensesIn(tables: Tables, month: string) {
  return tables.transactions.filter((t) => t.kind === 'expense' && String(t.occurred_on).slice(0, 7) === month.slice(0, 7));
}

function dailySpendingOf(tables: Tables, month: string) {
  const days = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
  const spent = expensesIn(tables, month);
  let running = 0;
  return Array.from({ length: days }, (_, i) => {
    const day = `${month.slice(0, 8)}${String(i + 1).padStart(2, '0')}`;
    const today_ = spent.filter((t) => t.occurred_on === day).reduce((s, t) => s + Number(t.amount_minor), 0);
    running += today_;
    return {
      day, day_of_month: i + 1, spent_minor: today_, running_minor: running, typical_running_minor: 0,
      typical_months: 0, after_today: day > today,
    };
  });
}

function monthCategoriesOf(tables: Tables, month: string) {
  const by = new Map<string | null, number>();
  for (const t of expensesIn(tables, month)) {
    const id = (t.category_id as string | null) ?? null;
    by.set(id, (by.get(id) ?? 0) + Number(t.amount_minor));
  }
  return [...by].map(([category_id, spent]) => ({ category_id, spent_minor: spent, typical_minor: 0, typical_months: 0 }));
}

function categoryStatsOf(tables: Tables, id: string) {
  const mine = tables.transactions.filter((t) => t.category_id === id && String(t.occurred_on).slice(0, 7) === thisMonth.slice(0, 7));
  return [{
    this_month_minor: mine.reduce((s, t) => s + Number(t.amount_minor), 0), plan_minor: null, typical_minor: null,
    low_minor: null, high_minor: null, months: 0, last3_minor: 0, prev3_minor: 0, total_minor: 0, kind_total_minor: 0,
    rank: null, ranked: 0, planned_months: 0, over_plan_months: 0,
  }];
}

// The Phase 5 report functions, from the stub's transactions and plans.
function expensesBetween(tables: Tables, from: string, to: string) {
  return tables.transactions.filter((t) => t.kind === 'expense' && String(t.occurred_on) >= from && String(t.occurred_on) < to);
}

function categoryMonthsOf(tables: Tables, from: string, to: string) {
  const by = new Map<string, { category_id: string | null; month: string; total_minor: number }>();
  for (const t of expensesBetween(tables, from, to)) {
    const month = `${String(t.occurred_on).slice(0, 7)}-01`;
    const key = `${t.category_id}|${month}`;
    const row = by.get(key) ?? { category_id: (t.category_id as string | null) ?? null, month, total_minor: 0 };
    row.total_minor += Number(t.amount_minor);
    by.set(key, row);
  }
  return [...by.values()];
}

function categoryTotalsOf(tables: Tables, from: string, to: string) {
  const by = new Map<string | null, { category_id: string | null; total_minor: number; txn_count: number; compare_minor: number }>();
  for (const t of expensesBetween(tables, from, to)) {
    const id = (t.category_id as string | null) ?? null;
    const row = by.get(id) ?? { category_id: id, total_minor: 0, txn_count: 0, compare_minor: 0 };
    row.total_minor += Number(t.amount_minor);
    row.txn_count += 1;
    by.set(id, row);
  }
  return [...by.values()].sort((a, b) => b.total_minor - a.total_minor);
}

function budgetResultsOf(tables: Tables, from: string, to: string) {
  return tables.budget_progress
    .filter((b) => String(b.month) >= from && String(b.month) < to)
    .map((b) => ({
      category_id: b.category_id, month: b.month, planned_minor: b.planned_minor, spent_minor: b.spent_minor,
      within_plan: Number(b.spent_minor) <= Number(b.planned_minor),
    }));
}

function budgetSummaryOf(tables: Tables, month: string) {
  const rows = budgetResultsOf(tables, month, '9999-12-31').filter((r) => r.month === month);
  const within = rows.filter((r) => r.within_plan).length;
  return [{
    planned_minor: rows.reduce((s, r) => s + Number(r.planned_minor), 0),
    spent_planned_minor: rows.reduce((s, r) => s + Number(r.spent_minor), 0),
    unplanned_minor: 0, uncategorized_minor: 0, lines: rows.length, within,
    history_lines: rows.length, history_within: within, first_month: rows.length ? month : null,
  }];
}

// The safety reports, from the stub's bills, accounts and transactions.
function recurringCostsOf(tables: Tables) {
  const items = tables.recurring_items.filter((r) => r.kind === 'expense' && !r.archived_at);
  const yearly = (r: Record<string, unknown>) =>
    Math.round((Number(r.amount_minor) * (r.cadence_unit === 'week' ? 52 : r.cadence_unit === 'month' ? 12 : 1)) / Number(r.cadence_interval ?? 1));
  const total = items.reduce((s, r) => s + yearly(r), 0);
  const subs = items.filter((r) => r.label === 'subscription').reduce((s, r) => s + yearly(r), 0);
  return items.map((r) => ({
    recurring_item_id: r.id, yearly_minor: yearly(r), paid_12m_minor: 0, payments_12m: 0, last_paid_on: null,
    total_yearly_minor: total, total_monthly_minor: Math.round(total / 12), subscriptions_yearly_minor: subs, items: items.length,
  })).sort((a, b) => b.yearly_minor - a.yearly_minor);
}

function fixedFlexibleOf(tables: Tables, from: string, to: string) {
  const months = monthsFrom(from, to);
  const rows = months.map((month) => {
    const out = tables.monthly_cash_flow.find((r) => r.month === month);
    const total = Number(out?.money_out_minor ?? 0);
    return { month, fixed_minor: 0, flexible_minor: total, total_minor: total };
  });
  const all = rows.reduce((s, r) => s + r.total_minor, 0);
  return rows.map((r) => ({ ...r, fixed_total_minor: 0, all_total_minor: all }));
}

function cashRunwayOf(tables: Tables) {
  const cash = tables.account_balances.filter((a) => ['checking', 'cash', 'credit_card'].includes(String(a.type)));
  const available = cash.reduce((s, a) => s + Number(a.balance_minor), 0);
  const spending = 455000;
  const months = (n: number) => Math.round((n / spending) * 10) / 10;
  return [
    ...cash.map((a) => ({ line: 'account', account_id: a.account_id, name: a.name, amount_minor: a.balance_minor, months: null, n: null })),
    { line: 'available', account_id: null, name: null, amount_minor: available, months: months(available), n: null },
    { line: 'goals', account_id: null, name: null, amount_minor: 0, months: 0, n: null },
    { line: 'spending', account_id: null, name: null, amount_minor: spending, months: null, n: 6 },
    { line: 'loan_payments', account_id: null, name: null, amount_minor: 0, months: null, n: 6 },
    { line: 'runway', account_id: null, name: null, amount_minor: available, months: months(available), n: null },
    { line: 'runway_loans', account_id: null, name: null, amount_minor: available, months: months(available), n: null },
  ];
}

function debtSummaryOf(tables: Tables) {
  const debts = tables.account_balances.filter((a) => a.is_liability);
  const total = debts.reduce((s, a) => s + Number(a.balance_minor), 0);
  return debts.map((a) => ({
    account_id: a.account_id, name: a.name, type: a.type, start_minor: a.balance_minor, end_minor: a.balance_minor,
    balance_minor: a.balance_minor, paid_minor: 0, purchases_minor: 0, months_with_purchases: 0, months_paid_full: 0,
    recent_payment_minor: 0, payments_left: null, payoff_month: null, total_start_minor: total, total_end_minor: total, total_paid_minor: 0,
  }));
}

// The Account and Bill dashboards and Coming up, from the stub's bills,
// accounts and transactions. Each bill comes round once in the window.
const dayDiff = (a: string, b: string) => Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86400000);

function upcomingOf(tables: Tables, days: number) {
  const rows = tables.recurring_items
    .filter((r) => !r.archived_at && dayDiff(String(r.next_due_on), today) < days)
    .map((r) => {
      const ahead = dayDiff(String(r.next_due_on), today);
      return {
        recurring_item_id: r.id, name: r.name, label: r.label, kind: r.kind, due_on: r.next_due_on, amount_minor: Number(r.amount_minor),
        amount_is_variable: r.amount_is_variable, overdue: ahead < 0, week: ahead < 0 ? 0 : Math.min(Math.floor(ahead / 7), 3),
      };
    })
    .sort((a, b) => a.week - b.week || String(a.due_on).localeCompare(String(b.due_on)));
  const sum = (list: typeof rows, kind: string) => list.filter((r) => r.kind === kind).reduce((s, r) => s + r.amount_minor, 0);
  return rows.map((r) => {
    const week = rows.filter((x) => x.week === r.week);
    return { ...r, week_bills_minor: sum(week, 'expense'), week_in_minor: sum(week, 'income'), bills_minor: sum(rows, 'expense'), in_minor: sum(rows, 'income') };
  });
}

function outflowsOf(tables: Tables, accountId: string, from: string, to: string) {
  const outs = tables.transactions.filter(
    (t) => t.from_account_id === accountId && t.kind !== 'income' && String(t.occurred_on) >= from && String(t.occurred_on) < to,
  );
  const lines = new Map<string, { line: string; category_id: unknown; to_account_id: unknown; account_type: unknown; name: unknown; out_minor: number; txn_count: number }>();
  for (const t of outs) {
    const transfer = t.kind === 'transfer';
    const account = tables.account_balances.find((a) => a.account_id === t.to_account_id);
    const key = transfer ? `a-${String(t.to_account_id)}` : `c-${String(t.category_id)}`;
    const line = lines.get(key) ?? {
      line: transfer ? 'account' : 'category',
      category_id: transfer ? null : t.category_id,
      to_account_id: transfer ? t.to_account_id : null,
      account_type: transfer ? (account?.type ?? null) : null,
      name: transfer ? (account?.name ?? 'Another account') : (tables.categories.find((c) => c.id === t.category_id)?.name ?? 'No category'),
      out_minor: 0,
      txn_count: 0,
    };
    line.out_minor += Number(t.amount_minor);
    line.txn_count += 1;
    lines.set(key, line);
  }
  const all = [...lines.values()].sort((a, b) => b.out_minor - a.out_minor);
  const total = all.reduce((s, l) => s + l.out_minor, 0);
  return all.map((l) => ({ ...l, total_out_minor: total }));
}

function accountSummaryOf(tables: Tables, accountId: string) {
  const a = tables.account_balances.find((x) => x.account_id === accountId);
  if (!a) return [];
  const monthEnd = new Date(Date.UTC(stubNow.getUTCFullYear(), stubNow.getUTCMonth(), 0)).toISOString().slice(0, 10);
  const yearAgo = new Date(Date.UTC(stubNow.getUTCFullYear(), stubNow.getUTCMonth() - 11, 0)).toISOString().slice(0, 10);
  const balance = Number(a.balance_minor);
  return [{
    months: 3, income_minor: 0, expense_minor: 0, transfer_in_minor: 0, transfer_out_minor: 0, in_minor: 0, out_minor: 0,
    avg_in_minor: 0, avg_out_minor: 0, avg_income_minor: 0, avg_expense_minor: 0, avg_transfer_in_minor: 0, avg_transfer_out_minor: 0,
    balance_minor: balance, month_end_on: monthEnd, since_month_end_minor: 0, year_ago_on: yearAgo, since_year_ago_minor: 0,
    lowest_minor: balance, lowest_on: today, payments_left: null,
  }];
}

function billHistoryOf(tables: Tables, itemId: string, months: number) {
  const item = tables.recurring_items.find((r) => r.id === itemId);
  if (!item) return [];
  const end = new Date(Date.UTC(stubNow.getUTCFullYear(), stubNow.getUTCMonth() + 1, 1)).toISOString().slice(0, 10);
  const start = new Date(Date.UTC(stubNow.getUTCFullYear(), stubNow.getUTCMonth() - months + 1, 1)).toISOString().slice(0, 10);
  const anchorMonth = `${String(item.anchor_on).slice(0, 7)}-01`;
  return monthsFrom(start, end).map((month) => {
    const paid = tables.transactions.filter((t) => t.recurring_item_id === itemId && String(t.occurred_on).startsWith(month.slice(0, 7)));
    const amount = paid.reduce((s, t) => s + Number(t.amount_minor), 0);
    const due = month >= anchorMonth ? 1 : 0;
    return {
      month, due_count: due, paid_minor: amount, payment_count: paid.length, last_minor: paid.length ? Number(paid[paid.length - 1]!.amount_minor) : null,
      from_minor: null, change_minor: null, status: paid.length ? 'paid' : due ? 'upcoming' : 'none', months_due: 0, months_paid: 0, typical_month_minor: null,
    };
  });
}

export async function stubSupabase(page: Page, options: Options = {}) {
  const tables = options.tables ?? emptyTables();

  await page.route(`${SUPABASE_HOST}/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const json = (body: unknown, status = 200) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

    if (url.pathname.startsWith('/auth/v1')) {
      if (url.pathname.endsWith('/token')) {
        const body = request.postDataJSON?.() as { password?: string } | undefined;
        if (options.password !== undefined && body?.password === options.password) return json(session());
        // The shape GoTrue actually returns, so the app's mapping from
        // error_code to plain words is exercised rather than bypassed.
        return json({ code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' }, 400);
      }
      return json({});
    }

    // Edge Functions. delete-account is the only one there is.
    if (url.pathname.startsWith('/functions/v1/')) {
      const name = url.pathname.replace('/functions/v1/', '');
      options.onWrite?.(`function:${name}`, request.postDataJSON?.());
      return json({ ok: true });
    }

    if (url.pathname.startsWith('/rest/v1/rpc/')) {
      const name = url.pathname.split('/').pop();
      options.onWrite?.(`rpc:${name}`, request.postDataJSON?.());
      if (name === 'import_transactions') return json([{ batch_id: 'batch-1', inserted_count: 3, duplicate_count: 1 }]);
      if (name === 'copy_budgets') return json(2);
      if (name === 'mark_bill_paid') return json([{ transaction_id: 'txn-new', next_due_on: today }]);
      if (name === 'merge_categories') return json(1);
      if (name === 'budget_pace') return json(budgetPaceOf(tables));
      if (name === 'month_to_date') return json(monthToDateOf(tables));
      const args = (request.postDataJSON?.() ?? {}) as Record<string, string>;
      if (name === 'report_cash_flow') return json(reportCashFlowOf(tables, args.p_from!, args.p_to!));
      if (name === 'report_summary') return json(reportSummaryOf(tables, args.p_from!, args.p_to!, args.p_compare_from!));
      if (name === 'net_worth_by_account') return json(netWorthByAccountOf(tables));
      if (name === 'net_worth_change') return json(netWorthChangeOf(tables, args.p_from!, args.p_to!));
      if (name === 'daily_spending') return json(dailySpendingOf(tables, args.p_month!));
      if (name === 'month_categories') return json(monthCategoriesOf(tables, args.p_month!));
      if (name === 'category_stats') return json(categoryStatsOf(tables, args.p_category_id!));
      if (name === 'report_category_months') return json(categoryMonthsOf(tables, args.p_from!, args.p_to!));
      if (name === 'report_category_totals') return json(categoryTotalsOf(tables, args.p_from!, args.p_to!));
      if (name === 'budget_month_results') return json(budgetResultsOf(tables, args.p_from!, args.p_to!));
      if (name === 'budget_month_summary') return json(budgetSummaryOf(tables, args.p_month!));
      if (name === 'recurring_costs') return json(recurringCostsOf(tables));
      if (name === 'report_fixed_flexible') return json(fixedFlexibleOf(tables, args.p_from!, args.p_to!));
      if (name === 'possible_recurring') return json([]);
      if (name === 'cash_runway') return json(cashRunwayOf(tables));
      if (name === 'debt_summary') return json(debtSummaryOf(tables));
      if (name === 'upcoming_items') return json(upcomingOf(tables, Number(args.p_days ?? 30)));
      if (name === 'account_outflows') return json(outflowsOf(tables, args.p_account_id!, args.p_from!, args.p_to!));
      if (name === 'account_summary') return json(accountSummaryOf(tables, args.p_account_id!));
      if (name === 'recurring_item_history') return json(billHistoryOf(tables, args.p_item_id!, Number(args.p_months ?? 24)));
      return json(null);
    }

    const table = url.pathname.replace('/rest/v1/', '') as keyof Tables;
    const rows = tables[table];

    // HEAD is how PostgREST is asked for a count, so it reads, not writes.
    if (method !== 'GET' && method !== 'HEAD') {
      options.onWrite?.(table, request.postDataJSON?.());
      const body = request.postDataJSON?.();
      const row = Array.isArray(body) ? body[0] : body;
      return json([{ id: 'new-row', user_id: USER_ID, ...(row ?? {}) }]);
    }

    // PostgREST answers with one object only when asked for one (.single());
    // otherwise even the one profile comes back as a list, as the export reads it.
    if (table === 'profiles') {
      const single = (request.headers()['accept'] ?? '').includes('vnd.pgrst.object');
      return json(single ? (rows ?? {}) : [rows]);
    }
    const list = Array.isArray(rows) ? rows : [];
    // PostgREST answers a HEAD count request with a Content-Range header.
    // The stub is on another origin, as the real project is, so the header
    // has to be exposed or the browser hides it and every count reads zero.
    const range = (to: number) => ({
      'content-range': `0-${to}/${list.length}`,
      'access-control-expose-headers': 'content-range',
    });
    if (request.method() === 'HEAD') {
      return route.fulfill({ status: 200, headers: range(0), body: '' });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: range(Math.max(0, list.length - 1)),
      body: JSON.stringify(list),
    });
  });
}

export const test = base;

export { expect };
