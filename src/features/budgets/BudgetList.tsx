import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useCurrency } from '../../lib/profile';
import { parseMoney, toAmountInput } from '../../lib/money';
import { addMonths, formatMonth } from '../../lib/dates';
import { budgetLinePath } from '../../lib/routes';
import { Amount } from '../../ui/Amount';
import { Button } from '../../ui/Button';
import { Notice } from '../../ui/Notice';
import { dataErrorMessage } from '../auth/errors';
import { useCategories, useCategoryGroups } from '../categories/queries';
import { totalsOf, useBudgets, useCopyBudgets, useSetBudget, type BudgetProgress } from './queries';

// A row per expense category: what you planned, what you spent, what's left.
// Left is allowed to go negative and is shown as "Over plan by", because a
// number clamped at zero hides the thing you most need to see.
// The month lives in the address (/budgets/2026-09), so a month can be linked
// to from the Overview, a report or a month page.
export function BudgetList({ month, onMonth }: { month: string; onMonth: (month: string) => void }) {
  const currency = useCurrency();
  const budgets = useBudgets(month);
  const categories = useCategories();
  const groups = useCategoryGroups();
  const setBudget = useSetBudget();
  const copy = useCopyBudgets();
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<number | null>(null);

  const groupName = useMemo(() => new Map((groups.data ?? []).map((g) => [g.id, g.name])), [groups.data]);
  const byCategory = useMemo(
    () => new Map((budgets.data ?? []).map((row) => [row.category_id, row])),
    [budgets.data],
  );

  // Every expense category gets a row, planned or not: a category with no
  // plan is the common case, not an error.
  const rows = useMemo(() => {
    const expense = (categories.data ?? []).filter((c) => c.kind === 'expense' && !c.archived_at);
    return expense
      .map((category) => ({ category, progress: byCategory.get(category.id) }))
      .sort((a, b) => {
        const groupA = groupName.get(a.category.group_id ?? '') ?? 'Ungrouped';
        const groupB = groupName.get(b.category.group_id ?? '') ?? 'Ungrouped';
        return groupA === groupB ? a.category.name.localeCompare(b.category.name) : groupA.localeCompare(groupB);
      });
  }, [categories.data, byCategory, groupName]);

  const totals = totalsOf(budgets.data ?? []);
  const planned = rows.filter((row) => row.progress).length;

  const save = async (categoryId: string, budgetId: string | undefined, text: string) => {
    setError(null);
    setCopied(null);
    const trimmed = text.trim();
    if (trimmed === '') {
      await setBudget.mutateAsync({ budgetId, categoryId, month, amountMinor: null }).catch((cause) => setError(dataErrorMessage(cause)));
      return;
    }
    const parsed = parseMoney(trimmed, currency);
    if (!parsed.ok) {
      setError(parsed.message);
      return;
    }
    await setBudget
      .mutateAsync({ budgetId, categoryId, month, amountMinor: parsed.minor })
      .catch((cause) => setError(dataErrorMessage(cause)));
  };

  return (
    <section className="stack">
      <header className="page-head">
        <nav className="month-nav" aria-label="Month">
          <Button variant="secondary" aria-label="Previous month" onClick={() => onMonth(addMonths(month, -1))}>
            <ChevronLeft strokeWidth={1.75} aria-hidden />
          </Button>
          <h2 className="title-2">{formatMonth(month)}</h2>
          <Button variant="secondary" aria-label="Next month" onClick={() => onMonth(addMonths(month, 1))}>
            <ChevronRight strokeWidth={1.75} aria-hidden />
          </Button>
        </nav>
        {planned === 0 && rows.length > 0 && (
          <Button
            variant="secondary"
            busy={copy.isPending}
            onClick={async () => {
              setError(null);
              const inserted = await copy
                .mutateAsync({ from: addMonths(month, -1), to: month })
                .catch((cause) => {
                  setError(dataErrorMessage(cause));
                  return null;
                });
              if (inserted !== null) setCopied(inserted);
            }}
          >
            Copy last month’s plan
          </Button>
        )}
      </header>

      {budgets.isError && <Notice tone="err">{dataErrorMessage(budgets.error)}</Notice>}
      {error && <Notice tone="err">{error}</Notice>}
      {copied !== null && (
        <Notice tone={copied === 0 ? 'info' : 'ok'}>
          {copied === 0
            ? 'Last month had no plan to copy.'
            : `${copied} ${copied === 1 ? 'plan' : 'plans'} copied from ${formatMonth(addMonths(month, -1))}.`}
        </Notice>
      )}

      {rows.length === 0 ? (
        <p className="secondary">Add an expense category below, then plan an amount for it here.</p>
      ) : (
        <>
          <div className="group figure-group">
            <h3 className="caption">Left to spend</h3>
            <p className="fig flush">
              <span className="bracket">
                <Amount minor={totals.left} currency={currency} />
              </span>
            </p>
            <p className="footnote flush">
              <Amount minor={totals.spent} currency={currency} /> spent of{' '}
              <Amount minor={totals.planned} currency={currency} /> planned
              {totals.over > 0 && (
                <>
                  {' · '}
                  <Amount minor={totals.over} currency={currency} /> over plan in some categories
                </>
              )}
            </p>
          </div>

          <ul className="rows-list">
            {rows.map(({ category, progress }) => (
              <BudgetRow
                key={`${month}-${category.id}`}
                name={category.name}
                to={budgetLinePath(month, category.id)}
                group={groupName.get(category.group_id ?? '') ?? 'Ungrouped'}
                progress={progress}
                currency={currency}
                onSave={(text) => save(category.id, progress?.budget_id, text)}
              />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function BudgetRow({
  name,
  to,
  group,
  progress,
  currency,
  onSave,
}: {
  name: string;
  to: string;
  group: string;
  progress: BudgetProgress | undefined;
  currency: Parameters<typeof toAmountInput>[1];
  onSave: (text: string) => void;
}) {
  const [text, setText] = useState(progress ? toAmountInput(progress.planned_minor, currency) : '');
  const planned = progress?.planned_minor ?? 0;
  const spent = progress?.spent_minor ?? 0;
  const left = progress?.left_minor ?? 0;
  const over = left < 0;
  // The bar fills to the share spent; over plan it fills completely and takes
  // the hatched treatment, so the state is never colour alone.
  const share = planned > 0 ? Math.min(100, Math.round((spent / planned) * 100)) : 0;

  return (
    <li className="budget-row">
      <div className="budget-head">
        <span className="row-label">
          <Link to={to}>{name}</Link>
          <small>{group}</small>
        </span>
        <label className="budget-amount">
          <span className="visually-hidden">Planned for {name}</span>
          <input
            inputMode="decimal"
            className="num"
            placeholder="No plan"
            value={text}
            onChange={(event) => setText(event.target.value)}
            onBlur={() => onSave(text)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.currentTarget.blur();
            }}
          />
        </label>
      </div>

      {progress && (
        <>
          <div className={`prog${over ? ' over' : ''}`} role="presentation">
            <i style={{ width: `${share}%` }} />
          </div>
          <p className="footnote flush">
            <Amount minor={spent} currency={currency} /> spent ·{' '}
            {over ? (
              <>
                Over plan by <Amount minor={-left} currency={currency} />
              </>
            ) : (
              <>
                <Amount minor={left} currency={currency} /> left
              </>
            )}
          </p>
        </>
      )}
    </li>
  );
}
