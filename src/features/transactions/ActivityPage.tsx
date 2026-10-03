import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { ArrowLeftRight, Ellipsis } from 'lucide-react';
import { useCurrency, useProfile } from '../../lib/profile';
import { formatDate, formatDateShort, todayInZone } from '../../lib/dates';
import { PHONE, useMediaQuery } from '../../lib/media';
import { Amount } from '../../ui/Amount';
import { Button } from '../../ui/Button';
import { DatePicker } from '../../ui/DatePicker';
import { EmptyState } from '../../ui/EmptyState';
import { Notice } from '../../ui/Notice';
import { Select } from '../../ui/Select';
import { dataErrorMessage } from '../auth/errors';
import { useAccounts } from '../accounts/queries';
import { sortForPicker, useCategories, useCategoryUsage } from '../categories/queries';
import { TransactionSheet } from './TransactionSheet';
import { useCellEditor } from './useCellEditor';
import {
  DEFAULT_FILTERS,
  PAGE_SIZE,
  useTransactions,
  type Filters,
  type Transaction,
  type TxnKind,
} from './queries';

// Filters live in the URL, so a filtered view can be bookmarked, shared with
// yourself, and survives a reload.
function readFilters(params: URLSearchParams): Filters {
  const value = <K extends keyof Filters>(key: K, fallback: Filters[K]): string => params.get(key) ?? String(fallback);
  const page = Number(params.get('page') ?? '1');
  return {
    search: params.get('search') ?? '',
    kind: value('kind', 'all') as Filters['kind'],
    accountId: value('accountId', 'all'),
    categoryId: value('categoryId', 'all'),
    from: params.get('from') ?? '',
    to: params.get('to') ?? '',
    sort: (params.get('sort') === 'amount_minor' ? 'amount_minor' : 'occurred_on') as Filters['sort'],
    direction: (params.get('direction') === 'asc' ? 'asc' : 'desc') as Filters['direction'],
    page: Number.isFinite(page) && page > 0 ? Math.floor(page) : 1,
  };
}

function writeFilters(filters: Filters): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    const fallback = DEFAULT_FILTERS[key as keyof Filters];
    if (String(value) !== String(fallback)) params.set(key, String(value));
  }
  return params;
}

// The header carries the sort state; the button inside it only acts.
function sortState(filters: Filters, column: Filters['sort']): 'ascending' | 'descending' | 'none' {
  if (filters.sort !== column) return 'none';
  return filters.direction === 'asc' ? 'ascending' : 'descending';
}

const KIND_LABEL: Record<TxnKind, string> = { expense: 'Expense', income: 'Income', transfer: 'Transfer' };

const PHONE_PAGE_SIZE = 25;

export function ActivityPage() {
  const [params, setParams] = useSearchParams();
  const filters = useMemo(() => readFilters(params), [params]);
  const profile = useProfile();
  // A phone reads a list, not a table, and a shorter page of it: fifty rows
  // put the page buttons some seven thousand pixels down.
  const phone = useMediaQuery(PHONE);
  const pageSize = phone ? PHONE_PAGE_SIZE : PAGE_SIZE;
  const page = useTransactions(filters, pageSize);
  const accounts = useAccounts();
  const categories = useCategories();
  const [editing, setEditing] = useState<Transaction | undefined>();
  const [sheetOpen, setSheetOpen] = useState(false);

  const accountName = useMemo(
    () => new Map((accounts.data ?? []).map((a) => [a.account_id, a.name])),
    [accounts.data],
  );
  const categoryName = useMemo(
    () => new Map((categories.data ?? []).map((c) => [c.id, c.name])),
    [categories.data],
  );

  const update = (changes: Partial<Filters>) => {
    setParams(writeFilters({ ...filters, page: 1, ...changes }), { replace: true });
  };

  const rows = page.data?.rows ?? [];
  const total = page.data?.total ?? 0;
  const lastPage = Math.max(1, Math.ceil(total / pageSize));
  const filtered = writeFilters({ ...filters, page: 1 }).toString() !== '';

  const openSheet = (transaction?: Transaction) => {
    setEditing(transaction);
    setSheetOpen(true);
  };

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1 className="large-title">Activity</h1>
          <p className="footnote flush">
            {page.isPending ? 'Loading…' : `${total} ${total === 1 ? 'transaction' : 'transactions'}`}
            {filtered && ' matching your filters'}
          </p>
        </div>
        <Button data-tour="add-transaction" onClick={() => openSheet()}>
          Add transaction
        </Button>
      </header>

      <section className="filters" aria-label="Filters" data-tour="activity-filters">
        <input
          type="search"
          className="search-field"
          placeholder="Search descriptions and notes"
          aria-label="Search"
          defaultValue={filters.search}
          onChange={(e) => update({ search: e.target.value })}
        />
        <Select
          label="Kind"
          value={filters.kind}
          onChange={(next) => update({ kind: next as Filters['kind'] })}
          options={[
            { value: 'all', label: 'All kinds' },
            { value: 'expense', label: 'Expenses' },
            { value: 'income', label: 'Income' },
            { value: 'transfer', label: 'Transfers' },
          ]}
        />
        <Select
          label="Account"
          value={filters.accountId}
          onChange={(next) => update({ accountId: next })}
          options={[
            { value: 'all', label: 'All accounts' },
            ...(accounts.data ?? []).map((a) => ({ value: a.account_id, label: a.name })),
          ]}
        />
        <Select
          label="Category"
          value={filters.categoryId}
          onChange={(next) => update({ categoryId: next })}
          options={[
            { value: 'all', label: 'All categories' },
            { value: 'none', label: 'No category' },
            ...(categories.data ?? []).map((c) => ({ value: c.id, label: c.name })),
          ]}
        />
        {/* A bare date field shows only "mm/dd/yyyy": the two need their names
            on screen, not just in the accessibility tree. They wrap as one
            range, so "To" never ends up alone on a line. */}
        <span className="filter-dates">
          <span className="filter-date">
            <span className="caption" aria-hidden>
              From
            </span>
            <DatePicker
              label="From date"
              placeholder="Any date"
              clearable
              value={filters.from}
              max={filters.to || undefined}
              onChange={(next) => update({ from: next })}
            />
          </span>
          <span className="filter-date">
            <span className="caption" aria-hidden>
              To
            </span>
            <DatePicker
              label="To date"
              placeholder="Any date"
              clearable
              value={filters.to}
              min={filters.from || undefined}
              onChange={(next) => update({ to: next })}
            />
          </span>
        </span>
        {filtered && (
          <Button variant="plain" onClick={() => setParams(new URLSearchParams(), { replace: true })}>
            Clear filters
          </Button>
        )}
      </section>

      {page.isError && <Notice tone="err">{dataErrorMessage(page.error)}</Notice>}

      {page.isSuccess && rows.length === 0 && (
        <EmptyState
          icon={ArrowLeftRight}
          title={filtered ? 'Nothing matches those filters' : 'No transactions yet'}
          action={
            filtered ? (
              <Button variant="secondary" onClick={() => setParams(new URLSearchParams(), { replace: true })}>
                Clear filters
              </Button>
            ) : (
              <Button onClick={() => openSheet()}>Add your first transaction</Button>
            )
          }
        >
          {filtered
            ? 'Try a wider date range, or a different account.'
            : 'Add one by hand, or import a CSV from your bank. You’ll review every row before anything is saved.'}
        </EmptyState>
      )}

      {rows.length > 0 && phone && (
        <PhoneList
          rows={rows}
          byDay={filters.sort === 'occurred_on'}
          today={todayInZone(profile.data?.timezone)}
          accountName={accountName}
          categoryName={categoryName}
          onOpen={openSheet}
        />
      )}

      {rows.length > 0 && !phone && (
        <ActivityTable rows={rows} filters={filters} onSort={setParams} categoryName={categoryName} onOpen={openSheet} />
      )}

      {lastPage > 1 && (
        <nav className="pager" aria-label="Pages">
          <Button
            variant="secondary"
            disabled={filters.page <= 1}
            onClick={() => setParams(writeFilters({ ...filters, page: filters.page - 1 }), { replace: true })}
          >
            Previous
          </Button>
          <span className="footnote">
            Page {filters.page} of {lastPage}
          </span>
          <Button
            variant="secondary"
            disabled={filters.page >= lastPage}
            onClick={() => setParams(writeFilters({ ...filters, page: filters.page + 1 }), { replace: true })}
          >
            Next
          </Button>
        </nav>
      )}

      {sheetOpen && <TransactionSheet transaction={editing} onClose={() => setSheetOpen(false)} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The wide table, edited like a spreadsheet: click a date, description or
// amount and type (Enter saves and moves down, Tab moves along, Escape puts
// it back); category and accounts are pickers that save on choosing. The
// kind, notes and deleting are in the full form, at the end of each row.
// ---------------------------------------------------------------------------
function ActivityTable({
  rows,
  filters,
  onSort,
  categoryName,
  onOpen,
}: {
  rows: Transaction[];
  filters: Filters;
  onSort: (params: URLSearchParams, options: { replace: boolean }) => void;
  categoryName: Map<string, string>;
  onOpen: (row: Transaction) => void;
}) {
  const currency = useCurrency();
  const accounts = useAccounts();
  const categories = useCategories();
  const usage = useCategoryUsage();
  const editor = useCellEditor({
    rows,
    editable: () => true,
    current: (row) => ({
      occurred_on: row.occurred_on,
      description: row.description,
      amount_minor: row.amount_minor,
      category_id: row.category_id,
      from_account_id: row.from_account_id,
      to_account_id: row.to_account_id,
    }),
    fallbackDescription: (row, v) => (v.category_id && categoryName.get(v.category_id)) || KIND_LABEL[row.kind],
    errorId: 'activity-table-error',
  });
  const { cell, save, valuesOf } = editor;

  const pickable = (kind: TxnKind) =>
    sortForPicker(
      (categories.data ?? []).filter((c) => !c.archived_at),
      usage.data,
    ).filter((c) => c.kind === (kind === 'income' ? 'income' : 'expense'));

  const categoryOptions = (kind: TxnKind, current: string | null) => {
    const list = pickable(kind);
    return [
      { value: '', label: 'No category' },
      ...list.map((c) => ({ value: c.id, label: c.name })),
      // An archived category a row still uses keeps its name.
      ...(current && !list.some((c) => c.id === current)
        ? [{ value: current, label: categoryName.get(current) ?? 'Archived category' }]
        : []),
    ];
  };

  // Open accounts, plus an archived one the row already uses, so its name shows.
  const accountOptions = (current: string | null) =>
    (accounts.data ?? [])
      .filter((a) => !a.archived_at || a.account_id === current)
      .map((a) => ({ value: a.account_id, label: a.name }));

  const accountPicker = (row: Transaction, side: 'from_account_id' | 'to_account_id', label: string) => {
    const v = valuesOf(row);
    const value = v[side];
    const other = side === 'from_account_id' ? v.to_account_id : v.from_account_id;
    return (
      <Select
        className="cell-category cell-picker"
        label={`${label} of “${v.description}”`}
        placeholder="Choose"
        value={value ?? ''}
        onChange={(next) => {
          if (!next || next === value) return;
          // A transfer can't go from an account to itself: choosing the
          // other side's account swaps the two.
          if (row.kind === 'transfer' && next === other) {
            void save(row, { from_account_id: v.to_account_id, to_account_id: v.from_account_id });
          } else {
            void save(row, { [side]: next });
          }
        }}
        options={accountOptions(value)}
        emptyText="Add an account first."
      />
    );
  };

  return (
    <>
      <div className="table-wrap">
        <table className="ledger activity-sheet">
          <thead>
            <tr>
              <th scope="col" aria-sort={sortState(filters, 'occurred_on')}>
                <SortButton filters={filters} column="occurred_on" label="Date" onSort={onSort} />
              </th>
              <th scope="col">Description</th>
              <th scope="col">Category</th>
              <th scope="col">Account</th>
              <th scope="col" className="num" aria-sort={sortState(filters, 'amount_minor')}>
                <SortButton filters={filters} column="amount_minor" label="Amount" onSort={onSort} />
              </th>
              <th scope="col" className="activity-full-col">
                <span className="visually-hidden">Full form</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const v = valuesOf(row);
              return (
                <tr key={row.id} data-editing={editor.editingRow === row.id || undefined}>
                  <td className="cell nowrap">{cell(row, 'date', formatDate(v.occurred_on), 'Date')}</td>
                  <td className="cell">{cell(row, 'description', v.description, 'Description')}</td>
                  <td className="cell secondary">
                    {row.kind === 'transfer' ? (
                      <span className="cell-static">—</span>
                    ) : (
                      <Select
                        className="cell-category cell-picker"
                        label={`Category of “${v.description}”`}
                        placeholder="No category"
                        value={v.category_id ?? ''}
                        onChange={(next) => {
                          if (next !== (v.category_id ?? '')) void save(row, { category_id: next || null });
                        }}
                        emptyText="No categories of this kind yet."
                        options={categoryOptions(row.kind, v.category_id)}
                      />
                    )}
                  </td>
                  <td className="cell secondary">
                    {row.kind === 'transfer' ? (
                      <span className="cell-transfer">
                        {accountPicker(row, 'from_account_id', 'From account')}
                        <span aria-hidden>→</span>
                        {accountPicker(row, 'to_account_id', 'To account')}
                      </span>
                    ) : (
                      accountPicker(row, row.kind === 'expense' ? 'from_account_id' : 'to_account_id', 'Account')
                    )}
                  </td>
                  <td className="cell num">
                    {cell(
                      row,
                      'amount',
                      <>
                        <Amount
                          minor={row.kind === 'expense' ? -v.amount_minor : v.amount_minor}
                          currency={currency}
                          signed={row.kind !== 'transfer'}
                        />
                        <span className="visually-hidden"> {KIND_LABEL[row.kind]}</span>
                      </>,
                      'Amount',
                    )}
                  </td>
                  <td className="activity-full-col">
                    <button
                      type="button"
                      className="activity-full"
                      aria-label={`Open “${v.description}” in the full form`}
                      title="Kind, notes and delete"
                      onClick={() => onOpen(row)}
                    >
                      <Ellipsis strokeWidth={1.75} aria-hidden />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {editor.status}
    </>
  );
}

function SortButton({
  filters,
  column,
  label,
  onSort,
}: {
  filters: Filters;
  column: Filters['sort'];
  label: string;
  onSort: (params: URLSearchParams, options: { replace: boolean }) => void;
}) {
  const active = filters.sort === column;
  const direction = active && filters.direction === 'asc' ? 'desc' : 'asc';
  return (
    <button
      type="button"
      className="link-button"
      onClick={() => onSort(writeFilters({ ...filters, sort: column, direction, page: 1 }), { replace: true })}
    >
      {label}
      {active && <span aria-hidden="true">{filters.direction === 'asc' ? ' ↑' : ' ↓'}</span>}
    </button>
  );
}

// ---------------------------------------------------------------------------
// The phone's ledger. The table hid its Category and Account columns below
// 768 px, which left a transfer reading "Emergency fund $500.00" with no
// account, arrow or sign, and repeated the full date on every row. Here each
// transaction is one row you can tap: what it was, then its category and
// account (or from → to), and the amount. Rows sit under their day, so the
// date is said once. Sorted by amount, days mean nothing, so the date moves
// into each row instead.
// ---------------------------------------------------------------------------

function dayLabel(day: string, today: string): string {
  if (day === today) return 'Today';
  const yesterday = new Date(`${today}T00:00:00Z`);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  if (day === yesterday.toISOString().slice(0, 10)) return 'Yesterday';
  return day.slice(0, 4) === today.slice(0, 4) ? formatDateShort(day) : formatDate(day);
}

function detailOf(row: Transaction, accountName: Map<string, string>, categoryName: Map<string, string>): string {
  const account = (id: string | null) => (id ? accountName.get(id) : undefined) ?? 'another account';
  if (row.kind === 'transfer') return `${account(row.from_account_id)} → ${account(row.to_account_id)}`;
  const category = row.category_id ? categoryName.get(row.category_id) : undefined;
  return `${category ?? 'No category'} · ${account(row.from_account_id ?? row.to_account_id)}`;
}

function PhoneList({
  rows,
  byDay,
  today,
  accountName,
  categoryName,
  onOpen,
}: {
  rows: Transaction[];
  byDay: boolean;
  today: string;
  accountName: Map<string, string>;
  categoryName: Map<string, string>;
  onOpen: (row: Transaction) => void;
}) {
  const currency = useCurrency();

  // Rows arrive in date order when sorted by date, so each day is one run.
  const days: { day: string | null; items: Transaction[] }[] = [];
  for (const row of rows) {
    const day = byDay ? row.occurred_on : null;
    const last = days[days.length - 1];
    if (last && last.day === day) last.items.push(row);
    else days.push({ day, items: [row] });
  }

  return (
    <div className="stack-tight">
      {days.map(({ day, items }) => (
        <div key={day ?? 'all'}>
          {day && <h2 className="form-group-title">{dayLabel(day, today)}</h2>}
          <ul className="rows-list">
            {items.map((row) => (
              <li key={row.id}>
                <button type="button" className="row-button" onClick={() => onOpen(row)}>
                  <span className="row-label">
                    {row.description}
                    <small>
                      {!byDay && `${formatDateShort(row.occurred_on)} · `}
                      {detailOf(row, accountName, categoryName)}
                    </small>
                  </span>
                  <span className="phone-amount">
                    <Amount
                      minor={row.kind === 'expense' ? -row.amount_minor : row.amount_minor}
                      currency={currency}
                      signed={row.kind !== 'transfer'}
                    />
                    <span className="visually-hidden"> {KIND_LABEL[row.kind]}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
