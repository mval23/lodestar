import { parseMoney, type Currency } from '../../lib/money';
import type { TransactionUpdate } from './queries';

// Editing a table of transactions in place, the way a spreadsheet does: the
// rules for where Enter and Tab go, and for what each cell will accept, kept
// apart from the table so they can be tested on their own.

export type Field = 'date' | 'description' | 'amount';

// Left to right, as the columns read. The category is chosen from a picker,
// not typed, so Tab passes over it.
export const FIELDS: Field[] = ['date', 'description', 'amount'];

export type Cell = { row: string; field: Field };
export type Move = 'right' | 'left' | 'down' | 'up';

// Tab and Shift+Tab walk along a row and wrap onto the next or previous one;
// Enter and Shift+Enter keep the column and change the row. Off the edge of
// the table there is nowhere to go, and the edit simply ends.
export function nextCell(rows: string[], at: Cell, move: Move): Cell | null {
  const r = rows.indexOf(at.row);
  const f = FIELDS.indexOf(at.field);
  if (r < 0 || f < 0) return null;

  if (move === 'down' || move === 'up') {
    const row = rows[r + (move === 'down' ? 1 : -1)];
    return row === undefined ? null : { row, field: at.field };
  }

  const step = move === 'right' ? 1 : -1;
  const field = FIELDS[f + step];
  if (field) return { row: at.row, field };
  const row = rows[r + step];
  if (row === undefined) return null;
  return { row, field: move === 'right' ? FIELDS[0]! : FIELDS[FIELDS.length - 1]! };
}

export type CellResult =
  | { ok: true; changes: TransactionUpdate | null }
  | { ok: false; message: string };

// What a typed value becomes. `changes` is null when nothing changed, so
// leaving a cell as it was never writes to the database.
export function parseCell(
  field: Field,
  text: string,
  current: { occurred_on: string; description: string; amount_minor: number },
  context: { currency: Currency; fallbackDescription: string },
): CellResult {
  if (field === 'date') {
    const value = text.trim();
    if (!isIsoDate(value)) return { ok: false, message: 'Enter a date.' };
    return { ok: true, changes: value === current.occurred_on ? null : { occurred_on: value } };
  }

  if (field === 'description') {
    // Never mandatory: an empty description falls back to the category's
    // name, then the kind, exactly as the full form does.
    const value = text.trim() || context.fallbackDescription;
    return { ok: true, changes: value === current.description ? null : { description: value } };
  }

  const parsed = parseMoney(text, context.currency);
  if (!parsed.ok) return { ok: false, message: parsed.message };
  if (parsed.minor === 0) return { ok: false, message: 'Enter an amount above zero.' };
  return { ok: true, changes: parsed.minor === current.amount_minor ? null : { amount_minor: parsed.minor } };
}

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
