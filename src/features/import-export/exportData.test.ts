import { EXPORT_PAGE, EXPORT_TABLES, exportAll, readTable, toTable, type ExportTable, type ReadPage } from './exportData';

// A fake Data API: serves each table's rows a page at a time, as the real one
// does, and never more than EXPORT_PAGE in one answer.
function fakeApi(sizes: Partial<Record<ExportTable, number>>) {
  const calls: { table: ExportTable; from: number; to: number }[] = [];
  const readPage: ReadPage = async (table, from, to) => {
    calls.push({ table, from, to });
    const size = sizes[table] ?? 0;
    const end = Math.min(to + 1, size, from + EXPORT_PAGE);
    return Array.from({ length: Math.max(0, end - from) }, (_, i) => ({ id: `${table}-${from + i}`, amount_minor: 4550 }));
  };
  return { readPage, calls };
}

describe('readTable', () => {
  it('reads past the thousand rows one request returns', async () => {
    const api = fakeApi({ transactions: 2_500 });
    const rows = await readTable('transactions', api.readPage);
    expect(rows).toHaveLength(2_500);
    expect(new Set(rows.map((row) => row.id)).size).toBe(2_500);
    expect(api.calls.map(({ from, to }) => [from, to])).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
  });

  it('asks once more after a full last page, and stops on the empty answer', async () => {
    const api = fakeApi({ transactions: EXPORT_PAGE });
    expect(await readTable('transactions', api.readPage)).toHaveLength(EXPORT_PAGE);
    expect(api.calls).toHaveLength(2);
  });
});

describe('exportAll', () => {
  it('reads every table a person has entered, and leaves out the security log', async () => {
    const api = fakeApi({});
    await exportAll(api.readPage);
    expect(new Set(api.calls.map((call) => call.table))).toEqual(new Set(EXPORT_TABLES));
    expect(EXPORT_TABLES).toEqual(
      expect.arrayContaining(['budgets', 'goals', 'recurring_items', 'category_groups', 'profiles']),
    );
    expect(EXPORT_TABLES).not.toContain('audit_events' as ExportTable);
  });

  it('writes a file for each table with rows, and names the empty ones instead', async () => {
    const api = fakeApi({ profiles: 1, accounts: 3, transactions: 1_204, budgets: 6 });
    const result = await exportAll(api.readPage);

    expect(result.files.map((file) => file.filename)).toEqual([
      'lodestar-profiles.csv',
      'lodestar-accounts.csv',
      'lodestar-transactions.csv',
      'lodestar-budgets.csv',
    ]);
    expect(result.files.find((file) => file.table === 'transactions')!.rows).toHaveLength(1_205);
    expect(result.empty).toEqual(['category_groups', 'categories', 'goals', 'recurring_items', 'import_batches']);
    expect(result.rowCount).toBe(1 + 3 + 1_204 + 6);
  });
});

describe('toTable', () => {
  it('keeps amounts in minor units as stored, and writes nothing for null', () => {
    expect(toTable([{ id: 'a', amount_minor: 4550, notes: null }])).toEqual([
      ['id', 'amount_minor', 'notes'],
      ['a', '4550', ''],
    ]);
  });

  it('has nothing to write for no rows', () => {
    expect(toTable([])).toEqual([]);
  });
});
