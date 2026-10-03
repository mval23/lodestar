// Lodestar schema smoke check. Runs without Docker, psql or the Supabase CLI.
//
//   npm run schema:check
//
// Uses PGlite (Postgres 17 compiled to WebAssembly) in memory. The harness
// stubs what Supabase provides (roles, auth schema, auth.users, auth.uid(),
// the extensions schema and Supabase's default grants), applies the migration
// file unchanged, runs the RLS gate and a set of smoke tests, prints a
// summary and exits non-zero on any failure.
//
// Synthetic data only. This is a smoke check; the formal pgTAP suite is Phase 4.

import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(here, '..', 'migrations');
const gateSql = await readFile(path.join(here, '..', 'checks', 'rls_gate.sql'), 'utf8');

const db = new PGlite({ extensions: { pg_trgm } });

// ---------------------------------------------------------------------------
// Supabase stubs (harness only; never part of the migration)
// ---------------------------------------------------------------------------
const SUPABASE_STUB = `
  create role anon          nologin noinherit;
  create role authenticated nologin noinherit;
  create role service_role  nologin noinherit bypassrls;

  create schema auth;
  create schema extensions;
  grant usage on schema public, auth, extensions to anon, authenticated, service_role;

  create table auth.users (
    id                 uuid primary key,
    email              text,
    raw_user_meta_data jsonb not null default '{}'::jsonb,
    created_at         timestamptz not null default now()
  );

  -- Same shape as Supabase's auth.uid().
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(coalesce(current_setting('request.jwt.claim.sub', true),
                           (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')), '')::uuid
  $$;
  grant execute on function auth.uid() to anon, authenticated, service_role;

  -- In PGlite the session user is a superuser. On Supabase, migrations run as
  -- "postgres", which is not a superuser: it owns what it creates and bypasses
  -- RLS only as the table owner. To keep SECURITY DEFINER and ownership
  -- behavior honest, the migration is applied as this non-superuser role.
  create role migration_owner nologin noinherit;
  grant usage, create on schema public, extensions to migration_owner;
  -- On Supabase, supautils lets "postgres" create allow-listed extensions.
  -- PGlite cannot grant CREATE on its own database, so the stub creates
  -- pg_trgm up front and the migration's "create extension if not exists"
  -- is a no-op here.
  create extension if not exists pg_trgm with schema extensions;
  grant usage on schema auth to migration_owner;
  grant references, trigger, select on auth.users to migration_owner;
  grant execute on function auth.uid() to migration_owner;

  -- Supabase grants everything in public to these roles by default. The
  -- migration must undo that explicitly, so the stub reproduces it.
  alter default privileges for role migration_owner in schema public grant all on tables    to anon, authenticated, service_role;
  alter default privileges for role migration_owner in schema public grant all on functions to anon, authenticated, service_role;
  alter default privileges for role migration_owner in schema public grant all on sequences to anon, authenticated, service_role;
`;

// ---------------------------------------------------------------------------
// Tiny test framework
// ---------------------------------------------------------------------------
const results = [];
let currentGroup = '';

function group(name) {
  currentGroup = name;
  console.log(`\n${name}`);
}

async function test(name, fn) {
  try {
    await fn();
    results.push({ group: currentGroup, name, ok: true });
    console.log(`  PASS  ${name}`);
  } catch (err) {
    results.push({ group: currentGroup, name, ok: false, error: err.message });
    console.log(`  FAIL  ${name}\n        ${String(err.message).split('\n').join('\n        ')}`);
  } finally {
    // Leave a clean session for the next test.
    try { await db.exec('rollback'); } catch { /* not in a transaction */ }
    try { await db.exec('reset role'); } catch { /* ignore */ }
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function eq(actual, expected, msg) {
  const a = typeof actual === 'bigint' ? Number(actual) : actual;
  const e = typeof expected === 'bigint' ? Number(expected) : expected;
  if (JSON.stringify(a) !== JSON.stringify(e)) {
    throw new Error(`${msg}: expected ${JSON.stringify(e)}, got ${JSON.stringify(a)}`);
  }
}

async function expectError(promise, pattern, msg) {
  try {
    await promise;
  } catch (err) {
    if (pattern && !pattern.test(err.message)) {
      throw new Error(`${msg}: wrong error "${err.message}" (expected ${pattern})`);
    }
    return err;
  }
  throw new Error(`${msg}: expected an error, but the statement succeeded`);
}

// ---------------------------------------------------------------------------
// Session helpers
// ---------------------------------------------------------------------------
const sql = (q, params = []) => db.query(q, params); // as postgres (migration role)

async function asUser(uid, q, params = []) {
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [uid ?? '']);
  await db.exec(uid ? 'set role authenticated' : 'set role anon');
  try {
    return await db.query(q, params);
  } finally {
    try { await db.exec('reset role'); } catch { /* aborted transaction; caller rolls back */ }
  }
}
const asAnon = (q, params) => asUser(null, q, params);
const one = async (p) => (await p).rows[0];
const num = (v) => (v === null || v === undefined ? v : Number(v));

// ---------------------------------------------------------------------------
// Synthetic users and dates
// ---------------------------------------------------------------------------
const A = '00000000-0000-4000-8000-00000000000a';
const B = '00000000-0000-4000-8000-00000000000b';

const utcToday = new Date().toISOString().slice(0, 10);
const monthStart = utcToday.slice(0, 8) + '01';
const addMonths = (isoMonthStart, n) => {
  const d = new Date(isoMonthStart + 'T00:00:00Z');
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 10);
};
const prevMonth = addMonths(monthStart, -1);
const nextMonth = addMonths(monthStart, 1);
const inTwoYears = String(Number(utcToday.slice(0, 4)) + 2) + utcToday.slice(4);
const inElevenMonths = addMonths(monthStart, 11);

// Ids filled in during setup.
const ids = { A: {}, B: {} };

async function insertAs(uid, table, row) {
  const cols = Object.keys(row);
  const params = Object.values(row);
  const q = `insert into public.${table} (${cols.join(', ')}) values (${cols.map((_, i) => `$${i + 1}`).join(', ')}) returning *`;
  return (await asUser(uid, q, params)).rows[0];
}

// ===========================================================================
group('Setup');

await test('Supabase stubs load', async () => {
  await db.exec(SUPABASE_STUB);
});

const migrationFiles = (await readdir(migrationsDir)).filter((f) => f.endsWith('.sql')).sort();
for (const file of migrationFiles) {
  await test(`migration ${file} applies unchanged`, async () => {
    await db.exec('set role migration_owner');
    await db.exec(await readFile(path.join(migrationsDir, file), 'utf8'));
    await db.exec('reset role');
  });
}

await test('migration objects are owned by the non-superuser migration role', async () => {
  const r = await one(sql(`select count(*)::int as n from pg_class c join pg_namespace n on n.oid = c.relnamespace
                            where n.nspname = 'public' and c.relkind in ('r', 'v')
                              and pg_get_userbyid(c.relowner) <> 'migration_owner'`));
  eq(r.n, 0, 'relations not owned by migration_owner');
  const s = await one(sql(`select rolsuper from pg_roles where rolname = 'migration_owner'`));
  eq(s.rolsuper, false, 'migration_owner is superuser');
});

if (results.some((r) => !r.ok)) {
  summarize();
}

// ===========================================================================
group('RLS gate (supabase/checks/rls_gate.sql)');

await test('gate passes on the migrated schema', async () => {
  await db.exec(gateSql);
});

await test('gate fails on a table without RLS (negative control)', async () => {
  await db.exec('begin');
  await db.exec('create table public.rogue (id int primary key)');
  await expectError(db.exec(gateSql), /rogue: row level security is disabled/, 'gate');
});

await test('gate fails on a table with RLS but only a FOR ALL policy (negative control)', async () => {
  await db.exec('begin');
  await db.exec(`create table public.rogue2 (id int primary key);
                 alter table public.rogue2 enable row level security;
                 revoke all on public.rogue2 from anon;
                 create policy rogue2_all on public.rogue2 for all to authenticated using (true);`);
  await expectError(db.exec(gateSql), /rogue2: no SELECT policy/, 'gate');
});

await test('gate fails on a view without security_invoker (negative control)', async () => {
  await db.exec('begin');
  await db.exec(`create view public.rogue_view as select 1 as x; revoke all on public.rogue_view from anon;`);
  await expectError(db.exec(gateSql), /rogue_view: view is not security_invoker/, 'gate');
});

// ===========================================================================
group('Sign-up and profiles');

await test('sign-up trigger creates a profile with defaults', async () => {
  await sql(`insert into auth.users (id, email, raw_user_meta_data) values
              ($1, 'user-a@example.test', '{"display_name":"Synthetic A","timezone":"America/Bogota"}'),
              ($2, 'user-b@example.test', '{"timezone":"Not/AZone"}')`, [A, B]);
  const pa = await one(sql('select * from public.profiles where id = $1', [A]));
  const pb = await one(sql('select * from public.profiles where id = $1', [B]));
  eq(pa.display_name, 'Synthetic A', 'A display_name');
  eq(pa.timezone, 'America/Bogota', 'A timezone');
  eq(pa.currency, 'USD', 'A default currency');
  eq(pb.timezone, 'UTC', 'B invalid timezone falls back to UTC');
});

await test('a client cannot insert a profile', async () => {
  await expectError(asUser(A, `insert into public.profiles (id) values ($1)`, [A]), /permission denied/, 'insert profile');
});

await test('timezone must be a valid IANA name', async () => {
  await expectError(asUser(A, `update public.profiles set timezone = 'Mars/Olympus' where id = $1`, [A]),
    /Unknown time zone/, 'invalid tz');
  // Keep A on UTC so the harness's date arithmetic matches the database's.
  const r = await asUser(A, `update public.profiles set timezone = 'UTC' where id = $1`, [A]);
  eq(r.affectedRows, 1, 'valid tz update');
});

await test('currencies are readable by authenticated users', async () => {
  const r = await asUser(A, 'select code, exponent from public.currencies order by code');
  eq(r.rows.map((x) => [x.code, x.exponent]), [['COP', 0], ['USD', 2]], 'currencies');
});

// ===========================================================================
group('Synthetic data');

await test('user A creates accounts, categories, budgets and a goal', async () => {
  const a = ids.A;
  a.chk = (await insertAs(A, 'accounts', { name: 'Synthetic Checking', type: 'checking', opening_balance_minor: 100000 })).id;
  a.sav = (await insertAs(A, 'accounts', { name: 'Synthetic Fund', type: 'savings' })).id;
  a.card = (await insertAs(A, 'accounts', { name: 'Synthetic Card', type: 'credit_card', opening_balance_minor: -20000 })).id;
  a.cash = (await insertAs(A, 'accounts', { name: 'Synthetic Cash', type: 'cash' })).id;
  a.grp = (await insertAs(A, 'category_groups', { name: 'Essentials' })).id;
  a.groceries = (await insertAs(A, 'categories', { name: 'Groceries', kind: 'expense', group_id: a.grp })).id;
  a.rent = (await insertAs(A, 'categories', { name: 'Housing', kind: 'expense', group_id: a.grp })).id;
  a.food = (await insertAs(A, 'categories', { name: 'Food out', kind: 'expense' })).id;
  a.salary = (await insertAs(A, 'categories', { name: 'Salary', kind: 'income' })).id;
  a.budgetGroceries = (await insertAs(A, 'budgets', { category_id: a.groceries, month: monthStart, amount_minor: 20000 })).id;
  a.budgetRent = (await insertAs(A, 'budgets', { category_id: a.rent, month: monthStart, amount_minor: 100000 })).id;
  a.goal = (await insertAs(A, 'goals', { account_id: a.sav, name: 'Emergency fund', target_minor: 100000, monthly_plan_minor: 25000 })).id;
  const p = await one(sql('select user_id from public.accounts where id = $1', [a.chk]));
  eq(p.user_id, A, 'user_id defaults to auth.uid()');
});

await test('user A records transactions', async () => {
  const a = ids.A;
  const t = (row) => insertAs(A, 'transactions', row);
  a.t1 = (await t({ kind: 'income', occurred_on: prevMonth, amount_minor: 250000, to_account_id: a.chk, category_id: a.salary, description: 'Synthetic salary' })).id;
  a.t2 = (await t({ kind: 'expense', occurred_on: monthStart, amount_minor: 4550, from_account_id: a.chk, category_id: a.groceries, description: 'Synthetic market' })).id;
  a.t3 = (await t({ kind: 'transfer', occurred_on: monthStart, amount_minor: 50000, from_account_id: a.chk, to_account_id: a.sav, description: 'To fund' })).id;
  a.t4 = (await t({ kind: 'expense', occurred_on: monthStart, amount_minor: 3000, from_account_id: a.card, category_id: a.groceries, description: 'Synthetic bakery' })).id;
  a.t5 = (await t({ kind: 'transfer', occurred_on: monthStart, amount_minor: 10000, from_account_id: a.chk, to_account_id: a.card, description: 'Card payment' })).id;
  a.t6 = (await t({ kind: 'expense', occurred_on: monthStart, amount_minor: 18000, from_account_id: a.card, category_id: a.groceries, description: 'Synthetic groceries run', notes: 'weekly shop' })).id;
});

await test('user B creates its own rows', async () => {
  const b = ids.B;
  b.chk = (await insertAs(B, 'accounts', { name: 'B Checking', type: 'checking', opening_balance_minor: 5000 })).id;
  b.sav = (await insertAs(B, 'accounts', { name: 'B Fund', type: 'savings' })).id;
  b.grp = (await insertAs(B, 'category_groups', { name: 'B group' })).id;
  b.cat = (await insertAs(B, 'categories', { name: 'B expense', kind: 'expense' })).id;
  b.budget = (await insertAs(B, 'budgets', { category_id: b.cat, month: monthStart, amount_minor: 1000 })).id;
  b.goal = (await insertAs(B, 'goals', { account_id: b.sav, name: 'B goal' })).id;
  b.recurring = (await insertAs(B, 'recurring_items', {
    name: 'B bill', label: 'bill', kind: 'expense', amount_minor: 700, from_account_id: b.chk, category_id: b.cat,
    cadence_unit: 'month', anchor_on: monthStart, next_due_on: monthStart })).id;
});

await test('user A creates a recurring item, an import batch and an audit event', async () => {
  const a = ids.A;
  a.recurring = (await insertAs(A, 'recurring_items', {
    name: 'Synthetic rent', label: 'bill', kind: 'expense', amount_minor: 120000, from_account_id: a.chk,
    category_id: a.rent, cadence_unit: 'month', cadence_interval: 1, anchor_on: '2026-01-31', next_due_on: '2026-01-31' })).id;
  a.batch = (await insertAs(A, 'import_batches', { source: 'csv', filename: 'synthetic.csv', row_count: 0 })).id;
  await asUser(A, `select public.log_event('export')`);
  a.audit = (await one(sql(`select id from public.audit_events where user_id = $1`, [A]))).id;
});

// ===========================================================================
group('Cross-user isolation (user B against user A)');

// For each table: A's row id, a column B may normally update, and a valid
// insert for B that differs from B's own rows only by carrying A's user_id.
const matrix = [
  { table: 'accounts', id: () => ids.A.chk, set: `name = 'hijacked'`,
    insert: () => ({ cols: 'user_id, name, type', vals: [A, 'Stolen', 'cash'] }) },
  { table: 'category_groups', id: () => ids.A.grp, set: `name = 'hijacked'`,
    insert: () => ({ cols: 'user_id, name', vals: [A, 'Stolen group'] }) },
  { table: 'categories', id: () => ids.A.groceries, set: `name = 'hijacked'`,
    insert: () => ({ cols: 'user_id, name, kind', vals: [A, 'Stolen', 'expense'] }) },
  { table: 'transactions', id: () => ids.A.t2, set: `description = 'hijacked'`,
    insert: () => ({ cols: 'user_id, kind, occurred_on, amount_minor, from_account_id, description',
                     vals: [A, 'expense', monthStart, 100, ids.B.chk, 'Stolen'] }) },
  { table: 'budgets', id: () => ids.A.budgetGroceries, set: `amount_minor = 1`,
    insert: () => ({ cols: 'user_id, category_id, month, amount_minor', vals: [A, ids.B.cat, nextMonth, 1] }) },
  { table: 'goals', id: () => ids.A.goal, set: `name = 'hijacked'`,
    insert: () => ({ cols: 'user_id, account_id, name', vals: [A, ids.B.chk, 'Stolen'] }) },
  { table: 'recurring_items', id: () => ids.A.recurring, set: `name = 'hijacked'`,
    insert: () => ({ cols: 'user_id, name, label, kind, amount_minor, from_account_id, cadence_unit, anchor_on, next_due_on',
                     vals: [A, 'Stolen', 'bill', 'expense', 1, ids.B.chk, 'month', monthStart, monthStart] }) },
  { table: 'import_batches', id: () => ids.A.batch, set: `status = 'reconciled'`,
    insert: () => ({ cols: 'user_id, source, row_count', vals: [A, 'csv', 0] }) },
  { table: 'audit_events', id: () => ids.A.audit, set: null,
    insert: () => ({ cols: 'user_id, event', vals: [A, 'export'] }) },
];

const bOwnRow = {
  accounts: () => ids.B.chk, category_groups: () => ids.B.grp, categories: () => ids.B.cat,
  budgets: () => ids.B.budget, goals: () => ids.B.goal, recurring_items: () => ids.B.recurring,
};

for (const m of matrix) {
  await test(`${m.table}: B cannot select A's row`, async () => {
    const r = await asUser(B, `select * from public.${m.table} where id = $1`, [m.id()]);
    eq(r.rows.length, 0, 'rows visible');
    const all = await asUser(B, `select count(*)::int as n from public.${m.table} where user_id = $1`, [A]);
    eq(all.rows[0].n, 0, "A's rows visible");
  });

  await test(`${m.table}: B cannot update A's row`, async () => {
    if (!m.set) {
      await expectError(asUser(B, `update public.${m.table} set event = 'import' where id = $1`, [m.id()]), /permission denied/, 'update');
      return;
    }
    const r = await asUser(B, `update public.${m.table} set ${m.set} where id = $1`, [m.id()]);
    eq(r.affectedRows, 0, 'rows updated');
  });

  await test(`${m.table}: B cannot delete A's row`, async () => {
    if (m.table === 'audit_events') {
      await expectError(asUser(B, `delete from public.${m.table} where id = $1`, [m.id()]), /permission denied/, 'delete');
    } else {
      const r = await asUser(B, `delete from public.${m.table} where id = $1`, [m.id()]);
      eq(r.affectedRows, 0, 'rows deleted');
    }
    const still = await sql(`select 1 from public.${m.table} where id = $1`, [m.id()]);
    eq(still.rows.length, 1, "A's row still exists");
  });

  await test(`${m.table}: B cannot insert a row with A's user_id (column grant)`, async () => {
    const { cols, vals } = m.insert();
    const ph = vals.map((_, i) => `$${i + 1}`).join(', ');
    await expectError(asUser(B, `insert into public.${m.table} (${cols}) values (${ph})`, vals), /permission denied/, 'insert');
  });

  if (m.table !== 'audit_events') {
    await test(`${m.table}: B cannot insert with A's user_id even if the column were granted (RLS)`, async () => {
      const { cols, vals } = m.insert();
      const ph = vals.map((_, i) => `$${i + 1}`).join(', ');
      await db.exec('begin');
      await db.exec(`grant insert (user_id) on public.${m.table} to authenticated`);
      await expectError(asUser(B, `insert into public.${m.table} (${cols}) values (${ph})`, vals),
        /row-level security/, 'insert with grant');
    });
  }

  if (bOwnRow[m.table]) {
    await test(`${m.table}: B cannot reassign its own row to A`, async () => {
      await expectError(asUser(B, `update public.${m.table} set user_id = $1 where id = $2`, [A, bOwnRow[m.table]()]),
        /permission denied/, 'reassign');
      // With the column grant added, RLS WITH CHECK and the trigger still refuse.
      await db.exec('begin');
      await db.exec(`grant update (user_id) on public.${m.table} to authenticated`);
      await expectError(asUser(B, `update public.${m.table} set user_id = $1 where id = $2`, [A, bOwnRow[m.table]()]),
        /cannot be changed|row-level security/, 'reassign with grant');
    });
  }
}

await test("transactions: B cannot reassign its own transaction to A", async () => {
  const t = await insertAs(B, 'transactions', { kind: 'income', occurred_on: monthStart, amount_minor: 100, to_account_id: ids.B.chk, description: 'B pay' });
  ids.B.t1 = t.id;
  await expectError(asUser(B, `update public.transactions set user_id = $1 where id = $2`, [A, t.id]), /permission denied/, 'reassign');
});

await test("profiles: B cannot read or update A's profile, or reassign its own", async () => {
  eq((await asUser(B, `select * from public.profiles where id = $1`, [A])).rows.length, 0, 'select');
  eq((await asUser(B, `update public.profiles set display_name = 'x' where id = $1`, [A])).affectedRows, 0, 'update');
  await expectError(asUser(B, `delete from public.profiles where id = $1`, [A]), /permission denied/, 'delete');
  await expectError(asUser(B, `update public.profiles set id = $1 where id = $2`, [A, B]), /permission denied/, 'reassign');
  eq((await asUser(B, `select id from public.profiles`)).rows.map((r) => r.id), [B], 'B sees only itself');
});

await test('views return only the caller\'s rows', async () => {
  for (const v of ['account_entries', 'account_balances', 'budget_progress', 'monthly_cash_flow',
                   'goal_progress', 'net_worth_by_month', 'category_usage', 'account_month_flow', 'account_ledger',
                   'category_month_totals', 'month_summary', 'recurring_item_months']) {
    const r = await asUser(B, `select count(*)::int as n from public.${v} where user_id <> $1`, [B]);
    eq(r.rows[0].n, 0, `${v} rows of other users`);
  }
});

group('Cross-user foreign references');

await test("B's transaction cannot point at A's account", async () => {
  await expectError(insertAs(B, 'transactions', { kind: 'expense', occurred_on: monthStart, amount_minor: 100,
    from_account_id: ids.A.chk, description: 'x' }), /foreign key/, 'txn -> A account');
});
await test("B's transaction cannot use A's category", async () => {
  await expectError(insertAs(B, 'transactions', { kind: 'expense', occurred_on: monthStart, amount_minor: 100,
    from_account_id: ids.B.chk, category_id: ids.A.groceries, description: 'x' }), /foreign key/, 'txn -> A category');
});
await test("B's budget, goal, category and recurring item cannot point at A's rows", async () => {
  await expectError(insertAs(B, 'budgets', { category_id: ids.A.groceries, month: nextMonth, amount_minor: 1 }), /foreign key/, 'budget');
  await expectError(insertAs(B, 'goals', { account_id: ids.A.cash, name: 'x' }), /foreign key/, 'goal');
  await expectError(insertAs(B, 'categories', { name: 'x', kind: 'expense', group_id: ids.A.grp }), /foreign key/, 'category group');
  await expectError(insertAs(B, 'recurring_items', { name: 'x', label: 'bill', kind: 'expense', amount_minor: 1,
    from_account_id: ids.A.chk, cadence_unit: 'month', anchor_on: monthStart, next_due_on: monthStart }), /foreign key/, 'recurring');
});
await test("B cannot point its transaction at A's recurring item or import batch", async () => {
  await expectError(insertAs(B, 'transactions', { kind: 'expense', occurred_on: monthStart, amount_minor: 1,
    from_account_id: ids.B.chk, description: 'x', recurring_item_id: ids.A.recurring }), /foreign key/, 'recurring');
  await expectError(insertAs(B, 'transactions', { kind: 'expense', occurred_on: monthStart, amount_minor: 1,
    from_account_id: ids.B.chk, description: 'x', import_batch_id: ids.A.batch }), /foreign key/, 'batch');
});
await test("B cannot mark A's bill as paid", async () => {
  await expectError(asUser(B, `select * from public.mark_bill_paid($1, $2)`, [ids.A.recurring, monthStart]), /Bill not found/, 'mark paid');
});

// ===========================================================================
group('Transaction rules');

const base = () => ({ occurred_on: monthStart, amount_minor: 100, description: 'Rule test' });
const cases = [
  ['expense with a to account', { kind: 'expense', from_account_id: 'chk', to_account_id: 'sav' }, /transactions_direction_check/],
  ['expense without a from account', { kind: 'expense' }, /transactions_direction_check/],
  ['income with a from account', { kind: 'income', from_account_id: 'chk', to_account_id: 'sav' }, /transactions_direction_check/],
  ['income without a to account', { kind: 'income' }, /transactions_direction_check/],
  ['transfer with one side missing', { kind: 'transfer', from_account_id: 'chk' }, /transactions_direction_check/],
  ['transfer to the same account', { kind: 'transfer', from_account_id: 'chk', to_account_id: 'chk' }, /transactions_direction_check/],
  ['zero amount', { kind: 'expense', from_account_id: 'chk', amount_minor: 0 }, /transactions_amount_positive/],
  ['negative amount', { kind: 'expense', from_account_id: 'chk', amount_minor: -5 }, /transactions_amount_positive/],
  ['blank description', { kind: 'expense', from_account_id: 'chk', description: '   ' }, /transactions_description_length/],
  ['141-character description', { kind: 'expense', from_account_id: 'chk', description: 'x'.repeat(141) }, /transactions_description_length/],
  ['expense with an income category', { kind: 'expense', from_account_id: 'chk', category_id: 'salary' }, /transactions_category_fkey/],
  ['income with an expense category', { kind: 'income', to_account_id: 'chk', category_id: 'groceries' }, /transactions_category_fkey/],
  ['transfer with a category', { kind: 'transfer', from_account_id: 'chk', to_account_id: 'sav', category_id: 'groceries' }, /transactions_category_on_transfer_check/],
  ['occurred_on before 1970', { kind: 'expense', from_account_id: 'chk', occurred_on: '1969-12-31' }, /transactions_occurred_on_lower_bound/],
  ['occurred_on more than a year ahead', { kind: 'expense', from_account_id: 'chk', occurred_on: inTwoYears }, /more than one year/],
];
for (const [name, row, pattern] of cases) {
  await test(`rejects ${name}`, async () => {
    const r = { ...base(), ...row };
    for (const k of ['from_account_id', 'to_account_id', 'category_id']) if (r[k]) r[k] = ids.A[r[k]];
    await expectError(insertAs(A, 'transactions', r), pattern, name);
  });
}
await test('accepts 140 characters and a date eleven months ahead', async () => {
  const t = await insertAs(A, 'transactions', { ...base(), kind: 'expense', from_account_id: ids.A.cash,
    description: 'y'.repeat(140), occurred_on: inElevenMonths });
  await sql('delete from public.transactions where id = $1', [t.id]);
});
await test('an update cannot break the direction rule', async () => {
  await expectError(asUser(A, `update public.transactions set to_account_id = $1 where id = $2`, [ids.A.sav, ids.A.t2]),
    /transactions_direction_check/, 'update');
});
await test('a used category cannot change kind', async () => {
  await expectError(asUser(A, `update public.categories set kind = 'income' where id = $1`, [ids.A.groceries]), /foreign key/, 'kind change');
});
await test('budgets accept expense categories only', async () => {
  await expectError(insertAs(A, 'budgets', { category_id: ids.A.salary, month: nextMonth, amount_minor: 1 }), /budgets_category_fkey/, 'income budget');
  await expectError(insertAs(A, 'budgets', { category_id: ids.A.groceries, month: utcToday.slice(0, 8) + '15', amount_minor: 1 }),
    /budgets_month_first_day/, 'mid-month');
  await expectError(insertAs(A, 'budgets', { category_id: ids.A.groceries, month: monthStart, amount_minor: 1 }), /duplicate key/, 'duplicate month');
});
await test('recurring items follow the transaction rules', async () => {
  const r = { name: 'x', label: 'bill', amount_minor: 1, cadence_unit: 'month', anchor_on: monthStart, next_due_on: monthStart };
  await expectError(insertAs(A, 'recurring_items', { ...r, kind: 'expense', from_account_id: ids.A.chk, category_id: ids.A.salary }), /recurring_items_category_fkey/, 'kind mismatch');
  await expectError(insertAs(A, 'recurring_items', { ...r, kind: 'transfer', from_account_id: ids.A.chk, to_account_id: ids.A.sav, category_id: ids.A.groceries }), /category_on_transfer|label_kind/, 'transfer category');
  await expectError(insertAs(A, 'recurring_items', { ...r, kind: 'expense', from_account_id: ids.A.chk, to_account_id: ids.A.sav }), /recurring_items_direction_check/, 'direction');
  await expectError(insertAs(A, 'recurring_items', { ...r, kind: 'expense', from_account_id: ids.A.chk, cadence_interval: 13 }), /recurring_items_interval_range/, 'interval');
  await expectError(insertAs(A, 'recurring_items', { ...r, kind: 'expense', label: 'income', from_account_id: ids.A.chk }), /recurring_items_label_kind_check/, 'label');
});
await test('each account can back only one goal', async () => {
  await expectError(insertAs(A, 'goals', { account_id: ids.A.sav, name: 'Second goal' }), /goals_account_id_key/, 'second goal');
});

// ===========================================================================
group('Ownership immutability');

await test('user_id is not updatable by the owner (column grant)', async () => {
  await expectError(asUser(A, `update public.accounts set user_id = $1 where id = $2`, [A, ids.A.chk]), /permission denied/, 'owner');
});
await test('source_ref, created_at and id are not updatable', async () => {
  await expectError(asUser(A, `update public.transactions set source_ref = 'x' where id = $1`, [ids.A.t2]), /permission denied/, 'source_ref');
  await expectError(asUser(A, `update public.transactions set created_at = now() where id = $1`, [ids.A.t2]), /permission denied/, 'created_at');
  await expectError(asUser(A, `update public.accounts set id = gen_random_uuid() where id = $1`, [ids.A.chk]), /permission denied/, 'id');
});
await test('the trigger rejects a user_id change even from the table owner and a superuser', async () => {
  const asOwner = async (q, params) => {
    await db.exec('set role migration_owner');
    try { return await db.query(q, params); } finally { await db.exec('reset role'); }
  };
  for (const [table, id] of [['accounts', ids.A.chk], ['transactions', ids.A.t2], ['budgets', ids.A.budgetGroceries], ['audit_events', ids.A.audit]]) {
    await expectError(asOwner(`update public.${table} set user_id = $1 where id = $2`, [B, id]), /user_id cannot be changed/, table);
    await expectError(sql(`update public.${table} set user_id = $1 where id = $2`, [B, id]), /user_id cannot be changed/, `${table} (superuser)`);
  }
  await expectError(asOwner(`update public.profiles set id = $1 where id = $2`, [B, A]), /cannot be changed/, 'profiles');
});
await test('updated_at is maintained by trigger', async () => {
  const before = await one(sql('select updated_at from public.accounts where id = $1', [ids.A.cash]));
  await new Promise((r) => setTimeout(r, 5));
  await asUser(A, `update public.accounts set sort_order = 9 where id = $1`, [ids.A.cash]);
  const after = await one(sql('select updated_at from public.accounts where id = $1', [ids.A.cash]));
  assert(new Date(after.updated_at) > new Date(before.updated_at), 'updated_at did not advance');
});

group('Currency lock');

await test('currency can change while the user has no transactions', async () => {
  await db.exec('begin');
  await sql('delete from public.transactions where user_id = $1', [B]);
  const r = await asUser(B, `update public.profiles set currency = 'COP' where id = $1`, [B]);
  eq(r.affectedRows, 1, 'switch to COP');
});
await test('currency cannot change once transactions exist', async () => {
  await expectError(asUser(A, `update public.profiles set currency = 'COP' where id = $1`, [A]), /before the first transaction/, 'lock');
  await expectError(asUser(A, `update public.profiles set currency = 'EUR' where id = $1`, [A]), /foreign key|before the first/, 'unknown currency');
});

// ===========================================================================
group('Views (hand-computed synthetic numbers)');

// chk  = 100000 + 250000 - 4550 - 50000 - 10000             = 285450
// sav  = 0 + 50000                                           = 50000
// card = -20000 - 3000 - 18000 + 10000                       = -31000
// cash = 0
await test('account_balances = opening + in - out', async () => {
  const r = await asUser(A, `select account_id, balance_minor, money_in_minor, money_out_minor, is_liability
                               from public.account_balances`);
  const by = Object.fromEntries(r.rows.map((x) => [x.account_id, x]));
  eq(num(by[ids.A.chk].balance_minor), 285450, 'checking');
  eq(num(by[ids.A.chk].money_in_minor), 250000, 'checking in');
  eq(num(by[ids.A.chk].money_out_minor), 64550, 'checking out');
  eq(num(by[ids.A.sav].balance_minor), 50000, 'fund');
  eq(num(by[ids.A.card].balance_minor), -31000, 'card');
  eq(num(by[ids.A.cash].balance_minor), 0, 'cash');
  eq(by[ids.A.card].is_liability, true, 'card is a liability');
});

await test('net_worth_by_month is cumulative and splits assets and liabilities', async () => {
  const r = await asUser(A, `select month::text, assets_minor, liabilities_minor, net_worth_minor from public.net_worth_by_month order by month`);
  const rows = r.rows.map((x) => [x.month.slice(0, 10), num(x.assets_minor), num(x.liabilities_minor), num(x.net_worth_minor)]);
  // Previous month: openings (100000, -20000) + salary 250000.
  // This month: 285450 + 50000 + 0 assets, -31000 liabilities.
  // The date eleven months ahead was deleted, so the grid ends this month.
  eq(rows, [[prevMonth, 350000, -20000, 330000], [monthStart, 335450, -31000, 304450]], 'net worth');
});

await test('monthly_cash_flow excludes transfers', async () => {
  const r = await asUser(A, `select month::text, money_in_minor, money_out_minor, net_minor from public.monthly_cash_flow order by month`);
  const rows = r.rows.map((x) => [x.month.slice(0, 10), num(x.money_in_minor), num(x.money_out_minor), num(x.net_minor)]);
  eq(rows, [[prevMonth, 250000, 0, 250000], [monthStart, 0, 25550, -25550]], 'cash flow');
});

await test('budget_progress counts expenses only and lets left go negative', async () => {
  const r = await asUser(A, `select category_id, planned_minor, spent_minor, left_minor from public.budget_progress where month = $1`, [monthStart]);
  const by = Object.fromEntries(r.rows.map((x) => [x.category_id, x]));
  eq([num(by[ids.A.groceries].planned_minor), num(by[ids.A.groceries].spent_minor), num(by[ids.A.groceries].left_minor)],
     [20000, 25550, -5550], 'groceries');
  eq([num(by[ids.A.rent].spent_minor), num(by[ids.A.rent].left_minor)], [0, 100000], 'housing');
});

await test('goal_progress uses the fund balance and this month\'s transfers in', async () => {
  const g = await one(asUser(A, `select balance_minor, remaining_minor, this_month::text, this_month_contributed_minor, monthly_plan_minor
                                   from public.goal_progress where goal_id = $1`, [ids.A.goal]));
  eq([num(g.balance_minor), num(g.remaining_minor), g.this_month.slice(0, 10), num(g.this_month_contributed_minor), num(g.monthly_plan_minor)],
     [50000, 50000, monthStart, 50000, 25000], 'goal');
});

await test('"this month" follows the profile time zone', async () => {
  // At any instant, Pacific/Kiritimati (UTC+14) and Pacific/Pago_Pago (UTC-11) can be on different days.
  const r = await one(sql(`select date_trunc('month', now() at time zone 'Pacific/Kiritimati')::date::text as east,
                                  date_trunc('month', now() at time zone 'Pacific/Pago_Pago')::date::text as west`));
  await db.exec('begin');
  await asUser(A, `update public.profiles set timezone = 'Pacific/Kiritimati' where id = $1`, [A]);
  const east = await one(asUser(A, `select this_month::text from public.goal_progress where goal_id = $1`, [ids.A.goal]));
  await asUser(A, `update public.profiles set timezone = 'Pacific/Pago_Pago' where id = $1`, [A]);
  const west = await one(asUser(A, `select this_month::text from public.goal_progress where goal_id = $1`, [ids.A.goal]));
  eq([east.this_month.slice(0, 10), west.this_month.slice(0, 10)], [r.east, r.west], 'this_month per zone');
});

await test('category_usage reports use counts', async () => {
  const r = await one(asUser(A, `select use_count from public.category_usage where category_id = $1`, [ids.A.groceries]));
  eq(num(r.use_count), 3, 'groceries uses');
});

// ===========================================================================
group('Detail-page views (hand-computed synthetic numbers)');

const flowRow = (x) => [x.month.slice(0, 10), num(x.income_minor), num(x.income_count), num(x.expense_minor),
  num(x.expense_count), num(x.transfer_in_minor), num(x.transfer_in_count), num(x.transfer_out_minor),
  num(x.transfer_out_count), num(x.net_minor), num(x.closing_balance_minor)];

// chk:  opening 100000; last month +250000 salary; this month -4550 expense, -50000 and -10000 transfers out.
// card: opening -20000; this month -3000 and -18000 expenses, +10000 transfer in.
// cash: nothing, so a single zero row for the current month.
await test('account_month_flow splits by kind and closes each month at the running balance', async () => {
  const q = `select month::text, income_minor, income_count, expense_minor, expense_count, transfer_in_minor,
                    transfer_in_count, transfer_out_minor, transfer_out_count, net_minor, closing_balance_minor
               from public.account_month_flow where account_id = $1 order by month`;
  eq((await asUser(A, q, [ids.A.chk])).rows.map(flowRow),
     [[prevMonth, 250000, 1, 0, 0, 0, 0, 0, 0, 250000, 350000],
      [monthStart, 0, 0, 4550, 1, 0, 0, 60000, 2, -64550, 285450]], 'checking');
  eq((await asUser(A, q, [ids.A.card])).rows.map(flowRow),
     [[monthStart, 0, 0, 21000, 2, 10000, 1, 0, 0, -11000, -31000]], 'card');
  eq((await asUser(A, q, [ids.A.cash])).rows.map(flowRow),
     [[monthStart, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]], 'cash');
});

await test('account_month_flow ends every account at its account_balances figure', async () => {
  const r = await asUser(A, `select b.account_id, b.balance_minor, f.closing_balance_minor
                               from public.account_balances b
                               join public.account_month_flow f on f.account_id = b.account_id
                              where f.month = (select max(month) from public.account_month_flow x where x.account_id = b.account_id)`);
  eq(r.rows.length, 4, 'one closing row per account');
  for (const row of r.rows) eq(num(row.closing_balance_minor), num(row.balance_minor), `account ${row.account_id}`);
});

await test('account_ledger runs the balance entry by entry, and a kind filter leaves it intact', async () => {
  const q = `select transaction_id, kind, signed_amount_minor, balance_after_minor from public.account_ledger
              where account_id = $1 order by occurred_on, created_at, transaction_id`;
  const rows = (await asUser(A, q, [ids.A.chk])).rows;
  eq(rows.length, 4, 'checking entries');
  let running = 100000;
  for (const row of rows) {
    running += num(row.signed_amount_minor);
    eq(num(row.balance_after_minor), running, `balance after ${row.transaction_id}`);
  }
  eq(running, 285450, 'ends at the account balance');
  const salary = await one(asUser(A, `select balance_after_minor from public.account_ledger
                                       where account_id = $1 and kind = 'income'`, [ids.A.chk]));
  eq(num(salary.balance_after_minor), 350000, 'filtered row keeps its running balance');
  const fund = await one(asUser(A, `select signed_amount_minor, balance_after_minor from public.account_ledger
                                     where account_id = $1`, [ids.A.sav]));
  eq([num(fund.signed_amount_minor), num(fund.balance_after_minor)], [50000, 50000], 'transfer in, signed from the fund side');
});

await test('category_month_totals sums each category per month', async () => {
  const r = await asUser(A, `select category_id, kind, month::text, total_minor, txn_count
                               from public.category_month_totals order by month, category_id`);
  const rows = r.rows.map((x) => [x.category_id, x.kind, x.month.slice(0, 10), num(x.total_minor), num(x.txn_count)]);
  eq(rows.find((x) => x[0] === ids.A.groceries), [ids.A.groceries, 'expense', monthStart, 25550, 3], 'groceries');
  eq(rows.find((x) => x[0] === ids.A.salary), [ids.A.salary, 'income', prevMonth, 250000, 1], 'salary');
  eq(rows.length, 2, 'no row for unused categories or for transfers');
});

await test('month_summary totals each kind and the money moved into goal accounts', async () => {
  const r = await asUser(A, `select month::text, income_minor, income_count, expense_minor, expense_count,
                                    transfer_minor, transfer_count, to_goals_minor, net_minor
                               from public.month_summary order by month`);
  const rows = r.rows.map((x) => [x.month.slice(0, 10), num(x.income_minor), num(x.income_count), num(x.expense_minor),
    num(x.expense_count), num(x.transfer_minor), num(x.transfer_count), num(x.to_goals_minor), num(x.net_minor)]);
  // The 50000 transfer lands in the goal's fund; the 10000 card payment does not.
  eq(rows, [[prevMonth, 250000, 1, 0, 0, 0, 0, 0, 250000],
            [monthStart, 0, 0, 25550, 3, 60000, 2, 50000, -25550]], 'months');
});

await test('recurring_item_months sums what each item actually cost', async () => {
  eq((await asUser(A, `select count(*)::int as n from public.recurring_item_months`)).rows[0].n, 0, 'nothing paid yet');
  await db.exec('begin');
  await insertAs(A, 'transactions', { kind: 'expense', occurred_on: monthStart, amount_minor: 120000, from_account_id: ids.A.chk,
    category_id: ids.A.rent, recurring_item_id: ids.A.recurring, description: 'Synthetic rent' });
  await insertAs(A, 'transactions', { kind: 'expense', occurred_on: prevMonth, amount_minor: 118000, from_account_id: ids.A.chk,
    category_id: ids.A.rent, recurring_item_id: ids.A.recurring, description: 'Synthetic rent' });
  const r = await asUser(A, `select month::text, paid_minor, payment_count, last_paid_on::text
                               from public.recurring_item_months where recurring_item_id = $1 order by month`, [ids.A.recurring]);
  eq(r.rows.map((x) => [x.month.slice(0, 10), num(x.paid_minor), num(x.payment_count), x.last_paid_on.slice(0, 10)]),
     [[prevMonth, 118000, 1, prevMonth], [monthStart, 120000, 1, monthStart]], 'rent');
});

await test('category_top_descriptions ranks exact descriptions by total, and respects the limit', async () => {
  const r = await asUser(A, `select description, total_minor, txn_count from public.category_top_descriptions($1, $2, $3)`,
    [ids.A.groceries, monthStart, nextMonth]);
  eq(r.rows.map((x) => [x.description, num(x.total_minor), num(x.txn_count)]),
     [['Synthetic groceries run', 18000, 1], ['Synthetic market', 4550, 1], ['Synthetic bakery', 3000, 1]], 'ranking');
  const two = await asUser(A, `select count(*)::int as n from public.category_top_descriptions($1, $2, $3, 2)`,
    [ids.A.groceries, monthStart, nextMonth]);
  eq(two.rows[0].n, 2, 'limit');
  const before = await asUser(A, `select count(*)::int as n from public.category_top_descriptions($1, $2, $3)`,
    [ids.A.groceries, prevMonth, monthStart]);
  eq(before.rows[0].n, 0, 'the end date is exclusive and the range is honoured');
});

await test("the detail-page views and function show B nothing of A's", async () => {
  for (const v of ['account_month_flow', 'account_ledger', 'category_month_totals', 'month_summary', 'recurring_item_months']) {
    const r = await asUser(B, `select count(*)::int as n from public.${v} where user_id = $1`, [A]);
    eq(r.rows[0].n, 0, `${v} rows of A`);
  }
  const f = await asUser(B, `select count(*)::int as n from public.category_top_descriptions($1, $2, $3)`,
    [ids.A.groceries, prevMonth, nextMonth]);
  eq(f.rows[0].n, 0, "A's category through the function");
});

// ===========================================================================
group('Recurrence and mark_bill_paid');

const next = async (anchor, unit, interval, after) =>
  (await one(sql(`select public.recurrence_next($1::date, $2::public.cadence_unit, $3, $4::date)::text as d`, [anchor, unit, interval, after]))).d.slice(0, 10);

await test('monthly from Jan 31 clamps without drift (2026 and leap 2028)', async () => {
  eq(await next('2026-01-31', 'month', 1, '2026-01-31'), '2026-02-28', 'Feb 2026');
  eq(await next('2026-01-31', 'month', 1, '2026-02-28'), '2026-03-31', 'Mar 2026');
  eq(await next('2026-01-31', 'month', 1, '2026-03-31'), '2026-04-30', 'Apr 2026');
  eq(await next('2028-01-31', 'month', 1, '2028-01-31'), '2028-02-29', 'Feb 2028');
  eq(await next('2028-01-31', 'month', 1, '2028-02-29'), '2028-03-31', 'Mar 2028');
});
await test('yearly Feb 29, weekly and every-3-months schedules', async () => {
  eq(await next('2024-02-29', 'year', 1, '2024-02-29'), '2025-02-28', 'yearly 2025');
  eq(await next('2024-02-29', 'year', 1, '2027-02-28'), '2028-02-29', 'yearly 2028');
  eq(await next('2026-01-05', 'week', 2, '2026-01-05'), '2026-01-19', 'biweekly');
  eq(await next('2026-01-05', 'week', 2, '2026-01-20'), '2026-02-02', 'biweekly off-grid');
  eq(await next('2025-11-30', 'month', 3, '2025-11-30'), '2026-02-28', 'quarterly clamp');
  eq(await next('2025-11-30', 'month', 3, '2026-02-28'), '2026-05-30', 'quarterly no drift');
  eq(await next('2026-01-31', 'month', 1, '2025-12-01'), '2026-01-31', 'before anchor');
});

await test('mark_bill_paid inserts the transaction and advances Jan 31 -> Feb 28 -> Mar 31 -> Apr 30', async () => {
  const seen = [];
  for (const paid of ['2026-01-31', '2026-02-27', '2026-03-31']) {
    const r = await one(asUser(A, `select transaction_id, next_due_on::text from public.mark_bill_paid($1, $2)`, [ids.A.recurring, paid]));
    seen.push(r.next_due_on.slice(0, 10));
    const t = await one(sql(`select kind, amount_minor, from_account_id, category_id, description, recurring_item_id, occurred_on::text
                               from public.transactions where id = $1`, [r.transaction_id]));
    eq([t.kind, num(t.amount_minor), t.from_account_id, t.category_id, t.recurring_item_id, t.occurred_on.slice(0, 10)],
       ['expense', 120000, ids.A.chk, ids.A.rent, ids.A.recurring, paid], 'inserted transaction');
  }
  eq(seen, ['2026-02-28', '2026-03-31', '2026-04-30'], 'due dates');
});
await test('mark_bill_paid accepts an amount override', async () => {
  const r = await one(asUser(A, `select transaction_id from public.mark_bill_paid($1, $2, 99999)`, [ids.A.recurring, '2026-04-30']));
  eq(num((await one(sql('select amount_minor from public.transactions where id = $1', [r.transaction_id]))).amount_minor), 99999, 'amount');
});
await test('mark_bill_paid is atomic: a failed insert leaves next_due_on unchanged', async () => {
  const before = await one(sql(`select next_due_on::text as d from public.recurring_items where id = $1`, [ids.A.recurring]));
  const count = await one(sql(`select count(*)::int as n from public.transactions where recurring_item_id = $1`, [ids.A.recurring]));
  await expectError(asUser(A, `select * from public.mark_bill_paid($1, '1960-01-01')`, [ids.A.recurring]), /lower_bound/, 'bad date');
  await expectError(asUser(A, `select * from public.mark_bill_paid($1, $2, 0)`, [ids.A.recurring, monthStart]), /amount_positive/, 'bad amount');
  const after = await one(sql(`select next_due_on::text as d from public.recurring_items where id = $1`, [ids.A.recurring]));
  const count2 = await one(sql(`select count(*)::int as n from public.transactions where recurring_item_id = $1`, [ids.A.recurring]));
  eq([after.d, count2.n], [before.d, count.n], 'unchanged');
});
await test('mark_bill_paid refuses archived items', async () => {
  await db.exec('begin');
  await asUser(A, `update public.recurring_items set archived_at = now() where id = $1`, [ids.A.recurring]);
  await expectError(asUser(A, `select * from public.mark_bill_paid($1, $2)`, [ids.A.recurring, monthStart]), /archived/, 'archived');
});
await test('deleting a recurring item keeps its transactions and nulls only the link', async () => {
  await db.exec('begin');
  const n = await one(sql(`select count(*)::int as n from public.transactions where recurring_item_id = $1`, [ids.A.recurring]));
  await asUser(A, `delete from public.recurring_items where id = $1`, [ids.A.recurring]);
  const orphans = await one(sql(`select count(*)::int as n from public.transactions
                                   where user_id = $1 and description = 'Synthetic rent' and recurring_item_id is null`, [A]));
  eq(orphans.n, n.n, 'transactions kept with null link');
});

// ===========================================================================
group('copy_budgets');

await test('copies missing rows and never overwrites existing ones', async () => {
  await insertAs(A, 'budgets', { category_id: ids.A.groceries, month: nextMonth, amount_minor: 22222 });
  const n = await one(asUser(A, `select public.copy_budgets($1, $2) as n`, [monthStart, nextMonth]));
  eq(n.n, 1, 'rows inserted');
  const r = await asUser(A, `select category_id, amount_minor from public.budgets where month = $1`, [nextMonth]);
  const by = Object.fromEntries(r.rows.map((x) => [x.category_id, num(x.amount_minor)]));
  eq([by[ids.A.groceries], by[ids.A.rent]], [22222, 100000], 'next month plan');
  const again = await one(asUser(A, `select public.copy_budgets($1, $2) as n`, [monthStart, nextMonth]));
  eq(again.n, 0, 'second run inserts nothing');
});
await test('copies only the caller\'s budgets', async () => {
  const n = await one(asUser(B, `select public.copy_budgets($1, $2) as n`, [monthStart, nextMonth]));
  eq(n.n, 1, "B's single budget");
  const aNext = await one(sql(`select count(*)::int as n from public.budgets where user_id = $1 and month = $2`, [A, nextMonth]));
  eq(aNext.n, 2, "A's next month untouched");
});
await test('rejects months that are not the first day', async () => {
  await expectError(asUser(A, `select public.copy_budgets($1, '2026-10-15')`, [monthStart]), /first day/, 'mid-month');
});

// ===========================================================================
group('import_transactions');

const importRows = () => [
  { kind: 'expense', occurred_on: monthStart, amount_minor: 1250, from_account_id: ids.A.chk, category_id: ids.A.food, description: 'Synthetic lunch', source_ref: 'csv:synthetic-1' },
  { kind: 'income', occurred_on: monthStart, amount_minor: 5000, to_account_id: ids.A.chk, description: 'Synthetic refund', source_ref: 'csv:synthetic-2' },
  { kind: 'transfer', occurred_on: monthStart, amount_minor: 700, from_account_id: ids.A.chk, to_account_id: ids.A.sav, description: 'Synthetic top-up', source_ref: 'csv:synthetic-3' },
  { kind: 'expense', occurred_on: monthStart, amount_minor: 1250, from_account_id: ids.A.chk, category_id: ids.A.food, description: 'Synthetic lunch', source_ref: 'csv:synthetic-1' },
];
const countImported = async () =>
  (await one(sql(`select count(*)::int as n from public.transactions where user_id = $1 and source_ref like 'csv:synthetic-%'`, [A]))).n;

await test('first run inserts each source_ref once', async () => {
  const r = await one(asUser(A, `select * from public.import_transactions($1, $2)`,
    [JSON.stringify({ source: 'csv', filename: 'synthetic.csv' }), JSON.stringify(importRows())]));
  ids.A.importBatch = r.batch_id;
  eq([r.inserted_count, r.duplicate_count], [3, 1], 'counts');
  eq(await countImported(), 3, 'rows');
});
await test('second run inserts nothing new', async () => {
  const r = await one(asUser(A, `select * from public.import_transactions($1, $2)`,
    [JSON.stringify({ source: 'csv' }), JSON.stringify(importRows())]));
  eq([r.inserted_count, r.duplicate_count], [0, 4], 'counts');
  eq(await countImported(), 3, 'rows');
});
await test('one invalid row aborts the whole import (no batch, no rows)', async () => {
  const batches = (await one(sql(`select count(*)::int as n from public.import_batches where user_id = $1`, [A]))).n;
  const rows = [
    { kind: 'expense', occurred_on: monthStart, amount_minor: 10, from_account_id: ids.A.chk, description: 'ok', source_ref: 'csv:synthetic-4' },
    { kind: 'transfer', occurred_on: monthStart, amount_minor: 10, from_account_id: ids.A.chk, to_account_id: ids.A.sav, category_id: ids.A.food, description: 'bad', source_ref: 'csv:synthetic-5' },
  ];
  await expectError(asUser(A, `select * from public.import_transactions($1, $2)`, [JSON.stringify({ source: 'csv' }), JSON.stringify(rows)]),
    /category_on_transfer/, 'bad row');
  eq(await countImported(), 3, 'rows');
  eq((await one(sql(`select count(*)::int as n from public.import_batches where user_id = $1`, [A]))).n, batches, 'batches');
});
await test('rows without source_ref are refused', async () => {
  const rows = [{ kind: 'expense', occurred_on: monthStart, amount_minor: 10, from_account_id: ids.A.chk, description: 'x' }];
  await expectError(asUser(A, `select * from public.import_transactions($1, $2)`, [JSON.stringify({ source: 'csv' }), JSON.stringify(rows)]),
    /source_ref/, 'no ref');
});
await test("an import cannot reference another user's account", async () => {
  const rows = [{ kind: 'expense', occurred_on: monthStart, amount_minor: 10, from_account_id: ids.A.chk, description: 'x', source_ref: 'csv:b-1' }];
  await expectError(asUser(B, `select * from public.import_transactions($1, $2)`, [JSON.stringify({ source: 'csv' }), JSON.stringify(rows)]),
    /foreign key/, 'cross-user import');
});
await test('import is audited for the caller, with a count and no amounts', async () => {
  const r = await asUser(A, `select user_id, event, subject_id, row_count from public.audit_events where event = 'import' order by id`);
  eq(r.rows.map((x) => [x.user_id, x.subject_id === ids.A.importBatch || x.row_count === 0, x.row_count]),
     [[A, true, 3], [A, true, 0]], 'audit rows');
  const cols = (await sql(`select column_name from information_schema.columns where table_schema = 'public' and table_name = 'audit_events' order by ordinal_position`)).rows.map((x) => x.column_name);
  eq(cols, ['id', 'user_id', 'event', 'subject_id', 'row_count', 'created_at', 'updated_at'], 'audit columns');
});
await test('deleting the batch undoes the import', async () => {
  await db.exec('begin');
  const r = await asUser(A, `delete from public.import_batches where id = $1`, [ids.A.importBatch]);
  eq(r.affectedRows, 1, 'batch deleted');
  eq(await countImported(), 0, 'rows removed');
});
await test('only status is updatable on a batch', async () => {
  eq((await asUser(A, `update public.import_batches set status = 'reconciled' where id = $1`, [ids.A.importBatch])).affectedRows, 1, 'status');
  await expectError(asUser(A, `update public.import_batches set row_count = 1 where id = $1`, [ids.A.importBatch]), /permission denied/, 'row_count');
});

// ===========================================================================
group('merge_categories');

await test('moves transactions and budgets, then deletes the source', async () => {
  await db.exec('begin');
  await insertAs(A, 'budgets', { category_id: ids.A.food, month: monthStart, amount_minor: 3000 });
  const moved = await one(asUser(A, `select public.merge_categories($1, $2) as n`, [ids.A.food, ids.A.groceries]));
  eq(moved.n, 1, 'transactions moved');
  const b = await one(asUser(A, `select amount_minor from public.budgets where category_id = $1 and month = $2`, [ids.A.groceries, monthStart]));
  eq(num(b.amount_minor), 23000, 'budgets summed');
  eq((await sql(`select 1 from public.categories where id = $1`, [ids.A.food])).rows.length, 0, 'source deleted');
});
await test('refuses to merge categories of different kinds', async () => {
  await expectError(asUser(A, `select public.merge_categories($1, $2)`, [ids.A.food, ids.A.salary]), /same kind/, 'kinds');
});
await test("cannot merge another user's category", async () => {
  await expectError(asUser(B, `select public.merge_categories($1, $2)`, [ids.B.cat, ids.A.groceries]), /not found/, 'cross-user');
});

// ===========================================================================
group('Audit log');

await test('log_event always records the caller\'s own id', async () => {
  await asUser(B, `select public.log_event('bulk_delete', null, 12)`);
  const r = await asUser(B, `select user_id, event, row_count from public.audit_events`);
  eq(r.rows.map((x) => [x.user_id, x.event, x.row_count]), [[B, 'bulk_delete', 12]], 'B events');
});
await test('log_event accepts only the fixed events', async () => {
  await expectError(asUser(A, `select public.log_event('delete_everything')`), /invalid input value for enum/, 'unknown event');
});
await test('clients cannot insert, update or delete audit events', async () => {
  await expectError(asUser(A, `insert into public.audit_events (event) values ('export')`), /permission denied/, 'insert');
  await expectError(asUser(A, `update public.audit_events set row_count = 1`), /permission denied/, 'update');
  await expectError(asUser(A, `delete from public.audit_events`), /permission denied/, 'delete');
});
await test('log_event requires a signed-in caller', async () => {
  await expectError(asAnon(`select public.log_event('export')`), /permission denied/, 'anon');
});

// ===========================================================================
group('Overview dashboard: month_to_date and budget_pace (hand-computed)');

// A third person with a fixed calendar, so every figure can be worked out by
// hand: today is Tue 10 March 2026 (day 10 of 31).
//   Sep 2025 - Feb 2026, except an empty November: salary 3,000.00 on the 1st,
//   1,000.00 into the goal fund on the 2nd, groceries 100.00 on the 5th and
//   200.00 on the 20th (after day 10, so not counted at that day).
//   March 2026: salary 3,000.00 on the 1st, rent 1,500.00 on the 1st, 50.00
//   into the fund on the 2nd, a lesson 20.00 on the 3rd, groceries 70.00 on
//   the 4th and 99.99 on the 15th, fun 15.00 on the 6th.
const C = '00000000-0000-4000-8000-00000000000c';
const c = {};
const TODAY = '2026-03-10';

await test('user C sets up a fixed six months of history', async () => {
  await sql(`insert into auth.users (id, email, raw_user_meta_data) values ($1, 'user-c@example.test', '{}')`, [C]);
  c.chk = (await insertAs(C, 'accounts', { name: 'C Checking', type: 'checking' })).id;
  c.fund = (await insertAs(C, 'accounts', { name: 'C Fund', type: 'savings' })).id;
  await insertAs(C, 'goals', { account_id: c.fund, name: 'C goal' });
  c.salary = (await insertAs(C, 'categories', { name: 'C salary', kind: 'income' })).id;
  c.rent = (await insertAs(C, 'categories', { name: 'C rent', kind: 'expense' })).id;
  c.groceries = (await insertAs(C, 'categories', { name: 'C groceries', kind: 'expense' })).id;
  c.lessons = (await insertAs(C, 'categories', { name: 'C lessons', kind: 'expense' })).id;
  c.fun = (await insertAs(C, 'categories', { name: 'C fun', kind: 'expense' })).id;
  const t = (row) => insertAs(C, 'transactions', { description: 'Synthetic', ...row });
  for (const m of ['2025-09', '2025-10', '2025-12', '2026-01', '2026-02']) {
    await t({ kind: 'income', occurred_on: `${m}-01`, amount_minor: 300000, to_account_id: c.chk, category_id: c.salary });
    await t({ kind: 'transfer', occurred_on: `${m}-02`, amount_minor: 100000, from_account_id: c.chk, to_account_id: c.fund });
    await t({ kind: 'expense', occurred_on: `${m}-05`, amount_minor: 10000, from_account_id: c.chk, category_id: c.groceries });
    await t({ kind: 'expense', occurred_on: `${m}-20`, amount_minor: 20000, from_account_id: c.chk, category_id: c.groceries });
  }
  c.rentBill = (await insertAs(C, 'recurring_items', {
    name: 'C rent', label: 'bill', kind: 'expense', amount_minor: 150000, from_account_id: c.chk, category_id: c.rent,
    cadence_unit: 'month', anchor_on: '2025-09-01', next_due_on: '2026-04-01' })).id;
  // Weekly, on Tuesdays: Mar 3, 10, 17, 24 and 31.
  await insertAs(C, 'recurring_items', {
    name: 'C lesson', label: 'subscription', kind: 'expense', amount_minor: 2000, from_account_id: c.chk,
    category_id: c.lessons, cadence_unit: 'week', anchor_on: '2026-02-24', next_due_on: '2026-03-10' });
  await t({ kind: 'income', occurred_on: '2026-03-01', amount_minor: 300000, to_account_id: c.chk, category_id: c.salary });
  await t({ kind: 'expense', occurred_on: '2026-03-01', amount_minor: 150000, from_account_id: c.chk, category_id: c.rent, recurring_item_id: c.rentBill });
  await t({ kind: 'transfer', occurred_on: '2026-03-02', amount_minor: 5000, from_account_id: c.chk, to_account_id: c.fund });
  await t({ kind: 'expense', occurred_on: '2026-03-03', amount_minor: 2000, from_account_id: c.chk, category_id: c.lessons });
  await t({ kind: 'expense', occurred_on: '2026-03-04', amount_minor: 7000, from_account_id: c.chk, category_id: c.groceries });
  await t({ kind: 'expense', occurred_on: '2026-03-15', amount_minor: 9999, from_account_id: c.chk, category_id: c.groceries });
  await t({ kind: 'expense', occurred_on: '2026-03-06', amount_minor: 1500, from_account_id: c.chk, category_id: c.fun });
  for (const [category_id, amount_minor] of [[c.rent, 150000], [c.groceries, 40000], [c.lessons, 10000], [c.fun, 1000]]) {
    await insertAs(C, 'budgets', { category_id, month: '2026-03-01', amount_minor });
  }
});

await test('month_to_date cuts this month and the typical month at the same day', async () => {
  const r = await one(asUser(C, `select *, month::text as month_text from public.month_to_date('2026-03-01', $1)`, [TODAY]));
  eq([r.month_text, r.day_of_month, r.days_in_month], ['2026-03-01', 10, 31], 'day of month');
  // March to day 10: salary in; rent, lesson, groceries 70.00 and fun out (not the 99.99 on the 15th).
  eq([num(r.money_in_minor), num(r.money_out_minor), num(r.to_goals_minor)], [300000, 160500, 5000], 'so far');
  // Five active months, each to day 10: salary, groceries 100.00, 1,000.00 into the fund. November is left out.
  eq([num(r.typical_in_minor), num(r.typical_out_minor), num(r.typical_to_goals_minor), r.typical_months],
     [300000, 10000, 100000, 5], 'typical');
});

await test('month_to_date compares a past month whole, and a future month at day 0', async () => {
  const past = await one(asUser(C, `select * from public.month_to_date('2026-02-01', $1)`, [TODAY]));
  eq([past.day_of_month, past.days_in_month, num(past.money_out_minor)], [28, 28, 30000], 'February whole');
  const future = await one(asUser(C, `select * from public.month_to_date('2026-04-01', $1)`, [TODAY]));
  eq([future.day_of_month, num(future.money_in_minor), num(future.money_out_minor)], [0, 0, 0], 'April not begun');
});

await test('budget_pace counts bills on their due dates and spreads the rest of the plan', async () => {
  const rows = (await asUser(C, `select category_name, planned_minor, spent_minor, bills_month_minor, bills_due_minor,
                                        pace_minor, gap_minor, days_left, per_day_minor, status
                                   from public.budget_pace('2026-03-01', $1)`, [TODAY])).rows
    .map((x) => [x.category_name, num(x.planned_minor), num(x.spent_minor), num(x.bills_month_minor),
      num(x.bills_due_minor), num(x.pace_minor), num(x.gap_minor), x.days_left, num(x.per_day_minor), x.status]);
  eq(rows, [
    // Plan 10.00, spent 15.00: over plan, nothing left per day.
    ['C fun', 1000, 1500, 0, 0, 323, 1177, 21, 0, 'over'],
    // No bills: 400.00 x 10/31 = 129.03 on pace; 169.99 spent (the 15th is in the month already).
    ['C groceries', 40000, 16999, 0, 0, 12903, 4096, 21, 1095, 'ahead'],
    // Five Tuesdays at 20.00; two are due by the 10th.
    ['C lessons', 10000, 2000, 10000, 4000, 4000, -2000, 21, 380, 'on_pace'],
    // Rent paid on the 1st, as the bill says: on pace, not 1,016.13 ahead.
    ['C rent', 150000, 150000, 150000, 150000, 150000, 0, 21, 0, 'on_pace'],
  ], 'March 2026 on the 10th');
});

await test('daily_spending runs the month day by day against a typical month, and ends at money out', async () => {
  const rows = (await asUser(C, `select day::text as day, day_of_month, spent_minor, running_minor, typical_running_minor,
                                        typical_months, after_today
                                   from public.daily_spending('2026-03-01', null, $1)`, [TODAY])).rows;
  eq(rows.length, 31, 'a row for every day of March');
  const at = (d) => rows[d - 1];
  const view = (d) => [num(at(d).spent_minor), num(at(d).running_minor), num(at(d).typical_running_minor)];
  // Rent 1,500.00 on the 1st; a typical month has spent nothing by then.
  eq(view(1), [150000, 150000, 0], 'the 1st');
  // Lesson on the 3rd, groceries on the 4th; typical groceries 100.00 land on the 5th.
  eq(view(4), [7000, 159000, 0], 'the 4th');
  eq(view(5), [0, 159000, 10000], 'the 5th');
  eq(view(20), [0, 170499, 30000], 'the 20th, after the 99.99 on the 15th');
  // The last day is the month's money out to the cent, and February (28 days)
  // holds its whole-month total on the 29th to the 31st.
  eq(view(31), [0, 170499, 30000], 'the 31st');
  eq([at(1).typical_months, at(10).after_today, at(11).after_today], [5, false, true], 'months used, and today');
});

await test('daily_spending narrows to a category, and a past month has no day after today', async () => {
  const g = (await asUser(C, `select running_minor, typical_running_minor from public.daily_spending('2026-03-01', $1, $2)`,
    [c.groceries, TODAY])).rows;
  eq([num(g[2].running_minor), num(g[3].running_minor), num(g[14].running_minor), num(g[30].typical_running_minor)],
     [0, 7000, 16999, 30000], 'groceries only');
  const feb = (await asUser(C, `select after_today, running_minor from public.daily_spending('2026-02-01', null, $1)`, [TODAY])).rows;
  eq([feb.length, feb.some((r) => r.after_today), num(feb[27].running_minor)], [28, false, 30000], 'February whole');
});

await test('month_categories compares each category so far with a typical month cut at the same day', async () => {
  const rows = (await asUser(C, `select category_id, spent_minor, typical_minor, typical_months
                                   from public.month_categories('2026-03-01', $1)`, [TODAY])).rows
    .map((x) => [x.category_id, num(x.spent_minor), num(x.typical_minor), x.typical_months]);
  eq(rows, [
    [c.rent, 150000, 0, 5],
    // 70.00 so far (the 99.99 on the 15th is after today); 100.00 by the 10th in a typical month.
    [c.groceries, 7000, 10000, 5],
    [c.lessons, 2000, 0, 5],
    [c.fun, 1500, 0, 5],
  ], 'March to the 10th');
  const feb = (await asUser(C, `select category_id, spent_minor, typical_minor, typical_months
                                  from public.month_categories('2026-02-01', $1)`, [TODAY])).rows
    .map((x) => [x.category_id, num(x.spent_minor), num(x.typical_minor), x.typical_months]);
  // Aug - Jan, with August (before tracking) and November (empty) left out.
  eq(feb, [[c.groceries, 30000, 30000, 4]], 'February whole');
});

await test('category_stats gives a category its range, trend, share and plans over 12 complete months', async () => {
  const r = await one(asUser(C, `select * from public.category_stats($1, '2026-03-01')`, [c.groceries]));
  eq([num(r.this_month_minor), num(r.plan_minor)], [16999, 40000], 'March, whole, and its plan');
  // First used in September: six months, November quiet at zero.
  eq([num(r.typical_minor), num(r.low_minor), num(r.high_minor), r.months], [25000, 0, 30000, 6], 'range');
  eq([num(r.last3_minor), num(r.prev3_minor)], [90000, 60000], 'Dec - Feb against Sep - Nov');
  eq([num(r.total_minor), num(r.kind_total_minor), r.rank, r.ranked], [150000, 150000, 1, 1], 'share and rank');
  eq([r.planned_months, r.over_plan_months], [0, 0], 'no plans before March');
  const unused = await one(asUser(C, `select typical_minor, months, rank from public.category_stats($1, '2026-03-01')`, [c.fun]));
  eq([unused.typical_minor, unused.months, unused.rank], [null, 0, null], 'a category first used this month');
});

await test('category_month_totals counts spending with no category as one row a month', async () => {
  const loose = await insertAs(C, 'transactions', {
    kind: 'expense', occurred_on: '2026-03-08', amount_minor: 1234, from_account_id: c.chk, description: 'Synthetic',
  });
  try {
    const rows = (await asUser(C, `select category_id, kind, total_minor, txn_count from public.category_month_totals
                                     where month = '2026-03-01' and category_id is null`)).rows;
    eq(rows.map((x) => [x.kind, num(x.total_minor), num(x.txn_count)]), [['expense', 1234, 1]], 'March, uncategorized');
    const mc = (await asUser(C, `select spent_minor from public.month_categories('2026-03-01', $1) where category_id is null`, [TODAY])).rows;
    eq(mc.map((x) => num(x.spent_minor)), [1234], 'month_categories has it too');
  } finally {
    await asUser(C, `delete from public.transactions where id = $1`, [loose.id]);
  }
});

await test('report_category_months splits each month\'s spending by category, largest first', async () => {
  const rows = (await asUser(C, `select category_id, month::text as month, total_minor
                                   from public.report_category_months('2026-02-01', '2026-04-01')`)).rows
    .map((x) => [x.category_id, x.month.slice(0, 10), num(x.total_minor)]);
  eq(rows, [
    [c.groceries, '2026-02-01', 30000],
    [c.rent, '2026-03-01', 150000],
    [c.groceries, '2026-03-01', 16999],
    [c.lessons, '2026-03-01', 2000],
    [c.fun, '2026-03-01', 1500],
  ], 'February and March');
  eq((await asUser(C, `select * from public.report_category_months('2026-02-01', '2026-04-01', array[$1]::uuid[])`, [c.fund])).rows.length,
     0, 'nothing left the fund');
});

await test('report_category_totals ranks the period and gives the comparison period of the same length', async () => {
  const rows = (await asUser(C, `select category_id, total_minor, txn_count, compare_minor
                                   from public.report_category_totals('2025-12-01', '2026-04-01', '2025-08-01')`)).rows
    .map((x) => [x.category_id, num(x.total_minor), x.txn_count, num(x.compare_minor)]);
  eq(rows, [
    [c.rent, 150000, 1, 0],
    // Dec, Jan, Feb at 300.00 and March's 169.99; Aug - Nov had Sep and Oct.
    [c.groceries, 106999, 8, 60000],
    [c.lessons, 2000, 1, 0],
    [c.fun, 1500, 1, 0],
  ], 'Dec - Mar against Aug - Nov');
  // The categories add up to report_summary's money out, to the cent.
  const out = await one(asUser(C, `select money_out_minor from public.report_summary('2025-12-01', '2026-04-01', '2025-08-01')
                                    where period = 'current'`));
  eq(rows.reduce((sum, x) => sum + x[1], 0), num(out.money_out_minor), 'adds up to money out');
});

await test('budget_month_results gives each plan its spending and agrees with budget_progress', async () => {
  const rows = (await asUser(C, `select category_id, month::text as month, planned_minor, spent_minor, within_plan
                                   from public.budget_month_results('2026-02-01', '2026-04-01')`)).rows
    .map((x) => [x.category_id, x.month.slice(0, 10), x.planned_minor === null ? null : num(x.planned_minor), num(x.spent_minor), x.within_plan]);
  eq(rows, [
    // February had no plans: spending without one.
    [c.groceries, '2026-02-01', null, 30000, null],
    [c.rent, '2026-03-01', 150000, 150000, true],
    [c.groceries, '2026-03-01', 40000, 16999, true],
    [c.lessons, '2026-03-01', 10000, 2000, true],
    [c.fun, '2026-03-01', 1000, 1500, false],
  ], 'February and March');
  const progress = (await asUser(C, `select category_id, spent_minor from public.budget_progress where month = '2026-03-01'`)).rows;
  for (const p of progress) {
    eq(num(rows.find((r) => r[0] === p.category_id && r[1] === '2026-03-01')[3]), num(p.spent_minor), 'spent agrees');
  }
});

await test('budget_month_summary sums the month and counts plans held over 12 months', async () => {
  const r = await one(asUser(C, `select *, first_month::text as first from public.budget_month_summary('2026-03-01')`));
  eq([num(r.planned_minor), num(r.spent_planned_minor), num(r.unplanned_minor), num(r.uncategorized_minor)],
     [201000, 170499, 0, 0], 'March');
  eq([r.lines, r.within, r.history_lines, r.history_within, r.first.slice(0, 10)], [4, 3, 4, 3, '2026-03-01'], 'held');
});

await test('goal_month_flow gives each goal what went in and out, and its balance at month end', async () => {
  const rows = (await asUser(C, `select month::text as month, put_in_minor, taken_out_minor, closing_balance_minor
                                   from public.goal_month_flow where month >= '2026-01-01' order by month`)).rows
    .map((x) => [x.month.slice(0, 10), num(x.put_in_minor), num(x.taken_out_minor), num(x.closing_balance_minor)]);
  eq(rows.slice(0, 3), [
    ['2026-01-01', 100000, 0, 400000],
    ['2026-02-01', 100000, 0, 500000],
    ['2026-03-01', 5000, 0, 505000],
  ], 'Jan - Mar');
});

await test('goal_progress gives the monthly need, the recent pace and an estimate from 3 months of it', async () => {
  // D's dates follow the real calendar, as goal_progress does.
  const D = '00000000-0000-4000-8000-00000000000d';
  await sql(`insert into auth.users (id, email, raw_user_meta_data) values ($1, 'user-d@example.test', '{"timezone":"UTC"}')`, [D]);
  const chk = (await insertAs(D, 'accounts', { name: 'D Checking', type: 'checking' })).id;
  const fund = (await insertAs(D, 'accounts', { name: 'D Fund', type: 'savings' })).id;
  const now = new Date();
  const monthOf = (k) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + k, 1)).toISOString().slice(0, 10);
  await insertAs(D, 'goals', { account_id: fund, name: 'D goal', target_minor: 1000000, target_date: monthOf(10) });
  for (const k of [-1, -2, -3]) {
    await insertAs(D, 'transactions', {
      kind: 'transfer', occurred_on: monthOf(k), amount_minor: 20000, from_account_id: chk, to_account_id: fund, description: 'Synthetic',
    });
  }
  const r = await one(asUser(D, `select needed_monthly_minor, avg_put_in_minor, months_put_in, estimated_month::text as est
                                  from public.goal_progress`));
  // 9,400.00 to go over 10 months; 600.00 over 6 months is 100.00 a month,
  // so 94 months at that pace.
  eq([num(r.needed_monthly_minor), num(r.avg_put_in_minor), r.months_put_in, r.est.slice(0, 10)],
     [94000, 10000, 3, monthOf(94)], 'D goal');
  await sql(`delete from auth.users where id = $1`, [D]);
});

await test('recurring_costs prices each bill a year, and report_fixed_flexible splits spending by it', async () => {
  const rows = (await asUser(C, `select recurring_item_id, yearly_minor, paid_12m_minor, payments_12m, total_yearly_minor,
                                        total_monthly_minor, subscriptions_yearly_minor, items
                                   from public.recurring_costs($1)`, [TODAY])).rows
    .map((x) => [x.recurring_item_id === c.rentBill ? 'rent' : 'lesson', num(x.yearly_minor), num(x.paid_12m_minor), x.payments_12m,
      num(x.total_yearly_minor), num(x.total_monthly_minor), num(x.subscriptions_yearly_minor), x.items]);
  eq(rows, [
    // 1,500.00 a month; paid once (March) through Mark as paid.
    ['rent', 1800000, 150000, 1, 1904000, 158667, 104000, 2],
    // 20.00 a week, 52 weeks.
    ['lesson', 104000, 0, 0, 1904000, 158667, 104000, 2],
  ], 'C at the 10th of March');
  const split = (await asUser(C, `select month::text as m, fixed_minor, flexible_minor, fixed_total_minor, all_total_minor
                                    from public.report_fixed_flexible('2026-02-01', '2026-04-01')`)).rows
    .map((x) => [x.m.slice(0, 10), num(x.fixed_minor), num(x.flexible_minor), num(x.fixed_total_minor), num(x.all_total_minor)]);
  eq(split, [
    ['2026-02-01', 0, 30000, 150000, 200499],
    ['2026-03-01', 150000, 20499, 150000, 200499],
  ], 'fixed is what was paid through a bill');
});

// A fifth person for the safety reports, with cards, a loan and repeating
// expenses, everything from September 2025 to February 2026 (and the card
// payment for February on March 3). Today is March 10.
const E = '00000000-0000-4000-8000-00000000000e';
const e = {};

await test('user E sets up cards, a loan and repeating expenses', async () => {
  await sql(`insert into auth.users (id, email, raw_user_meta_data) values ($1, 'user-e@example.test', '{"timezone":"UTC"}')`, [E]);
  e.chk = (await insertAs(E, 'accounts', { name: 'E Checking', type: 'checking', opening_balance_minor: 500000 })).id;
  e.wallet = (await insertAs(E, 'accounts', { name: 'E Wallet', type: 'cash', opening_balance_minor: 20000 })).id;
  e.card = (await insertAs(E, 'accounts', { name: 'E Card', type: 'credit_card' })).id;
  e.fund = (await insertAs(E, 'accounts', { name: 'E Fund', type: 'savings' })).id;
  e.loan = (await insertAs(E, 'accounts', { name: 'E Loan', type: 'loan', opening_balance_minor: -1200000 })).id;
  await insertAs(E, 'goals', { account_id: e.fund, name: 'E goal' });
  await insertAs(E, 'recurring_items', {
    name: 'Rent', label: 'bill', kind: 'expense', amount_minor: 100000, from_account_id: e.chk,
    cadence_unit: 'month', anchor_on: '2025-10-01', next_due_on: '2026-03-01' });
  const t = (row) => insertAs(E, 'transactions', row);
  const months = ['2025-09', '2025-10', '2025-11', '2025-12', '2026-01', '2026-02'];
  for (const [i, m] of months.entries()) {
    await t({ kind: 'income', occurred_on: `${m}-01`, amount_minor: 300000, to_account_id: e.chk, description: 'Salary' });
    await t({ kind: 'transfer', occurred_on: `${m}-02`, amount_minor: 10000, from_account_id: e.chk, to_account_id: e.fund, description: 'To fund' });
    await t({ kind: 'expense', occurred_on: `${m}-05`, amount_minor: 40000, from_account_id: e.chk, description: 'Groceries run' });
    await t({ kind: 'expense', occurred_on: `${m}-10`, amount_minor: 999, from_account_id: e.card, description: 'Streaming' });
    await t({ kind: 'transfer', occurred_on: `${m}-20`, amount_minor: 30000, from_account_id: e.chk, to_account_id: e.loan, description: 'Loan payment' });
    const next = months[i + 1] ?? '2026-03';
    await t({ kind: 'transfer', occurred_on: `${next}-03`, amount_minor: 999, from_account_id: e.chk, to_account_id: e.card, description: 'Card payment' });
    // Rent by hand, never through Mark as paid; its name is a bill's.
    if (i > 0) await t({ kind: 'expense', occurred_on: `${m}-01`, amount_minor: 100000, from_account_id: e.chk, description: 'Rent' });
  }
  for (const m of ['2025-11', '2025-12', '2026-01']) {
    await t({ kind: 'expense', occurred_on: `${m}-15`, amount_minor: 4500, from_account_id: e.chk, description: 'Gym' });
  }
  for (const [m, amount] of [['2025-12', 1000], ['2026-01', 2000], ['2026-02', 1000]]) {
    await t({ kind: 'expense', occurred_on: `${m}-12`, amount_minor: amount, from_account_id: e.chk, description: 'Cafe' });
  }
});

await test('possible_recurring finds steady repeating expenses, and leaves out bills and uneven ones', async () => {
  const rows = (await asUser(E, `select description, typical_minor, yearly_minor, months_seen, run_months, last_on::text as last,
                                        confidence, found, found_yearly_minor
                                   from public.possible_recurring('2025-09-01')`)).rows
    .map((x) => [x.description, num(x.typical_minor), num(x.yearly_minor), x.months_seen, x.run_months, x.last.slice(0, 10),
      x.confidence, x.found, num(x.found_yearly_minor)]);
  // Rent is a bill's name; Cafe varies by more than 10%.
  eq(rows, [
    ['Groceries run', 40000, 480000, 6, 6, '2026-02-05', 'medium', 3, 545988],
    ['Gym', 4500, 54000, 3, 3, '2026-01-15', 'medium', 3, 545988],
    ['Streaming', 999, 11988, 6, 6, '2026-02-10', 'medium', 3, 545988],
  ], 'E since September');
  // Set up as a bill, Streaming leaves the list.
  const bill = await insertAs(E, 'recurring_items', {
    name: 'Streaming', label: 'subscription', kind: 'expense', amount_minor: 999, from_account_id: e.card,
    cadence_unit: 'month', anchor_on: '2026-03-10', next_due_on: '2026-03-10' });
  const after = (await asUser(E, `select description from public.possible_recurring('2025-09-01')`)).rows.map((x) => x.description);
  eq(after, ['Groceries run', 'Gym'], 'after the bill');
  await asUser(E, `delete from public.recurring_items where id = $1`, [bill.id]);
});

await test('cash_runway works out every line it shows, and the months each covers', async () => {
  const rows = (await asUser(E, `select line, name, amount_minor, months, n from public.cash_runway(6, null, $1)`, [TODAY])).rows
    .map((x) => [x.line, x.name, num(x.amount_minor), x.months === null ? null : Number(x.months), x.n]);
  eq(rows, [
    // 5,000.00 + 18,000.00 in, less groceries, rent, gym, cafe, the loan,
    // the fund and six card payments of 9.99.
    ['account', 'E Checking', 1296506, null, null],
    ['account', 'E Wallet', 20000, null, null],
    // Six purchases of 9.99, six payments: nothing owed now.
    ['account', 'E Card', 0, null, null],
    ['available', null, 1316506, 10.3, null],
    ['goal', 'E Fund', 60000, 0.5, null],
    ['goals', null, 60000, 0.5, null],
    // September to February: 7,634.94 over 6 months.
    ['spending', null, 127249, null, 6],
    ['loan_payments', null, 30000, null, 6],
    ['runway', null, 1376506, 10.8, null],
    ['runway_loans', null, 1376506, 8.8, null],
  ], 'E on March 10');
});

await test('debt_summary follows each card and loan, and estimates the payoff from recent payments', async () => {
  const rows = (await asUser(E, `select name, start_minor, end_minor, balance_minor, paid_minor, purchases_minor,
                                        months_with_purchases, months_paid_full, recent_payment_minor, payments_left,
                                        payoff_month::text as payoff, total_start_minor, total_end_minor, total_paid_minor
                                   from public.debt_summary('2025-09-01', '2026-03-01', $1)`, [TODAY])).rows
    .map((x) => [x.name, num(x.start_minor), num(x.end_minor), num(x.balance_minor), num(x.paid_minor), num(x.purchases_minor),
      x.months_with_purchases, x.months_paid_full, num(x.recent_payment_minor), x.payments_left, x.payoff ? x.payoff.slice(0, 10) : null,
      num(x.total_start_minor), num(x.total_end_minor), num(x.total_paid_minor)]);
  eq(rows, [
    // 10,200.00 still owed at 300.00 a month: 34 payments, the last in December 2028.
    ['E Loan', -1200000, -1020000, -1020000, 180000, 0, 0, 0, 30000, 34, '2028-12-01', -1200000, -1020999, 184995],
    // Each month's purchases paid by the next month's payment, February's on March 3.
    ['E Card', 0, -999, 0, 4995, 5994, 6, 6, 999, null, null, -1200000, -1020999, 184995],
  ], 'September to February');
  await sql(`delete from auth.users where id = $1`, [E]);
});

await test('an account left out of net worth leaves it, history and all, but stays in account_balances', async () => {
  const latest = `select net_worth_minor from public.net_worth_by_month order by month desc limit 1`;
  const held = (await insertAs(C, 'accounts', { name: 'C held for someone', type: 'other_asset', opening_balance_minor: 50000 })).id;
  const withIt = num((await one(asUser(C, latest))).net_worth_minor);
  await asUser(C, `update public.accounts set include_in_net_worth = false where id = $1`, [held]);
  const without = num((await one(asUser(C, latest))).net_worth_minor);
  eq(withIt - without, 50000, 'net worth falls by exactly its balance');
  const row = await one(asUser(C, `select include_in_net_worth, balance_minor from public.account_balances where account_id = $1`, [held]));
  eq([row.include_in_net_worth, num(row.balance_minor)], [false, 50000], 'still listed, with its balance');
  // A new account can start out left out.
  const outside = await insertAs(C, 'accounts', { name: 'C outside', type: 'cash', opening_balance_minor: 700, include_in_net_worth: false });
  eq(outside.include_in_net_worth, false, 'insert grant');
  eq(num((await one(asUser(C, latest))).net_worth_minor), without, 'the new one is left out too');
});

// ===========================================================================
// Reports: C's fixed history again. Each active month Sep 2025 – Feb 2026
// (November empty): +3,000.00 salary, 1,000.00 into the fund, 300.00 out.
// March 2026: +3,000.00, 1,704.99 out, 50.00 into the fund.

await test('report_cash_flow gives every calendar month a row, an empty one as zeros', async () => {
  const rows = (await asUser(C, `select month::text as m, money_in_minor, money_out_minor, net_minor, to_goals_minor,
                                        from_goals_minor, moved_in_minor, moved_out_minor, active
                                   from public.report_cash_flow('2025-09-01', '2026-04-01')`)).rows
    .map((r) => [r.m, num(r.money_in_minor), num(r.money_out_minor), num(r.net_minor), num(r.to_goals_minor),
      num(r.from_goals_minor), num(r.moved_in_minor), num(r.moved_out_minor), r.active]);
  eq(rows, [
    ['2025-09-01', 300000, 30000, 270000, 100000, 0, 0, 0, true],
    ['2025-10-01', 300000, 30000, 270000, 100000, 0, 0, 0, true],
    ['2025-11-01', 0, 0, 0, 0, 0, 0, 0, false],
    ['2025-12-01', 300000, 30000, 270000, 100000, 0, 0, 0, true],
    ['2026-01-01', 300000, 30000, 270000, 100000, 0, 0, 0, true],
    ['2026-02-01', 300000, 30000, 270000, 100000, 0, 0, 0, true],
    ['2026-03-01', 300000, 170499, 129501, 5000, 0, 0, 0, true],
  ], 'Sep 2025 – Mar 2026');
});

await test('report_cash_flow scoped to one account calls transfers moved in or out, never income', async () => {
  const r = await one(asUser(C, `select money_in_minor, money_out_minor, moved_in_minor, moved_out_minor, active
                                   from public.report_cash_flow('2025-09-01', '2025-10-01', array[$1]::uuid[])`, [c.fund]));
  eq([num(r.money_in_minor), num(r.money_out_minor), num(r.moved_in_minor), num(r.moved_out_minor), r.active],
     [0, 0, 100000, 0, false], 'the fund in September');
});

await test('report_summary totals a period and a comparison period of the same length', async () => {
  const rows = (await asUser(C, `select period, period_from::text as f, period_to::text as t, money_in_minor, money_out_minor,
                                        net_minor, to_goals_minor, from_goals_minor, card_payments_minor, loan_payments_minor,
                                        cash_withdrawals_minor, other_transfers_minor, transfers_minor, months, active_months
                                   from public.report_summary('2025-12-01', '2026-04-01', '2025-08-01')`)).rows
    .map((r) => [r.period, r.f, r.t, num(r.money_in_minor), num(r.money_out_minor), num(r.net_minor), num(r.to_goals_minor),
      num(r.from_goals_minor), num(r.card_payments_minor), num(r.loan_payments_minor), num(r.cash_withdrawals_minor),
      num(r.other_transfers_minor), num(r.transfers_minor), r.months, r.active_months]);
  eq(rows, [
    // Dec – Mar: three ordinary months and March.
    ['current', '2025-12-01', '2026-04-01', 1200000, 260499, 939501, 305000, 0, 0, 0, 0, 0, 305000, 4, 4],
    // Aug – Nov: August before tracking began, November empty.
    ['compare', '2025-08-01', '2025-12-01', 600000, 60000, 540000, 200000, 0, 0, 0, 0, 0, 200000, 4, 2],
  ], 'Dec – Mar against Aug – Nov');
});

await test('net_worth_change explains the change in parts that add up to it, to the cent', async () => {
  // C moves 10.00 to an account left out of net worth: it leaves net worth
  // without being spending.
  await insertAs(C, 'transactions', {
    kind: 'transfer', occurred_on: '2026-03-20', amount_minor: 1000, from_account_id: c.chk,
    to_account_id: (await one(sql(`select id from public.accounts where name = 'C held for someone'`))).id,
    description: 'Synthetic',
  });
  const r = await one(asUser(C, `select * from public.net_worth_change('2026-03-01', '2026-04-01')`));
  // Checking 850,000.00 and the fund 500,000.00 at the end of February.
  eq([num(r.start_minor), num(r.end_minor), num(r.change_minor)], [1350000, 1478501, 128501], 'start, end, change');
  eq([num(r.cash_flow_minor), num(r.openings_minor), num(r.moved_minor)], [129501, 0, -1000], 'the parts');
  eq(num(r.cash_flow_minor) + num(r.openings_minor) + num(r.moved_minor), num(r.change_minor), 'they add up');
});

await test('net_worth_by_account gives each account its start, end and change', async () => {
  const rows = (await asUser(C, `select name, include_in_net_worth, start_minor, end_minor, change_minor
                                   from public.net_worth_by_account('2026-03-01', '2026-04-01')
                                  where name in ('C Checking', 'C Fund', 'C held for someone')`)).rows
    .map((r) => [r.name, r.include_in_net_worth, num(r.start_minor), num(r.end_minor), num(r.change_minor)]);
  eq(rows, [
    ['C Checking', true, 850000, 973501, 123501],
    ['C Fund', true, 500000, 505000, 5000],
    ['C held for someone', false, 50000, 51000, 1000],
  ], 'March 2026');
});

await test("the report functions show A none of C's money", async () => {
  const sum = await one(asUser(A, `select money_in_minor from public.report_summary('2025-12-01', '2026-04-01', '2025-08-01')
                                    where period = 'current'`));
  eq(num(sum.money_in_minor), 0, "A's income over C's months");
  const names = (await asUser(A, `select name from public.net_worth_by_account('2026-03-01', '2026-04-01')`)).rows.map((r) => r.name);
  assert(!names.some((n) => n.startsWith('C ')), "A sees none of C's accounts");
});

await test("the safety report functions show A nothing of C's", async () => {
  eq((await asUser(A, `select * from public.recurring_costs('2026-03-10') where recurring_item_id = $1`, [c.rentBill])).rows.length, 0,
     'recurring_costs');
  eq((await asUser(A, `select * from public.possible_recurring('2025-09-01') where category_id = any ($1)`,
       [[c.rent, c.groceries, c.lessons, c.fun]])).rows.length, 0, 'possible_recurring');
  eq((await asUser(A, `select * from public.cash_runway(6, null, '2026-03-10') where name like 'C %'`)).rows.length, 0, 'cash_runway');
});

await test("the Phase 5 report functions show A nothing of C's", async () => {
  const ids = [c.rent, c.groceries, c.lessons, c.fun];
  for (const call of [
    `select category_id from public.report_category_months('2025-09-01', '2026-04-01')`,
    `select category_id from public.report_category_totals('2025-09-01', '2026-04-01', '2025-01-01')`,
    `select category_id from public.budget_month_results('2025-09-01', '2026-04-01')`,
  ]) {
    eq((await asUser(A, call)).rows.filter((x) => ids.includes(x.category_id)).length, 0, call);
  }
  eq((await asUser(A, `select * from public.goal_month_flow where account_id = $1`, [c.fund])).rows.length, 0, 'goal_month_flow');
});

await test("the Month and Category functions show A nothing of C's", async () => {
  // A has March 2026 spending of its own; it must be exactly A's, never C's.
  const own = await one(asUser(A, `select coalesce(sum(expense_minor), 0) as m from public.month_summary where month = '2026-03-01'`));
  const spent = await one(asUser(A, `select max(running_minor) as m from public.daily_spending('2026-03-01', null, '2026-03-10')`));
  eq(num(spent.m), num(own.m), "daily_spending is A's own");
  const cats = (await asUser(A, `select category_id from public.month_categories('2026-03-01', '2026-03-31')`)).rows;
  eq(cats.filter((x) => [c.rent, c.groceries, c.lessons, c.fun].includes(x.category_id)).length, 0, 'month_categories');
  eq((await asUser(A, `select * from public.category_stats($1, '2026-03-01')`, [c.groceries])).rows.length, 0, 'category_stats');
});

await test("month_to_date and budget_pace show A nothing of C's", async () => {
  // A's only rows in these months are its bill payments (Jan 31, Feb 27), so
  // none of C's salary, rent or goal transfers may show up.
  const mtd = await one(asUser(A, `select * from public.month_to_date('2026-03-01', $1)`, [TODAY]));
  eq([num(mtd.money_in_minor), num(mtd.money_out_minor), num(mtd.to_goals_minor), num(mtd.typical_in_minor),
      num(mtd.typical_to_goals_minor)], [0, 0, 0, 0, 0], "A's March and typical month");
  eq((await asUser(A, `select * from public.budget_pace('2026-03-01', $1)`, [TODAY])).rows.length, 0, "A has no March budgets");
});

// ===========================================================================
group('anon sees nothing');

const relations = ['currencies', 'profiles', 'accounts', 'category_groups', 'categories', 'import_batches',
  'recurring_items', 'transactions', 'budgets', 'goals', 'audit_events', 'account_entries', 'account_balances',
  'budget_progress', 'monthly_cash_flow', 'goal_progress', 'net_worth_by_month', 'category_usage',
  'account_month_flow', 'account_ledger', 'category_month_totals', 'month_summary', 'recurring_item_months', 'goal_month_flow'];
await test('anon cannot read any table or view', async () => {
  for (const rel of relations) {
    await expectError(asAnon(`select count(*) from public.${rel}`), /permission denied/, rel);
  }
});
await test('anon cannot write any table', async () => {
  await expectError(asAnon(`insert into public.accounts (name, type) values ('x', 'cash')`), /permission denied/, 'insert');
  await expectError(asAnon(`delete from public.transactions`), /permission denied/, 'delete');
});
await test('anon cannot call any RPC', async () => {
  for (const call of [
    `select public.copy_budgets('2026-01-01', '2026-02-01')`,
    `select * from public.mark_bill_paid(gen_random_uuid())`,
    `select * from public.import_transactions('{}', '[]')`,
    `select public.merge_categories(gen_random_uuid(), gen_random_uuid())`,
    `select public.recurrence_next('2026-01-01', 'month', 1, '2026-01-01')`,
    `select * from public.category_top_descriptions(gen_random_uuid(), '2026-01-01', '2026-02-01')`,
    `select * from public.month_to_date('2026-03-01')`,
    `select * from public.budget_pace('2026-03-01')`,
    `select * from public.report_cash_flow('2026-01-01', '2026-04-01')`,
    `select * from public.report_summary('2026-01-01', '2026-04-01', '2025-10-01')`,
    `select * from public.net_worth_by_account('2026-01-01', '2026-04-01')`,
    `select * from public.net_worth_change('2026-01-01', '2026-04-01')`,
    `select * from public.daily_spending('2026-03-01')`,
    `select * from public.month_categories('2026-03-01')`,
    `select * from public.category_stats(gen_random_uuid(), '2026-03-01')`,
    `select * from public.report_category_months('2026-01-01', '2026-04-01')`,
    `select * from public.report_category_totals('2026-01-01', '2026-04-01', '2025-10-01')`,
    `select * from public.budget_month_results('2026-01-01', '2026-04-01')`,
    `select * from public.budget_month_summary('2026-03-01')`,
    `select * from public.recurring_costs()`,
    `select * from public.report_fixed_flexible('2026-01-01', '2026-04-01')`,
    `select * from public.possible_recurring('2026-01-01')`,
    `select * from public.cash_runway()`,
    `select * from public.debt_summary('2026-01-01', '2026-04-01')`,
  ]) {
    await expectError(asAnon(call), /permission denied/, call);
  }
});

// ===========================================================================
group('Deletion rules');

await test('an account with transactions cannot be deleted; one without can', async () => {
  await expectError(asUser(A, `delete from public.accounts where id = $1`, [ids.A.chk]), /foreign key/, 'with history');
  await db.exec('begin');
  const r = await asUser(A, `delete from public.accounts where id = $1`, [ids.A.cash]);
  eq(r.affectedRows, 1, 'without history');
});
await test('a used category cannot be deleted', async () => {
  await expectError(asUser(A, `delete from public.categories where id = $1`, [ids.A.groceries]), /foreign key/, 'used category');
});
await test('an account backing a goal cannot be deleted until the goal is', async () => {
  await db.exec('begin');
  await expectError(asUser(B, `delete from public.accounts where id = $1`, [ids.B.sav]), /goals_account_fkey/, 'goal account');
});
await test('deleting a group leaves its categories ungrouped, user_id intact', async () => {
  await db.exec('begin');
  await asUser(A, `delete from public.category_groups where id = $1`, [ids.A.grp]);
  const c = await one(sql(`select group_id, user_id from public.categories where id = $1`, [ids.A.groceries]));
  eq([c.group_id, c.user_id], [null, A], 'category after group delete');
});
await test('deleting an auth user cascades every row and leaves other users intact', async () => {
  await db.exec('begin');
  const tables = ['profiles', 'accounts', 'category_groups', 'categories', 'import_batches', 'recurring_items',
    'transactions', 'budgets', 'goals', 'audit_events'];
  const countFor = async (uid) => {
    const out = {};
    for (const t of tables) {
      const col = t === 'profiles' ? 'id' : 'user_id';
      out[t] = (await one(sql(`select count(*)::int as n from public.${t} where ${col} = $1`, [uid]))).n;
    }
    return out;
  };
  const bBefore = await countFor(B);
  await sql(`delete from auth.users where id = $1`, [A]);
  const aAfter = await countFor(A);
  assert(Object.values(aAfter).every((n) => n === 0), `A rows remain: ${JSON.stringify(aAfter)}`);
  eq(await countFor(B), bBefore, 'B unchanged');
});

// ---------------------------------------------------------------------------
// The restore drill's fingerprint (supabase/checks/fingerprint.sql) runs
// against this schema, so it cannot rot unnoticed before the day it's needed.
// ---------------------------------------------------------------------------
group('Restore drill fingerprint');

const fingerprintFile = await readFile(path.join(here, '..', 'checks', 'fingerprint.sql'), 'utf8');
const fingerprintBuilder = fingerprintFile.slice(
  fingerprintFile.indexOf('select string_agg('),
  // Everything before the psql directive that runs it (the last "gexec").
  fingerprintFile.lastIndexOf('gexec') - 1,
);

// What psql does: build the query in a read-only transaction, then run it.
async function fingerprint() {
  await db.exec("begin transaction read only; set local timezone = 'UTC';");
  try {
    const built = (await db.query(fingerprintBuilder)).rows[0].query;
    return (await db.query(built)).rows;
  } finally {
    await db.exec('rollback');
  }
}

await test('runs read-only, over every public table and auth.users', async () => {
  const rows = await fingerprint();
  const tables = (await sql(
    `select 'public.' || c.relname as name from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r', 'p') order by 1`,
  )).rows.map((r) => r.name);
  eq(rows.map((r) => r.relation), [...tables, 'auth.users'].sort(), 'relations covered');
});

await test('is the same every time it runs', async () => {
  eq(await fingerprint(), await fingerprint(), 'two runs');
});

await test('notices a single edited row, and only in its table', async () => {
  const before = await fingerprint();
  await db.exec('begin');
  await sql(
    'update public.transactions set description = description || $1 where id = (select id from public.transactions order by id limit 1)',
    [' (edited)'],
  );
  const built = (await sql(fingerprintBuilder)).rows[0].query;
  const after = (await sql(built)).rows;
  await db.exec('rollback');
  const changed = after.filter((row, i) => row.rows_md5 !== before[i].rows_md5).map((row) => row.relation);
  eq(changed, ['public.transactions'], 'tables whose fingerprint moved');
});

await test('shows no amount or description', async () => {
  const rows = await fingerprint();
  const description = (await sql('select description from public.transactions where description is not null limit 1')).rows[0]?.description;
  assert(description, 'the fixture has a described transaction to look for');
  assert(!JSON.stringify(rows).includes(description), 'a description appeared in the output');
  eq(Object.keys(rows[0]), ['relation', 'row_count', 'rows_md5', 'last_changed'], 'columns');
});

summarize();

// ---------------------------------------------------------------------------
function summarize() {
  const passed = results.filter((r) => r.ok).length;
  const failed = results.length - passed;
  console.log('\n' + '-'.repeat(60));
  console.log(`Schema check: ${passed} passed, ${failed} failed, ${results.length} total`);
  if (failed) {
    console.log('\nFailures:');
    for (const r of results.filter((x) => !x.ok)) console.log(`  [${r.group}] ${r.name}\n      ${r.error.split('\n')[0]}`);
  }
  process.exit(failed ? 1 : 0);
}
