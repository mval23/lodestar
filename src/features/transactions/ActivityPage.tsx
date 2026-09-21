import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { ArrowLeftRight } from 'lucide-react';
import { useCurrency } from '../../lib/profile';
import { formatDate } from '../../lib/dates';
import { accountPath, categoryPath } from '../../lib/routes';
import { Amount } from '../../ui/Amount';
import { Button } from '../../ui/Button';
import { EmptyState } from '../../ui/EmptyState';
import { Notice } from '../../ui/Notice';
import { Select } from '../../ui/Select';
import { dataErrorMessage } from '../auth/errors';
import { useAccounts } from '../accounts/queries';
import { useCategories } from '../categories/queries';
import { TransactionSheet } from './TransactionSheet';
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

export function ActivityPage() {
  const currency = useCurrency();
  const [params, setParams] = useSearchParams();
  const filters = useMemo(() => readFilters(params), [params]);
  const page = useTransactions(filters);
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
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));
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
        <Button onClick={() => openSheet()}>Add transaction</Button>
      </header>

      <section className="filters" aria-label="Filters">
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
            ...(categories.data ?? []).map((c) => ({ value: c.id, label: c.name })),
          ]}
        />
        <input
          type="date"
          aria-label="From date"
          value={filters.from}
          onChange={(e) => update({ from: e.target.value })}
        />
        <input type="date" aria-label="To date" value={filters.to} onChange={(e) => update({ to: e.target.value })} />
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

      {rows.length > 0 && (
        <div className="table-wrap">
          <table className="ledger">
            <thead>
              <tr>
                <th scope="col" aria-sort={sortState(filters, 'occurred_on')}>
                  <SortButton filters={filters} column="occurred_on" label="Date" onSort={setParams} />
                </th>
                <th scope="col">Description</th>
                <th scope="col">Category</th>
                <th scope="col">Account</th>
                <th scope="col" className="num" aria-sort={sortState(filters, 'amount_minor')}>
                  <SortButton filters={filters} column="amount_minor" label="Amount" onSort={setParams} />
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                return (
                  <tr key={row.id}>
                    <td>
                      <button type="button" className="link-button" onClick={() => openSheet(row)}>
                        {formatDate(row.occurred_on)}
                      </button>
                    </td>
                    <td>{row.description}</td>
                    <td className="secondary">
                      {row.category_id && categoryName.has(row.category_id) ? (
                        <Link to={categoryPath(row.category_id)}>{categoryName.get(row.category_id)}</Link>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="secondary">
                      {row.kind === 'transfer' ? (
                        <>
                          <AccountLink id={row.from_account_id} names={accountName} /> →{' '}
                          <AccountLink id={row.to_account_id} names={accountName} />
                        </>
                      ) : (
                        <AccountLink id={row.from_account_id ?? row.to_account_id} names={accountName} />
                      )}
                    </td>
                    <td className="num">
                      <Amount
                        minor={row.kind === 'expense' ? -row.amount_minor : row.amount_minor}
                        currency={currency}
                        signed={row.kind !== 'transfer'}
                      />
                      <span className="visually-hidden"> {KIND_LABEL[row.kind]}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
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

// The account a row touched opens its own page, when the name is known.
function AccountLink({ id, names }: { id: string | null; names: Map<string, string> }) {
  const name = id ? names.get(id) : undefined;
  if (!id || !name) return <>—</>;
  return <Link to={accountPath(id)}>{name}</Link>;
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
