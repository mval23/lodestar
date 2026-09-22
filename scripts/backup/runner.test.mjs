import { createServer } from 'node:http';
import { createClient } from '@supabase/supabase-js';
import { readBackup } from './plan.mjs';
import { createBackup, readAll, restoreBackup, verifyBackup } from './runner.mjs';

// A stand-in PostgREST: enough of it to exercise what the backup actually
// does over the wire — paging, ordering, counts, batched inserts
// and the profile update. Synthetic data only.

function fakeRest(store) {
  const requests = [];
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const table = url.pathname.replace('/rest/v1/', '');
    // supabase-js pages with offset and limit, not a Range header.
    const offset = Number(url.searchParams.get('offset') ?? 0);
    const limit = url.searchParams.has('limit') ? Number(url.searchParams.get('limit')) : null;
    requests.push({ method: req.method, table, offset, limit });
    const send = (status, body, headers = {}) => {
      res.writeHead(status, { 'content-type': 'application/json', ...headers });
      res.end(body === undefined ? '' : JSON.stringify(body));
    };

    if (req.method === 'GET' || req.method === 'HEAD') {
      const rows = [...(store[table] ?? [])].sort((a, b) => String(a.id).localeCompare(String(b.id)));
      if (table === 'profiles') return send(200, rows[0] ?? null);
      const page = rows.slice(offset, limit === null ? undefined : offset + limit);
      const headers = { 'content-range': `${offset}-${offset + page.length}/${rows.length}` };
      if (req.method === 'HEAD') return send(200, undefined, headers);
      return send(200, page, headers);
    }

    let body = '';
    req.on('data', (part) => (body += part));
    req.on('end', () => {
      const payload = body ? JSON.parse(body) : null;
      if (req.method === 'POST') {
        store[table] = [...(store[table] ?? []), ...(Array.isArray(payload) ? payload : [payload])];
        return send(201, null);
      }
      if (req.method === 'PATCH') {
        store[table] = (store[table] ?? []).map((row) => ({ ...row, ...payload }));
        return send(200, null);
      }
      send(405, { message: 'no' });
    });
  });
  return { server, requests };
}

const PROFILE = { id: 'u1', display_name: 'Sam', currency: 'USD', timezone: 'UTC', week_start: 1 };

function account(rows = 3) {
  const store = {
    profiles: [{ ...PROFILE }],
    category_groups: [{ id: 'g1', user_id: 'u1', name: 'Essentials', sort_order: 0 }],
    accounts: [{ id: 'a1', user_id: 'u1', name: 'Everyday checking', type: 'checking', opening_balance_minor: 0, opening_date: null, sort_order: 0, archived_at: null, source_ref: null }],
    categories: [{ id: 'c1', user_id: 'u1', group_id: 'g1', name: 'Groceries', kind: 'expense', sort_order: 0, archived_at: null, source_ref: null }],
    import_batches: [],
    recurring_items: [],
    goals: [],
    budgets: [],
    transactions: Array.from({ length: rows }, (_, index) => ({
      id: `t${String(index).padStart(4, '0')}`,
      user_id: 'u1',
      kind: 'expense',
      occurred_on: '2026-09-12',
      amount_minor: 100 + index,
      from_account_id: 'a1',
      to_account_id: null,
      category_id: 'c1',
      category_kind: 'expense',
      description: `Row ${index}`,
      notes: null,
      recurring_item_id: null,
      import_batch_id: null,
      source_ref: null,
      created_at: '2026-09-12T00:00:00Z',
      updated_at: '2026-09-12T00:00:00Z',
    })),
  };
  return store;
}

async function start(store) {
  const { server, requests } = fakeRest(store);
  await new Promise((resolve) => server.listen(0, resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  const supabase = createClient(url, 'sb_publishable_synthetic', { auth: { persistSession: false } });
  return { supabase, requests, stop: () => new Promise((resolve) => server.close(resolve)) };
}

describe('reading an account out', () => {
  it('writes a backup of everything, in the columns a restore can use', async () => {
    const { supabase, stop } = await start(account());
    const file = await createBackup(supabase, { takenAt: 't', project: 'p', userId: 'u1' });
    await stop();

    expect(file.counts).toMatchObject({ accounts: 1, categories: 1, category_groups: 1, transactions: 3 });
    expect(file.profile).toEqual({ display_name: 'Sam', currency: 'USD', timezone: 'UTC', week_start: 1 });
    expect(file.tables.transactions[0]).not.toHaveProperty('user_id');
    // It reads back as a backup file, which is what the restore will be given.
    expect(readBackup(JSON.stringify(file)).counts.transactions).toBe(3);
  });

  it('pages past the row limit instead of stopping at it', async () => {
    const { supabase, requests, stop } = await start(account(5));
    const rows = await readAll(supabase, 'transactions', { page: 2 });
    await stop();

    expect(rows).toHaveLength(5);
    expect(rows.map((row) => row.id)).toEqual(['t0000', 't0001', 't0002', 't0003', 't0004']);
    // Three pages: two full and a short one that ends it.
    const pages = requests.filter((request) => request.table === 'transactions');
    expect(pages.map((request) => [request.offset, request.limit])).toEqual([
      [0, 2],
      [2, 2],
      [4, 2],
    ]);
  });
});

describe('putting a backup back', () => {
  it('restores every row, and says nothing is different', async () => {
    const { supabase: source, stop: stopSource } = await start(account());
    const file = await createBackup(source, { takenAt: 't', project: 'p', userId: 'u1' });
    await stopSource();

    const empty = { profiles: [{ id: 'u2', display_name: null, currency: 'COP', timezone: 'UTC', week_start: 1 }] };
    for (const table of Object.keys(file.tables)) empty[table] = [];
    const { supabase, requests, stop } = await start(empty);
    const problems = await restoreBackup(supabase, file, { userId: 'u2' });
    await stop();

    expect(problems).toEqual([]);
    expect(empty.transactions).toHaveLength(3);
    // The profile is set before any transaction: currency locks once there is one.
    const writes = requests.filter((request) => ['POST', 'PATCH'].includes(request.method));
    expect(writes[0]).toMatchObject({ method: 'PATCH', table: 'profiles' });
    expect(empty.profiles[0]).toMatchObject({ currency: 'USD', display_name: 'Sam' });
  });

  it('writes the tables in dependency order, so nothing points at a missing row', async () => {
    const { supabase: source, stop: stopSource } = await start(account(1));
    const file = await createBackup(source, { takenAt: 't', project: 'p', userId: 'u1' });
    await stopSource();

    const empty = { profiles: [{ id: 'u2' }] };
    for (const table of Object.keys(file.tables)) empty[table] = [];
    const { supabase, requests, stop } = await start(empty);
    await restoreBackup(supabase, file, { userId: 'u2' });
    await stop();

    const order = requests.filter((request) => request.method === 'POST').map((request) => request.table);
    expect(order).toEqual(['category_groups', 'accounts', 'categories', 'transactions']);
  });

  it('refuses an account that already holds something, and writes nothing', async () => {
    const { supabase: source, stop: stopSource } = await start(account(1));
    const file = await createBackup(source, { takenAt: 't', project: 'p', userId: 'u1' });
    await stopSource();

    const occupied = account(2);
    const { supabase, requests, stop } = await start(occupied);
    await expect(restoreBackup(supabase, file, { userId: 'u1' })).rejects.toThrow(/already holds/);
    await stop();

    expect(requests.some((request) => request.method === 'POST')).toBe(false);
    expect(occupied.transactions).toHaveLength(2);
  });

  it('notices when the account no longer matches the backup', async () => {
    const store = account(3);
    const { supabase, stop } = await start(store);
    const file = await createBackup(supabase, { takenAt: 't', project: 'p', userId: 'u1' });
    store.transactions.pop();
    const problems = await verifyBackup(supabase, file);
    await stop();

    expect(problems).toEqual(['transactions: 3 in the backup, 2 restored']);
  });
});
