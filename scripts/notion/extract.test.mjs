import { extract } from './extract.mjs';

// A stand-in for Notion, so the reading rules can be checked without a token.
function fakeNotion({ dataSources = true } = {}) {
  const calls = [];
  const page = (id, properties) => ({ id, properties });
  const rows = {
    'acc-ds': [
      page('acc-1', {
        Name: { title: [{ plain_text: 'Everyday checking' }] },
        'Account Type': { select: { name: 'Checking' } },
        'Starting Balance': { number: 1000 },
      }),
    ],
    'cat-ds': [
      page('cat-1', {
        Category: { title: [{ plain_text: 'Groceries' }] },
        Type: { select: { name: 'Essentials' } },
        Budget: { number: 400 },
      }),
    ],
    'txn-ds': [
      page('txn-1', {
        Description: { title: [{ plain_text: 'Market' }] },
        Amount: { number: 45.5 },
        Date: { date: { start: '2026-09-19T00:00:00.000-05:00' } },
        Source: { relation: [{ id: 'acc-1' }] },
        Destination: { relation: [] },
        Category: { relation: [{ id: 'cat-1' }] },
        tag: { multi_select: [{ name: 'weekly' }] },
        Notes: { rich_text: [{ plain_text: 'Split' }] },
      }),
      page('txn-2', {
        Description: { title: [] },
        Amount: { number: null },
        Date: { date: null },
        Source: { relation: [] },
        Destination: { relation: [] },
      }),
    ],
  };

  const notion = {
    calls,
    databases: {
      retrieve: async ({ database_id }) => {
        calls.push(['retrieve', database_id]);
        if (!dataSources) return {};
        return { data_sources: [{ id: `${database_id}-ds`, name: 'Default' }] };
      },
    },
    dataSources: {
      query: async ({ data_source_id, start_cursor }) => {
        calls.push(['query', data_source_id]);
        const all = rows[data_source_id] ?? [];
        if (start_cursor === 'more') return { results: all.slice(1), has_more: false };
        return all.length > 1
          ? { results: all.slice(0, 1), has_more: true, next_cursor: 'more' }
          : { results: all, has_more: false };
      },
    },
  };
  return notion;
}

describe('extract', () => {
  it('looks up each database’s data source before querying it', async () => {
    const notion = fakeNotion();
    await extract({ client: notion, accountsDb: 'acc', categoriesDb: 'cat', transactionsDb: 'txn' });

    // A database id is not a data source id: the query must use the latter.
    expect(notion.calls).toContainEqual(['retrieve', 'acc']);
    expect(notion.calls).toContainEqual(['query', 'acc-ds']);
    expect(notion.calls).toContainEqual(['query', 'txn-ds']);
    expect(notion.calls.some(([kind, id]) => kind === 'query' && id === 'txn')).toBe(false);
  });

  it('reads every page, following the cursor', async () => {
    const data = await extract({ client: fakeNotion(), accountsDb: 'acc', categoriesDb: 'cat', transactionsDb: 'txn' });
    expect(data.transactions).toHaveLength(2);
  });

  it('pulls the fields the migration needs, and dates without their time', async () => {
    const data = await extract({ client: fakeNotion(), accountsDb: 'acc', categoriesDb: 'cat', transactionsDb: 'txn' });

    expect(data.accounts[0]).toEqual({
      id: 'acc-1',
      name: 'Everyday checking',
      type: 'Checking',
      starting_balance: 1000,
    });
    expect(data.categories[0]).toEqual({ id: 'cat-1', name: 'Groceries', group: 'Essentials', budget: 400 });
    expect(data.transactions[0]).toEqual({
      id: 'txn-1',
      description: 'Market',
      amount: 45.5,
      date: '2026-09-19',
      source_id: 'acc-1',
      destination_id: null,
      category_id: 'cat-1',
      tags: ['weekly'],
      notes: 'Split',
    });
  });

  it('leaves an empty row empty rather than inventing values', async () => {
    const data = await extract({ client: fakeNotion(), accountsDb: 'acc', categoriesDb: 'cat', transactionsDb: 'txn' });
    expect(data.transactions[1]).toMatchObject({
      description: '',
      amount: null,
      date: null,
      source_id: null,
      destination_id: null,
    });
  });

  it('falls back to the database id when it holds no data sources', async () => {
    const notion = fakeNotion({ dataSources: false });
    await extract({ client: notion, accountsDb: 'acc', categoriesDb: 'cat', transactionsDb: 'txn' });
    expect(notion.calls).toContainEqual(['query', 'acc']);
  });
});
