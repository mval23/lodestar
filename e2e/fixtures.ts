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

const thisMonth = `${new Date().toISOString().slice(0, 7)}-01`;
const today = new Date().toISOString().slice(0, 10);

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
  tables.monthly_cash_flow = [
    { user_id: USER_ID, month: thisMonth, money_in_minor: 250000, money_out_minor: 64550, net_minor: 185450 },
  ];
  tables.net_worth_by_month = [
    { user_id: USER_ID, month: thisMonth, assets_minor: 285450, liabilities_minor: -31000, net_worth_minor: 254450 },
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
  const now = Math.floor(Date.now() / 1000);
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

    if (table === 'profiles') return json(rows ?? {});
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
