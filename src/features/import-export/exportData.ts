import type { Database } from '../../lib/database.types';

// Everything a person has entered, one CSV per table: their settings, their
// accounts, categories and groups, every transaction, the plans and goals
// and bills built on them, and the imports that brought rows in. The
// security log (audit_events) stays out: it records what was done to the
// account, not anything the person entered, and nothing reads it back.
export const EXPORT_TABLES = [
  'profiles',
  'accounts',
  'category_groups',
  'categories',
  'transactions',
  'budgets',
  'goals',
  'recurring_items',
  'import_batches',
] as const satisfies readonly (keyof Database['public']['Tables'])[];

export type ExportTable = (typeof EXPORT_TABLES)[number];

// The Data API returns at most this many rows per request (max_rows in
// supabase/config.toml), so a table is read page by page until a page comes
// back short. A single request would quietly stop at the first thousand.
export const EXPORT_PAGE = 1000;

type Row = Record<string, unknown>;

// Reads one page: rows from..to inclusive, in a stable order. Every exported
// table has an id, so ordering by it keeps pages from overlapping or skipping.
export type ReadPage = (table: ExportTable, from: number, to: number) => Promise<Row[]>;

export async function readTable(table: ExportTable, readPage: ReadPage): Promise<Row[]> {
  const rows: Row[] = [];
  for (let from = 0; ; from += EXPORT_PAGE) {
    const page = await readPage(table, from, from + EXPORT_PAGE - 1);
    rows.push(...page);
    if (page.length < EXPORT_PAGE) return rows;
  }
}

// Header row, then one line per row. Amounts stay in minor units exactly as
// stored, which is what an import reads back; null becomes an empty cell.
export function toTable(rows: Row[]): string[][] {
  if (rows.length === 0) return [];
  const headers = Object.keys(rows[0]!);
  return [
    headers,
    ...rows.map((row) =>
      headers.map((header) => {
        const value = row[header];
        return value === null || value === undefined ? '' : String(value);
      }),
    ),
  ];
}

export type ExportFile = { table: ExportTable; filename: string; rows: string[][] };

export type ExportResult = { files: ExportFile[]; empty: ExportTable[]; rowCount: number };

// Reads every table and returns a file for each one that has rows. Empty
// tables get no file, so nothing arrives that is only a header, and the
// caller can name them instead.
export async function exportAll(readPage: ReadPage): Promise<ExportResult> {
  const tables = await Promise.all(
    EXPORT_TABLES.map(async (table) => ({ table, rows: await readTable(table, readPage) })),
  );
  const files = tables
    .filter(({ rows }) => rows.length > 0)
    .map(({ table, rows }) => ({ table, filename: `lodestar-${table}.csv`, rows: toTable(rows) }));
  return {
    files,
    empty: tables.filter(({ rows }) => rows.length === 0).map(({ table }) => table),
    rowCount: tables.reduce((sum, { rows }) => sum + rows.length, 0),
  };
}

// The words a person would use for each file.
export const EXPORT_LABELS: Record<ExportTable, string> = {
  profiles: 'profile',
  accounts: 'accounts',
  category_groups: 'category groups',
  categories: 'categories',
  transactions: 'transactions',
  budgets: 'budgets',
  goals: 'goals',
  recurring_items: 'bills and subscriptions',
  import_batches: 'import history',
};
