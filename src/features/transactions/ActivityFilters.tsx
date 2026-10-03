import { useState } from 'react';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import { formatDateShort } from '../../lib/dates';
import { Button } from '../../ui/Button';
import { DatePicker } from '../../ui/DatePicker';
import { FormGroup, FormRow } from '../../ui/Form';
import { Select } from '../../ui/Select';
import { Sheet } from '../../ui/Sheet';
import type { AccountBalance } from '../accounts/queries';
import type { Category } from '../categories/queries';
import type { Filters } from './queries';

// Activity's filters. The kind is the one changed most, so it is a switch
// on the page; search sits beside one Filters button that opens a sheet for
// the account, the category and the dates. Each filter in use shows under
// them as a chip that removes it. No field is outlined: capsules and grouped
// rows, like every other control in Lodestar.

const KINDS: { value: Filters['kind']; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'expense', label: 'Expenses' },
  { value: 'income', label: 'Income' },
  { value: 'transfer', label: 'Transfers' },
];

type Chip = { key: string; label: string; clear: Partial<Filters> };

export function ActivityFilters({
  filters,
  onChange,
  onClear,
  accounts,
  categories,
  total,
  pending,
}: {
  filters: Filters;
  onChange: (changes: Partial<Filters>) => void;
  // Clears everything but the kind and the search, which sit on the page.
  onClear: () => void;
  accounts: AccountBalance[];
  categories: Category[];
  total: number;
  pending: boolean;
}) {
  const [open, setOpen] = useState(false);
  const accountName = accounts.find((a) => a.account_id === filters.accountId)?.name;
  const categoryName = filters.categoryId === 'none' ? 'No category' : categories.find((c) => c.id === filters.categoryId)?.name;

  const chips: Chip[] = [];
  if (filters.accountId !== 'all') chips.push({ key: 'account', label: accountName ?? 'An account', clear: { accountId: 'all' } });
  if (filters.categoryId !== 'all') chips.push({ key: 'category', label: categoryName ?? 'A category', clear: { categoryId: 'all' } });
  if (filters.from || filters.to) {
    const label =
      filters.from && filters.to
        ? `${formatDateShort(filters.from)} – ${formatDateShort(filters.to)}`
        : filters.from
          ? `From ${formatDateShort(filters.from)}`
          : `To ${formatDateShort(filters.to)}`;
    chips.push({ key: 'dates', label, clear: { from: '', to: '' } });
  }

  return (
    <section className="activity-filters" aria-label="Filters" data-tour="activity-filters">
      <div className="segmented segmented-pill kind-switch" role="radiogroup" aria-label="Kind">
        {KINDS.map((kind) => (
          <label key={kind.value}>
            <input
              type="radio"
              name="activity-kind"
              value={kind.value}
              checked={filters.kind === kind.value}
              onChange={() => onChange({ kind: kind.value })}
            />
            {kind.label}
          </label>
        ))}
      </div>

      <div className="filter-line">
        <label className="search-capsule">
          <Search strokeWidth={1.75} aria-hidden />
          <input
            type="search"
            placeholder="Search"
            aria-label="Search descriptions and notes"
            defaultValue={filters.search}
            onChange={(e) => onChange({ search: e.target.value })}
          />
        </label>
        <button type="button" className="capsule-button" onClick={() => setOpen(true)} aria-haspopup="dialog">
          <SlidersHorizontal strokeWidth={1.75} aria-hidden />
          Filters
          {chips.length > 0 && ' '}
          {chips.length > 0 && (
            <span className="capsule-count">
              {chips.length}
              <span className="visually-hidden"> in use</span>
            </span>
          )}
        </button>
      </div>

      {chips.length > 0 && (
        <ul className="filter-chips" aria-label="Filters in use">
          {chips.map((chip) => (
            <li key={chip.key}>
              <button type="button" className="filter-chip" onClick={() => onChange(chip.clear)} aria-label={`Remove filter: ${chip.label}`}>
                {chip.label}
                <X strokeWidth={1.75} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="Filters"
        leading={
          <button type="button" className="btn btn-plain" onClick={onClear} disabled={chips.length === 0}>
            Clear
          </button>
        }
        footer={
          <Button variant="plain" className="btn-compact" onClick={() => setOpen(false)}>
            Done
          </Button>
        }
      >
        <div className="stack filters-sheet">
          <FormGroup title="Where">
            <FormRow label="Account" htmlFor="filter-account">
              <Select
                id="filter-account"
                label="Account"
                value={filters.accountId}
                onChange={(next) => onChange({ accountId: next })}
                options={[{ value: 'all', label: 'All' }, ...accounts.map((a) => ({ value: a.account_id, label: a.name }))]}
              />
            </FormRow>
            <FormRow label="Category" htmlFor="filter-category">
              <Select
                id="filter-category"
                label="Category"
                value={filters.categoryId}
                onChange={(next) => onChange({ categoryId: next })}
                options={[
                  { value: 'all', label: 'All' },
                  { value: 'none', label: 'No category' },
                  ...categories.map((c) => ({ value: c.id, label: c.name })),
                ]}
              />
            </FormRow>
          </FormGroup>
          <FormGroup title="When">
            <FormRow label="From" htmlFor="filter-from">
              <DatePicker
                id="filter-from"
                label="From date"
                placeholder="Any date"
                clearable
                value={filters.from}
                max={filters.to || undefined}
                onChange={(next) => onChange({ from: next })}
              />
            </FormRow>
            <FormRow label="To" htmlFor="filter-to">
              <DatePicker
                id="filter-to"
                label="To date"
                placeholder="Any date"
                clearable
                value={filters.to}
                min={filters.from || undefined}
                onChange={(next) => onChange({ to: next })}
              />
            </FormRow>
          </FormGroup>
          <Button block onClick={() => setOpen(false)}>
            {pending ? 'Show transactions' : `Show ${total} ${total === 1 ? 'transaction' : 'transactions'}`}
          </Button>
        </div>
      </Sheet>
    </section>
  );
}
