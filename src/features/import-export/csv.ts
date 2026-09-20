import { parseMoney, type Currency } from '../../lib/money';
import type { TxnKind, TxnStatus } from '../transactions/queries';

// Everything about reading a bank's CSV lives here, kept away from React so
// each rule can be tested on its own.

export type DateOrder = 'dmy' | 'mdy';

export type ColumnMap = {
  date: string;
  description: string;
  amount: string;
  // Optional second column: some banks split money out and money in.
  amountIn: string;
  notes: string;
  category: string;
};

export const EMPTY_MAP: ColumnMap = { date: '', description: '', amount: '', amountIn: '', notes: '', category: '' };

export type ImportRow = {
  kind: TxnKind;
  occurred_on: string;
  amount_minor: number;
  from_account_id: string | null;
  to_account_id: string | null;
  category_id: string | null;
  description: string;
  notes: string | null;
  status: TxnStatus;
  source_ref: string;
};

export type RowProblem = { line: number; message: string };
export type PreparedRow = { line: number; row: ImportRow; raw: Record<string, string> };
export type Prepared = { rows: PreparedRow[]; problems: RowProblem[] };

// A date with no separators is ambiguous, and every bank picks a different
// order, so the wizard asks rather than guessing.
export function parseCsvDate(input: string, order: DateOrder): string | undefined {
  const text = input.trim();
  if (!text) return undefined;

  // ISO first: unambiguous, so the chosen order does not apply.
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (iso) return validDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  const parts = /^(\d{1,4})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(text);
  if (!parts) return undefined;
  const [, a, b, c] = parts;
  const first = Number(a);
  const second = Number(b);
  let year = Number(c);
  if (year < 100) year += year >= 70 ? 1900 : 2000;

  const day = order === 'dmy' ? first : second;
  const month = order === 'dmy' ? second : first;
  return validDate(year, month, day);
}

function validDate(year: number, month: number, day: number): string | undefined {
  if (month < 1 || month > 12 || day < 1 || day > 31) return undefined;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return undefined;
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// Banks write money out as "-45.50", "(45.50)" or a separate column.
export type SignedAmount = { minor: number; outgoing: boolean };

export function parseCsvAmount(input: string, currency: Currency): SignedAmount | { error: string } {
  let text = input.trim();
  if (!text) return { error: 'This row has no amount.' };

  let negative = false;
  if (/^\(.*\)$/.test(text)) {
    negative = true;
    text = text.slice(1, -1);
  }
  if (text.startsWith('-') || text.startsWith('−')) {
    negative = true;
    text = text.slice(1);
  } else if (text.startsWith('+')) {
    text = text.slice(1);
  }

  const parsed = parseMoney(text, currency);
  if (!parsed.ok) return { error: parsed.message };
  if (parsed.minor === 0) return { error: 'This row has an amount of zero.' };
  return { minor: parsed.minor, outgoing: negative };
}

// A row's identity, so importing the same file twice inserts nothing the
// second time. The occurrence index keeps two identical purchases on one day
// distinct, and the account is included because the same row imported into a
// different account is a different fact.
export function sourceRef(parts: {
  accountId: string;
  occurredOn: string;
  amountMinor: number;
  description: string;
  outgoing: boolean;
  occurrence: number;
}): string {
  const normalized = parts.description.trim().toLowerCase().replace(/\s+/g, ' ');
  return [
    'csv',
    parts.accountId,
    parts.occurredOn,
    parts.outgoing ? '-' : '+',
    parts.amountMinor,
    parts.occurrence,
    normalized,
  ]
    .join(':')
    .slice(0, 200);
}

export type PrepareOptions = {
  rows: Record<string, string>[];
  map: ColumnMap;
  dateOrder: DateOrder;
  currency: Currency;
  accountId: string;
  // When the file has one amount column and no signs at all.
  allOutgoing: boolean;
  categoryIdByName: Map<string, string>;
};

export function prepareRows(options: PrepareOptions): Prepared {
  const { rows, map, dateOrder, currency, accountId, allOutgoing, categoryIdByName } = options;
  const prepared: PreparedRow[] = [];
  const problems: RowProblem[] = [];
  const seen = new Map<string, number>();

  rows.forEach((raw, index) => {
    // Line 1 is the header, so the first data row is line 2.
    const line = index + 2;
    const blank = Object.values(raw).every((value) => (value ?? '').trim() === '');
    if (blank) return;

    const occurredOn = parseCsvDate(raw[map.date] ?? '', dateOrder);
    if (!occurredOn) {
      problems.push({ line, message: `Line ${line}: the date “${(raw[map.date] ?? '').trim()}” can’t be read.` });
      return;
    }

    const outText = (raw[map.amount] ?? '').trim();
    const inText = map.amountIn ? (raw[map.amountIn] ?? '').trim() : '';
    if (map.amountIn && outText && inText) {
      problems.push({ line, message: `Line ${line}: money in and money out both have a value.` });
      return;
    }

    const source = map.amountIn && !outText ? inText : outText;
    const parsedAmount = parseCsvAmount(source, currency);
    if ('error' in parsedAmount) {
      problems.push({ line, message: `Line ${line}: ${parsedAmount.error}` });
      return;
    }

    // Direction: a second column decides it outright; otherwise the sign
    // does, unless the file has no signs at all.
    const outgoing = map.amountIn ? Boolean(outText) : allOutgoing || parsedAmount.outgoing;

    const description = (raw[map.description] ?? '').trim().slice(0, 140) || (outgoing ? 'Expense' : 'Income');
    const notesText = map.notes ? (raw[map.notes] ?? '').trim() : '';
    const categoryName = map.category ? (raw[map.category] ?? '').trim().toLowerCase() : '';
    const categoryId = categoryName ? (categoryIdByName.get(categoryName) ?? null) : null;

    const key = `${occurredOn}|${parsedAmount.minor}|${outgoing}|${description.toLowerCase()}`;
    const occurrence = (seen.get(key) ?? 0) + 1;
    seen.set(key, occurrence);

    prepared.push({
      line,
      raw,
      row: {
        kind: outgoing ? 'expense' : 'income',
        occurred_on: occurredOn,
        amount_minor: parsedAmount.minor,
        from_account_id: outgoing ? accountId : null,
        to_account_id: outgoing ? null : accountId,
        // An expense may carry a category; income keeps one only if it is an
        // income category, which the database enforces anyway.
        category_id: categoryId,
        description,
        notes: notesText === '' ? null : notesText.slice(0, 4000),
        status: 'cleared',
        source_ref: sourceRef({
          accountId,
          occurredOn,
          amountMinor: parsedAmount.minor,
          description,
          outgoing,
          occurrence,
        }),
      },
    });
  });

  return { rows: prepared, problems };
}

// Guesses a mapping from the header names, so the common case needs no work.
const HINTS: Record<keyof ColumnMap, RegExp> = {
  date: /^(date|fecha|posted|transaction date|value date)/i,
  description: /^(description|descripcion|detalle|payee|merchant|concepto|narrative|memo)/i,
  amount: /^(amount|importe|valor|debit|charge|withdrawal|out|salida|monto)/i,
  amountIn: /^(credit|deposit|in|entrada|abono|income)/i,
  notes: /^(notes?|nota|reference|comment)/i,
  category: /^(category|categoria|rubro)/i,
};

export function guessMap(headers: string[]): ColumnMap {
  const map = { ...EMPTY_MAP };
  for (const key of Object.keys(HINTS) as (keyof ColumnMap)[]) {
    const match = headers.find((header) => HINTS[key].test(header.trim()));
    if (match) map[key] = match;
  }
  return map;
}

// Export: one row per transaction, in the same shape the importer reads.
export function toCsv(rows: string[][]): string {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          const value = cell ?? '';
          return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
        })
        .join(','),
    )
    .join('\r\n');
}
