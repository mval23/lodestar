import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { ChartPie } from 'lucide-react';
import { categoryPath } from '../../lib/routes';
import { Button } from '../../ui/Button';
import { DetailHeader } from '../../ui/Detail';
import { EmptyState } from '../../ui/EmptyState';
import { FieldErrors, FormGroup, FormRow } from '../../ui/Form';
import { Notice } from '../../ui/Notice';
import { Select } from '../../ui/Select';
import { Sheet } from '../../ui/Sheet';
import { dataErrorMessage } from '../auth/errors';
import {
  useCategories,
  useCategoryGroups,
  useCategoryUsage,
  useCreateCategory,
  useCreateCategoryGroup,
  useDeleteCategory,
  useMergeCategories,
  useUpdateCategory,
  type Category,
  type CategoryKind,
} from './queries';

// Categories have a page of their own. They used to sit under the budget plan
// on one long page, which listed every category twice and buried the plan
// under its own upkeep. A plan is used every week; this is visited when
// something needs renaming, grouping, merging or archiving.
export function CategoriesPage() {
  const categories = useCategories();
  const groups = useCategoryGroups();
  const usage = useCategoryUsage();
  const [editing, setEditing] = useState<Category | undefined>();
  const [sheetOpen, setSheetOpen] = useState(false);

  const useCount = useMemo(
    () => new Map((usage.data ?? []).map((u) => [u.category_id, u.use_count])),
    [usage.data],
  );
  const groupName = useMemo(() => new Map((groups.data ?? []).map((g) => [g.id, g.name])), [groups.data]);

  const rows = categories.data ?? [];
  const active = rows.filter((c) => !c.archived_at);
  const archived = rows.filter((c) => c.archived_at);

  const byGroup = useMemo(() => {
    const map = new Map<string, Category[]>();
    for (const category of active) {
      const key = category.group_id ?? '';
      map.set(key, [...(map.get(key) ?? []), category]);
    }
    return [...map.entries()].sort(([a], [b]) => (groupName.get(a) ?? 'Ungrouped').localeCompare(groupName.get(b) ?? 'Ungrouped'));
  }, [active, groupName]);

  const open = (category?: Category) => {
    setEditing(category);
    setSheetOpen(true);
  };

  return (
    <div className="page">
      <DetailHeader
        back={{ to: '/budgets', label: 'Budgets' }}
        title="Categories"
        subtitle="A category is what money was for. A budget plans one category for one month."
        actions={<Button onClick={() => open()}>Add category</Button>}
      />

      {categories.isError && <Notice tone="err">{dataErrorMessage(categories.error)}</Notice>}
      {categories.isPending && <p className="secondary">Loading your categories…</p>}

      {categories.isSuccess && rows.length === 0 && (
        <EmptyState icon={ChartPie} title="No categories yet" action={<Button onClick={() => open()}>Add a category</Button>}>
          Categories group your spending so a budget can compare what you planned with what you spent.
        </EmptyState>
      )}

      {/* Groups sit side by side on a wide screen: each is a short list, and
          one long column left most of the frame empty. */}
      <div className="group-columns">
        {byGroup.map(([groupId, items]) => (
          <section key={groupId || 'ungrouped'}>
            <h2 className="form-group-title">{groupName.get(groupId) ?? 'Ungrouped'}</h2>
            <ul className="rows-list">
              {items.map((category) => (
                <li key={category.id}>
                  <Link to={categoryPath(category.id)} className="row-button">
                    <span className="row-label">
                      {category.name}
                      <small>
                        {category.kind === 'income' ? 'Income' : 'Expense'} ·{' '}
                        {useCount.get(category.id) ?? 0} used
                      </small>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      {archived.length > 0 && (
        <details className="archived">
          <summary>{archived.length} archived</summary>
          <ul className="rows-list">
            {archived.map((category) => (
              <li key={category.id}>
                <Link to={categoryPath(category.id)} className="row-button">
                  <span className="row-label">
                    {category.name}
                    <small>Archived · {useCount.get(category.id) ?? 0} used</small>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </details>
      )}

      {sheetOpen && (
        <CategorySheet
          category={editing}
          siblings={rows}
          useCount={useCount}
          onClose={() => setSheetOpen(false)}
        />
      )}
    </div>
  );
}

export function CategorySheet({
  category,
  siblings,
  useCount,
  onClose,
}: {
  category?: Category;
  siblings: Category[];
  useCount: Map<string, number>;
  onClose: () => void;
}) {
  const groups = useCategoryGroups();
  const create = useCreateCategory();
  const update = useUpdateCategory();
  const remove = useDeleteCategory();
  const merge = useMergeCategories();
  const addGroup = useCreateCategoryGroup();

  const [name, setName] = useState(category?.name ?? '');
  const [kind, setKind] = useState<CategoryKind>(category?.kind ?? 'expense');
  const [groupId, setGroupId] = useState(category?.group_id ?? '');
  const [newGroup, setNewGroup] = useState('');
  const [mergeInto, setMergeInto] = useState('');
  const [error, setError] = useState<string | null>(null);

  const trimmed = name.trim();
  const used = (useCount.get(category?.id ?? '') ?? 0) > 0;
  const reason = !trimmed ? 'Give the category a name.' : undefined;
  const mergeTargets = siblings.filter((c) => c.id !== category?.id && c.kind === kind && !c.archived_at);

  const run = async (action: () => Promise<unknown>) => {
    setError(null);
    try {
      await action();
      onClose();
    } catch (cause) {
      const code = (cause as { code?: string } | null)?.code;
      setError(
        code === '23503'
          ? 'This category is used by transactions or a budget. Archive it, or merge it into another category.'
          : dataErrorMessage(cause),
      );
    }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (reason) return;
    let group = groupId;
    if (newGroup.trim()) {
      const created = await addGroup.mutateAsync(newGroup.trim()).catch(() => null);
      if (created) group = created.id;
    }
    const changes = { name: trimmed, kind, group_id: group === '' ? null : group };
    await run(() => (category ? update.mutateAsync({ id: category.id, changes }) : create.mutateAsync(changes)));
  };

  return (
    <Sheet open onClose={onClose} title={category ? 'Edit category' : 'Add category'}>
      <form onSubmit={submit} className="stack" noValidate>
        <FormGroup>
          <FormRow label="Name" htmlFor="category-name">
            <input id="category-name" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
          </FormRow>
          <FormRow label="Kind">
            <div className="segmented" role="radiogroup" aria-label="Kind">
              {(['expense', 'income'] as CategoryKind[]).map((option) => (
                <label key={option}>
                  <input
                    type="radio"
                    name="category-kind"
                    value={option}
                    checked={kind === option}
                    disabled={used}
                    onChange={() => setKind(option)}
                  />
                  {option === 'expense' ? 'Expense' : 'Income'}
                </label>
              ))}
            </div>
          </FormRow>
          <FormRow label="Group" htmlFor="category-group">
            <Select
              id="category-group"
              label="Group"
              placeholder="Ungrouped"
              value={groupId}
              onChange={setGroupId}
              options={[
                { value: '', label: 'Ungrouped' },
                ...(groups.data ?? []).map((group) => ({ value: group.id, label: group.name })),
              ]}
            />
          </FormRow>
          <FormRow label="New group" htmlFor="category-new-group">
            <input
              id="category-new-group"
              value={newGroup}
              maxLength={60}
              placeholder="Optional"
              onChange={(e) => setNewGroup(e.target.value)}
            />
          </FormRow>
        </FormGroup>
        {used && <p className="form-hint">Kind is fixed once a category has been used, so past rows keep their meaning.</p>}

        {error && <Notice tone="err">{error}</Notice>}
        <FieldErrors messages={[reason]} />

        <div className="actions">
          <Button type="submit" dimmed={Boolean(reason)} busy={create.isPending || update.isPending}>
            {category ? 'Save category' : 'Add category'}
          </Button>
        </div>
      </form>

      {category && (
        <div className="sheet-danger">
          <Button
            variant="secondary"
            onClick={() =>
              run(() =>
                update.mutateAsync({
                  id: category.id,
                  changes: { archived_at: category.archived_at ? null : new Date().toISOString() },
                }),
              )
            }
          >
            {category.archived_at ? 'Restore category' : 'Archive category'}
          </Button>

          {mergeTargets.length > 0 && (
            <div className="merge">
              <label className="footnote" htmlFor="merge-into">
                Merge “{category.name}” into another category. Its transactions and budgets move across, and this one is
                deleted.
              </label>
              <div className="actions">
                <Select
                  id="merge-into"
                  label="Category to merge into"
                  placeholder="Choose a category"
                  value={mergeInto}
                  onChange={setMergeInto}
                  options={mergeTargets.map((target) => ({ value: target.id, label: target.name }))}
                />
                <Button
                  variant="secondary"
                  dimmed={!mergeInto}
                  busy={merge.isPending}
                  onClick={() => mergeInto && run(() => merge.mutateAsync({ source: category.id, target: mergeInto }))}
                >
                  Merge
                </Button>
              </div>
            </div>
          )}

          {!used && (
            <Button variant="plain" busy={remove.isPending} onClick={() => run(() => remove.mutateAsync(category.id))}>
              Delete category
            </Button>
          )}
        </div>
      )}
    </Sheet>
  );
}
