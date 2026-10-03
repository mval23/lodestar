import { useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Ellipsis, Plus } from 'lucide-react';
import { useCurrency } from '../../lib/profile';
import { parseMoney } from '../../lib/money';
import { formatDateShort } from '../../lib/dates';
import { Amount } from '../../ui/Amount';
import { Button } from '../../ui/Button';
import { DatePicker } from '../../ui/DatePicker';
import { Select } from '../../ui/Select';
import { dataErrorMessage } from '../auth/errors';
import { useAccounts } from '../accounts/queries';
import { sortForPicker, useCategories, useCategoryUsage } from '../categories/queries';
import { TransactionSheet } from './TransactionSheet';
import { useCellEditor } from './useCellEditor';
import {
  directionProblem,
  useCreateTransaction,
  useTransaction,
  type Transaction,
  type TxnKind,
} from './queries';

// The activity half of a detail page: tabs by kind, a quick-add row at the
// top of each table, and the rows. The tab you are on decides the kind, so
// the quick-add row can never produce a row the schema would reject.

export const KIND_LABEL: Record<TxnKind, string> = { income: 'Income', expense: 'Expenses', transfer: 'Transfers' };
const KIND_SINGULAR: Record<TxnKind, string> = { income: 'income', expense: 'an expense', transfer: 'a transfer' };
// What an emptied description falls back to when there is no category.
const KIND_LABEL_SINGULAR: Record<TxnKind, string> = { income: 'Income', expense: 'Expense', transfer: 'Transfer' };
export const KIND_ORDER: TxnKind[] = ['income', 'expense', 'transfer'];

// A tab can carry its total and row count, or be just its name.
export type KindTab = { kind: TxnKind; summary?: ReactNode; count?: number };

// A tablist in the WAI-ARIA pattern: arrow keys move between tabs, and only
// the selected tab is in the tab order.
export function KindTabs({
  tabs,
  value,
  onChange,
  label,
  children,
}: {
  tabs: KindTab[];
  value: TxnKind;
  onChange: (kind: TxnKind) => void;
  label: string;
  children: ReactNode;
}) {
  const base = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const onKey = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = tabs.length - 1;
    let next: number | null = null;
    if (event.key === 'ArrowRight') next = index === last ? 0 : index + 1;
    if (event.key === 'ArrowLeft') next = index === 0 ? last : index - 1;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = last;
    if (next === null) return;
    event.preventDefault();
    onChange(tabs[next]!.kind);
    refs.current[next]?.focus();
  };

  return (
    <div className="kind-tabs">
      <div role="tablist" aria-label={label} className="kind-tablist">
        {tabs.map((tab, index) => {
          const selected = tab.kind === value;
          return (
            <button
              key={tab.kind}
              ref={(el) => {
                refs.current[index] = el;
              }}
              type="button"
              role="tab"
              id={`${base}-tab-${tab.kind}`}
              aria-selected={selected}
              aria-controls={`${base}-panel`}
              tabIndex={selected ? 0 : -1}
              className="kind-tab"
              onClick={() => onChange(tab.kind)}
              onKeyDown={(event) => onKey(event, index)}
            >
              <span className="kind-tab-label">{KIND_LABEL[tab.kind]}</span>
              {tab.summary !== undefined && <span className="kind-tab-total">{tab.summary}</span>}
              {tab.count !== undefined && (
                <span className="kind-tab-count">
                  {tab.count} {tab.count === 1 ? 'row' : 'rows'}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div role="tabpanel" id={`${base}-panel`} aria-labelledby={`${base}-tab-${value}`} className="kind-panel">
        {children}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Quick add
// ---------------------------------------------------------------------------

export type QuickAddScope = {
  kind: TxnKind;
  // The page's own account, when there is one. Income arrives in it, an
  // expense leaves it, and a transfer goes either way from it.
  accountId?: string;
  // The page's own category, when there is one. It also fixes the kind.
  categoryId?: string;
  categoryName?: string;
  defaultDate: string;
};

export function QuickAdd({ scope }: { scope: QuickAddScope }) {
  const currency = useCurrency();
  const accounts = useAccounts();
  const categories = useCategories();
  const usage = useCategoryUsage();
  const create = useCreateTransaction();
  const { kind } = scope;

  const [date, setDate] = useState(scope.defaultDate);
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  // On an account page a transfer has one other side: "to:<id>" or "from:<id>".
  const [other, setOther] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<string | null>(null);

  const open = (accounts.data ?? []).filter((a) => !a.archived_at);
  const others = open.filter((a) => a.account_id !== scope.accountId);
  const pickable = useMemo(
    () =>
      sortForPicker(
        (categories.data ?? []).filter((c) => !c.archived_at),
        usage.data,
      ).filter((c) => c.kind === (kind === 'income' ? 'income' : 'expense')),
    [categories.data, usage.data, kind],
  );

  // Where the money comes from and goes to, decided by the page and the tab.
  let fromId: string | null = null;
  let toId: string | null = null;
  if (kind === 'expense') fromId = scope.accountId ?? (from || null);
  if (kind === 'income') toId = scope.accountId ?? (to || null);
  if (kind === 'transfer') {
    if (scope.accountId) {
      const [side, id] = other.split(':');
      fromId = side === 'from' ? (id ?? null) : scope.accountId;
      toId = side === 'to' ? (id ?? null) : side === 'from' ? scope.accountId : null;
      if (!other) fromId = scope.accountId;
    } else {
      fromId = from || null;
      toId = to || null;
    }
  }
  const category = kind === 'transfer' ? null : (scope.categoryId ?? (categoryId || null));
  const categoryName = scope.categoryName ?? pickable.find((c) => c.id === category)?.name;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setAdded(null);
    const parsed = parseMoney(amount, currency);
    if (!parsed.ok) return setError(parsed.message);
    const direction = directionProblem({ kind, from_account_id: fromId, to_account_id: toId });
    if (direction) return setError(direction);
    if (fromId && fromId === toId) return setError('Choose two different accounts for a transfer.');
    if (!date) return setError('Choose a date.');
    const text = description.trim() || categoryName || (kind === 'transfer' ? 'Transfer' : KIND_LABEL[kind]);
    try {
      await create.mutateAsync({
        kind,
        amount_minor: parsed.minor,
        occurred_on: date,
        from_account_id: fromId,
        to_account_id: toId,
        category_id: category,
        description: text,
      });
      setDescription('');
      setAmount('');
      setAdded(text);
    } catch (cause) {
      setError(dataErrorMessage(cause));
    }
  };

  const accountOptions = open.map((a) => ({ value: a.account_id, label: a.name }));

  return (
    <form className="quick-add" onSubmit={submit} aria-label={`Add ${KIND_SINGULAR[kind]}`} noValidate>
      <div className="quick-add-fields">
        <Plus strokeWidth={1.75} aria-hidden className="quick-add-icon" />
        {scope.categoryName && <span className="chip quick-add-fixed">{scope.categoryName}</span>}
        <DatePicker label="Date" className="quick-add-date" value={date} onChange={setDate} />
        <input
          aria-label="Description"
          className="quick-add-description"
          maxLength={140}
          placeholder={categoryName ?? (kind === 'income' ? 'Where it came from' : kind === 'expense' ? 'What it was for' : 'What the move is for')}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />

        {kind === 'expense' && !scope.accountId && (
          <Select label="From account" placeholder="From account" value={from} onChange={setFrom} options={accountOptions} emptyText="Add an account first." />
        )}
        {kind === 'income' && !scope.accountId && (
          <Select label="Into account" placeholder="Into account" value={to} onChange={setTo} options={accountOptions} emptyText="Add an account first." />
        )}
        {kind === 'transfer' && scope.accountId && (
          <Select
            label="Other account"
            placeholder="Other account"
            value={other}
            onChange={setOther}
            emptyText="Add a second account to move money between them."
            options={[
              ...others.map((a) => ({ value: `to:${a.account_id}`, label: `To ${a.name}` })),
              ...others.map((a) => ({ value: `from:${a.account_id}`, label: `From ${a.name}` })),
            ]}
          />
        )}
        {kind === 'transfer' && !scope.accountId && (
          <>
            <Select label="From account" placeholder="From" value={from} onChange={setFrom} options={accountOptions} emptyText="Add an account first." />
            <Select label="To account" placeholder="To" value={to} onChange={setTo} options={accountOptions} emptyText="Add an account first." />
          </>
        )}
        {kind !== 'transfer' && !scope.categoryId && (
          <Select
            label="Category"
            placeholder="No category"
            value={categoryId}
            onChange={setCategoryId}
            emptyText="No categories of this kind yet."
            options={[{ value: '', label: 'No category' }, ...pickable.map((c) => ({ value: c.id, label: c.name }))]}
          />
        )}

        <input
          aria-label="Amount"
          className="quick-add-amount num"
          inputMode="decimal"
          placeholder="0.00"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <Button type="submit" busy={create.isPending}>
          Add
        </Button>
      </div>
      <p className="quick-add-status" role="status" aria-live="polite">
        {error ? <span className="field-error">{error}</span> : added ? `Added “${added}”.` : ''}
      </p>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

export type ActivityRow = {
  id: string;
  occurred_on: string;
  description: string;
  detail: string;
  // Already signed for display: negative leaves, positive arrives.
  amount: number;
  signed: boolean;
  balance?: number;
  // With a kind, the row edits in place, cell by cell. Without one, clicking
  // it opens the full form.
  kind?: TxnKind;
  // Given, even as null, the line under the description becomes a category
  // picker. Pages that fix the category leave it out.
  category_id?: string | null;
};

// A table of transactions you can edit like a spreadsheet (useCellEditor):
// click a date, description or amount and type. Everything else (accounts,
// notes, deleting) is in the full form, one click away at the end of the row.
export function ActivityRows({
  rows,
  showBalance,
  empty,
  caption,
}: {
  rows: ActivityRow[];
  showBalance?: boolean;
  empty: string;
  caption: string;
}) {
  const currency = useCurrency();
  const categories = useCategories();
  const usage = useCategoryUsage();
  const [sheet, setSheet] = useState<string | null>(null);
  const categoryName = (id: string | null | undefined) => (categories.data ?? []).find((c) => c.id === id)?.name;

  const editor = useCellEditor({
    rows,
    editable: (row) => Boolean(row.kind),
    current: (row) => ({
      occurred_on: row.occurred_on,
      description: row.description,
      amount_minor: Math.abs(row.amount),
      category_id: row.category_id ?? null,
      from_account_id: null,
      to_account_id: null,
    }),
    fallbackDescription: (row, v) => categoryName(v.category_id) ?? KIND_LABEL_SINGULAR[row.kind ?? 'expense'],
    errorId: 'activity-cell-error',
  });
  const { cell, save } = editor;
  // The amount keeps the sign the page gave the row.
  const valuesOf = (row: ActivityRow) => {
    const v = editor.valuesOf(row);
    return { ...v, amount: row.amount < 0 ? -v.amount_minor : v.amount_minor };
  };

  const pickable = (kind: TxnKind) =>
    sortForPicker(
      (categories.data ?? []).filter((c) => !c.archived_at),
      usage.data,
    ).filter((c) => c.kind === (kind === 'income' ? 'income' : 'expense'));

  return (
    <>
      {rows.length === 0 ? (
        <p className="activity-empty secondary">{empty}</p>
      ) : (
        <table className="ledger activity-table">
          <caption className="visually-hidden">{caption}</caption>
          <thead>
            <tr>
              <th scope="col">Date</th>
              <th scope="col">Description</th>
              <th scope="col" className="num">
                Amount
              </th>
              {showBalance && (
                <th scope="col" className="num">
                  Balance
                </th>
              )}
              <th scope="col" className="activity-full-col">
                <span className="visually-hidden">Full form</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const v = valuesOf(row);
              const inPlace = Boolean(row.kind);
              const choosesCategory = inPlace && row.kind !== 'transfer' && row.category_id !== undefined;
              return (
                <tr key={row.id} data-editing={editor.editingRow === row.id || undefined}>
                  <td className="secondary cell">
                    {inPlace ? cell(row, 'date', formatDateShort(v.occurred_on), 'Date') : formatDateShort(v.occurred_on)}
                  </td>
                  <td className="cell">
                    {inPlace ? (
                      cell(row, 'description', v.description, 'Description')
                    ) : (
                      <button type="button" className="link-button activity-open" onClick={() => setSheet(row.id)}>
                        {row.description}
                      </button>
                    )}
                    {choosesCategory ? (
                      <Select
                        className="cell-category"
                        label={`Category of “${v.description}”`}
                        placeholder="No category"
                        value={v.category_id ?? ''}
                        onChange={(value) => {
                          if (value !== (v.category_id ?? '')) void save(row, { category_id: value || null });
                        }}
                        emptyText="No categories of this kind yet."
                        options={[
                          { value: '', label: 'No category' },
                          ...pickable(row.kind!).map((c) => ({ value: c.id, label: c.name })),
                        ]}
                      />
                    ) : (
                      row.detail && <small className="activity-detail">{row.detail}</small>
                    )}
                  </td>
                  <td className="num cell">
                    {inPlace ? (
                      cell(row, 'amount', <Amount minor={v.amount} currency={currency} signed={row.signed} />, 'Amount')
                    ) : (
                      <Amount minor={v.amount} currency={currency} signed={row.signed} />
                    )}
                  </td>
                  {showBalance && (
                    <td className="num secondary">
                      <Amount minor={row.balance ?? 0} currency={currency} />
                    </td>
                  )}
                  <td className="activity-full-col">
                    <button
                      type="button"
                      className="activity-full"
                      aria-label={`Open “${v.description}” in the full form`}
                      title="Accounts, notes and delete"
                      onClick={() => setSheet(row.id)}
                    >
                      <Ellipsis strokeWidth={1.75} aria-hidden />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {editor.status}
      {sheet && <EditTransactionById id={sheet} onClose={() => setSheet(null)} />}
    </>
  );
}

// Rows from a view carry fewer columns than the sheet edits, so the full
// transaction is fetched first.
export function EditTransactionById({ id, onClose }: { id: string; onClose: () => void }) {
  const transaction = useTransaction(id);
  if (!transaction.data) return null;
  return <TransactionSheet transaction={transaction.data} onClose={onClose} />;
}

// How a transaction reads under its description: its category and the
// account it touched, or both accounts for a transfer.
export function describeTransaction(
  row: Transaction,
  accountName: (id: string | null) => string,
  categoryName: (id: string | null) => string | null,
): string {
  if (row.kind === 'transfer') return `${accountName(row.from_account_id)} → ${accountName(row.to_account_id)}`;
  const category = categoryName(row.category_id);
  const account =
    row.kind === 'income' ? `Into ${accountName(row.to_account_id)}` : `From ${accountName(row.from_account_id)}`;
  return category ? `${category} · ${account}` : account;
}

export function signedAmount(row: Pick<Transaction, 'kind' | 'amount_minor'>): number {
  return row.kind === 'expense' ? -row.amount_minor : row.amount_minor;
}
