import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useCurrency } from '../../lib/profile';
import { toAmountInput } from '../../lib/money';
import { DatePicker } from '../../ui/DatePicker';
import { dataErrorMessage } from '../auth/errors';
import { nextCell, parseCell, type Cell, type Field, type Move } from './cellEdit';
import { useUpdateTransaction, type TransactionUpdate } from './queries';

// Editing a table of transactions in place, the way a spreadsheet does: click
// a date, description or amount and type; Enter saves and moves down, Tab
// saves and moves along, Escape puts it back, clicking away saves. Pickers
// (category, accounts) save the moment a choice is made. Shared by Activity
// and the detail pages, which lay their tables out differently.

// What a row holds now, as the table read it.
export type CellValues = {
  occurred_on: string;
  description: string;
  amount_minor: number;
  category_id: string | null;
  from_account_id: string | null;
  to_account_id: string | null;
};

type Draft = { cell: Cell; text: string };

export function useCellEditor<R extends { id: string }>({
  rows,
  editable,
  current,
  fallbackDescription,
  errorId,
}: {
  rows: R[];
  // Rows that edit in place; the others are left alone.
  editable: (row: R) => boolean;
  current: (row: R) => CellValues;
  // What an emptied description becomes: the category's name, or the kind.
  fallbackDescription: (row: R, values: CellValues) => string;
  // The id of the error line, so an invalid cell can point to it.
  errorId: string;
}) {
  const currency = useCurrency();
  const update = useUpdateTransaction();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [announce, setAnnounce] = useState('');
  // What was just saved, shown until the refreshed rows arrive, so a cell
  // never flickers back to its old value.
  const [pending, setPending] = useState<Record<string, TransactionUpdate>>({});
  const cells = useRef(new Map<string, HTMLButtonElement | null>());
  // Enter, Tab and Escape end an edit themselves; the blur that follows
  // must not save it a second time.
  const handled = useRef(false);

  const signature = rows.map((row) => `${row.id}${JSON.stringify(current(row))}`).join('|');
  // When fresh rows arrive, what they show is what was saved.
  const [seen, setSeen] = useState(signature);
  if (seen !== signature) {
    setSeen(signature);
    setPending({});
  }

  const ids = rows.filter(editable).map((row) => row.id);

  const valuesOf = (row: R): CellValues => {
    const base = current(row);
    const over = pending[row.id] ?? {};
    const pick = <K extends keyof CellValues>(key: K): CellValues[K] =>
      over[key] !== undefined ? (over[key] as CellValues[K]) : base[key];
    return {
      occurred_on: pick('occurred_on'),
      description: pick('description'),
      amount_minor: pick('amount_minor'),
      category_id: pick('category_id'),
      from_account_id: pick('from_account_id'),
      to_account_id: pick('to_account_id'),
    };
  };

  const textOf = (row: R, field: Field) => {
    const v = valuesOf(row);
    if (field === 'date') return v.occurred_on;
    if (field === 'description') return v.description;
    return toAmountInput(v.amount_minor, currency);
  };

  const save = async (row: R, changes: TransactionUpdate) => {
    setError(null);
    setPending((all) => ({ ...all, [row.id]: { ...all[row.id], ...changes } }));
    try {
      await update.mutateAsync({ id: row.id, changes });
      setAnnounce(`Saved “${changes.description ?? valuesOf(row).description}”.`);
    } catch (cause) {
      setPending((all) => {
        const next = { ...all };
        delete next[row.id];
        return next;
      });
      setError(dataErrorMessage(cause));
    }
  };

  const begin = (row: R, field: Field) => {
    setError(null);
    setDraft({ cell: { row: row.id, field }, text: textOf(row, field) });
  };

  const focusCell = (target: Cell) => cells.current.get(`${target.row}:${target.field}`)?.focus();

  // Saves the draft if it changed. Returns false, keeping the editor open,
  // when the value can't be saved as typed.
  const commit = (open: Draft): boolean => {
    const row = rows.find((r) => r.id === open.cell.row);
    if (!row) return true;
    const v = valuesOf(row);
    const result = parseCell(open.cell.field, open.text, v, {
      currency,
      fallbackDescription: fallbackDescription(row, v),
    });
    if (!result.ok) {
      setError(result.message);
      return false;
    }
    if (result.changes) void save(row, result.changes);
    return true;
  };

  const finish = (move: Move) => {
    if (!draft) return;
    if (!commit(draft)) return;
    handled.current = true;
    const next = nextCell(ids, draft.cell, move);
    const target = rows.find((r) => r.id === next?.row);
    if (next && target) {
      setDraft({ cell: next, text: textOf(target, next.field) });
    } else {
      const done = draft.cell;
      setDraft(null);
      requestAnimationFrame(() => focusCell(done));
    }
  };

  const cancel = () => {
    if (!draft) return;
    handled.current = true;
    const done = draft.cell;
    setDraft(null);
    setError(null);
    requestAnimationFrame(() => focusCell(done));
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      finish(event.shiftKey ? 'up' : 'down');
    } else if (event.key === 'Tab') {
      event.preventDefault();
      finish(event.shiftKey ? 'left' : 'right');
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      cancel();
    }
  };

  const onBlur = () => {
    if (handled.current) {
      handled.current = false;
      return;
    }
    // Clicking away saves, as a spreadsheet does. If the value can't be
    // saved, the cell goes back and the reason stays on screen.
    if (draft) commit(draft);
    setDraft(null);
  };

  // A typed cell: a button showing the value, or the input while editing.
  // A date is chosen from the calendar instead, and saves on choosing.
  const cell = (row: R, field: Field, shown: ReactNode, label: string) => {
    if (field === 'date') {
      const day = valuesOf(row).occurred_on;
      return (
        <DatePicker
          className="cell-category cell-picker cell-date"
          label={`${label} of “${valuesOf(row).description}”`}
          value={day}
          onChange={(next) => {
            if (next && next !== day) void save(row, { occurred_on: next });
          }}
        />
      );
    }
    if (draft && draft.cell.row === row.id && draft.cell.field === field) {
      return (
        <input
          // A fresh input per cell, so moving along never carries a value over.
          key={`${row.id}:${field}`}
          autoFocus
          className={`cell-input${field === 'amount' ? ' num' : ''}`}
          type="text"
          inputMode={field === 'amount' ? 'decimal' : undefined}
          maxLength={field === 'description' ? 140 : undefined}
          aria-label={label}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          value={draft.text}
          onFocus={(event) => event.currentTarget.select?.()}
          onChange={(event) => setDraft({ ...draft, text: event.target.value })}
          onKeyDown={onKeyDown}
          onBlur={onBlur}
        />
      );
    }
    return (
      <button
        type="button"
        ref={(el) => {
          cells.current.set(`${row.id}:${field}`, el);
        }}
        className={`cell-button${field === 'amount' ? ' num' : ''}`}
        aria-label={`${label}, ${textOf(row, field)}. Edit`}
        onClick={() => begin(row, field)}
      >
        {shown}
      </button>
    );
  };

  // Under the table: why a cell wasn't saved, and a quiet "Saved" for
  // screen readers.
  const status = (
    <>
      {error && (
        <p id={errorId} className="field-error activity-cell-error" role="alert">
          {error}
        </p>
      )}
      <p className="visually-hidden" role="status" aria-live="polite">
        {announce}
      </p>
    </>
  );

  return { valuesOf, save, cell, status, editingRow: draft?.cell.row ?? null };
}
