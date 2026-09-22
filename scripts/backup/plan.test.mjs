import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  chunk,
  compare,
  emptinessProblem,
  FORMAT,
  insertGrants,
  makeBackup,
  pickRow,
  readBackup,
  TABLES,
  tableNames,
} from './plan.mjs';

// Synthetic throughout: a backup holds real finances, so no test may.
const ROWS = {
  category_groups: [{ id: 'g1', user_id: 'u1', name: 'Essentials', sort_order: 0, updated_at: 'x' }],
  accounts: [
    { id: 'a1', user_id: 'u1', name: 'Everyday checking', type: 'checking', opening_balance_minor: 100000, opening_date: null, sort_order: 0, archived_at: null, source_ref: null, created_at: 'x', updated_at: 'x' },
  ],
  categories: [{ id: 'c1', user_id: 'u1', group_id: 'g1', name: 'Groceries', kind: 'expense', sort_order: 0, archived_at: null, source_ref: null }],
  import_batches: [],
  recurring_items: [],
  goals: [],
  budgets: [{ id: 'b1', user_id: 'u1', category_id: 'c1', month: '2026-09-01', amount_minor: 20000 }],
  transactions: [
    { id: 't1', user_id: 'u1', kind: 'expense', occurred_on: '2026-09-12', amount_minor: 4550, from_account_id: 'a1', to_account_id: null, category_id: 'c1', category_kind: 'expense', description: 'Market', notes: null, recurring_item_id: null, import_batch_id: null, source_ref: null, created_at: 'x', updated_at: 'x' },
  ],
};

const PROFILE = { id: 'u1', display_name: 'Sam', currency: 'USD', timezone: 'America/Bogota', week_start: 1, created_at: 'x' };

const backup = () =>
  makeBackup({ rows: ROWS, profile: PROFILE, takenAt: '2026-09-22T12:00:00.000Z', project: 'p.supabase.co', userId: 'u1' });

describe('what a backup holds', () => {
  it('keeps only what a restore can write back', () => {
    const file = backup();
    expect(file.tables.accounts[0]).toEqual({
      id: 'a1',
      name: 'Everyday checking',
      type: 'checking',
      opening_balance_minor: 100000,
      opening_date: null,
      sort_order: 0,
      archived_at: null,
      source_ref: null,
    });
    // user_id comes from the account doing the restore; the rest is the
    // database's to decide.
    expect(file.tables.transactions[0]).not.toHaveProperty('user_id');
    expect(file.tables.transactions[0]).not.toHaveProperty('updated_at');
    expect(file.tables.transactions[0]).not.toHaveProperty('category_kind');
  });

  it('keeps the created_at of a transaction, which an import may set', () => {
    expect(backup().tables.transactions[0]).toHaveProperty('created_at', 'x');
  });

  it('records where and when it came from, and counts what it holds', () => {
    const file = backup();
    expect(file).toMatchObject({ format: FORMAT, taken_at: '2026-09-22T12:00:00.000Z', project: 'p.supabase.co', user_id: 'u1' });
    expect(file.counts).toEqual({
      category_groups: 1, accounts: 1, categories: 1, import_batches: 0,
      recurring_items: 0, goals: 0, budgets: 1, transactions: 1,
    });
  });

  it('keeps the profile settings, and nothing else about the account', () => {
    expect(backup().profile).toEqual({ display_name: 'Sam', currency: 'USD', timezone: 'America/Bogota', week_start: 1 });
  });

  it('leaves the audit log out: it cannot be restored and holds no money', () => {
    expect(tableNames()).not.toContain('audit_events');
  });
});

describe('reading a backup file', () => {
  it('reads one it wrote', () => {
    expect(readBackup(JSON.stringify(backup())).counts.transactions).toBe(1);
  });

  it('refuses anything else, by name', () => {
    expect(() => readBackup('not json')).toThrow(/not JSON/);
    expect(() => readBackup('{"format":"something-else"}')).toThrow(/not a Lodestar backup/);
    const missing = { ...backup(), tables: { accounts: [] } };
    expect(() => readBackup(JSON.stringify(missing))).toThrow(/missing its category_groups/);
  });
});

describe('restoring into an account that is not empty', () => {
  it('says what is in the way, and what to do', () => {
    const problem = emptinessProblem({ accounts: 2, transactions: 318, budgets: 0 });
    expect(problem).toMatch('2 accounts, 318 transactions');
    expect(problem).toMatch(/delete this one in Settings/);
  });

  it('is content with an empty one', () => {
    expect(emptinessProblem({ accounts: 0, transactions: 0 })).toBeNull();
  });
});

describe('compare', () => {
  const restored = () => ({
    ...ROWS,
    // What comes back carries columns a backup never held, and any order.
    transactions: [{ ...ROWS.transactions[0], updated_at: 'later' }],
  });

  it('is silent when every row came back', () => {
    expect(compare(backup(), restored())).toEqual([]);
  });

  it('counts rows that never arrived', () => {
    expect(compare(backup(), { ...restored(), budgets: [] })).toEqual(['budgets: 1 in the backup, 0 restored']);
  });

  it('names a row that came back changed', () => {
    const changed = { ...restored(), accounts: [{ ...ROWS.accounts[0], opening_balance_minor: 1 }] };
    expect(compare(backup(), changed)).toEqual(['accounts: 1 of 1 rows came back different']);
  });

  it('does not mind the order rows come back in', () => {
    const two = { ...ROWS, accounts: [ROWS.accounts[0], { ...ROWS.accounts[0], id: 'a2', name: 'Savings' }] };
    const file = makeBackup({ rows: two, profile: PROFILE, takenAt: 't', project: 'p', userId: 'u1' });
    expect(compare(file, { ...two, accounts: [...two.accounts].reverse() })).toEqual([]);
  });
});

describe('chunk', () => {
  it('splits rows into batches, keeping them in order', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 2)).toEqual([]);
  });
});

describe('the columns a restore writes', () => {
  it('are ones the database actually grants, as the migrations leave them', async () => {
    const dir = path.resolve('supabase/migrations');
    const files = (await readdir(dir)).filter((name) => name.endsWith('.sql')).sort();
    // Later migrations restate a table's grants; the last word wins.
    const granted = {};
    for (const name of files) {
      Object.assign(granted, insertGrants(await readFile(path.join(dir, name), 'utf8')));
    }
    for (const { name, columns } of TABLES) {
      expect(granted[name], `${name} has no insert grant`).toBeDefined();
      const refused = columns.filter((column) => !granted[name].includes(column));
      expect(refused, `${name} would refuse these on insert`).toEqual([]);
    }
  });

  it('reads a grant that spans two lines', () => {
    const sql = `grant insert (id, kind, occurred_on,
              description, created_at)
  on public.transactions to authenticated;`;
    expect(insertGrants(sql)).toEqual({ transactions: ['id', 'kind', 'occurred_on', 'description', 'created_at'] });
  });
});

describe('pickRow', () => {
  it('knows nothing about a table it was never told of', () => {
    expect(pickRow('nowhere', { id: 1 })).toEqual({});
  });
});
