import { useMemo, useState } from 'react';
import { useCurrency } from '../../lib/profile';
import { formatMoney, parseMoney, toAmountInput, type Currency } from '../../lib/money';
import { todayInZone } from '../../lib/dates';
import { Button } from '../../ui/Button';
import { FieldErrors, FormGroup, FormRow } from '../../ui/Form';
import { Notice } from '../../ui/Notice';
import { Select } from '../../ui/Select';
import { Sheet } from '../../ui/Sheet';
import { dataErrorMessage } from '../auth/errors';
import { useAccounts } from '../accounts/queries';
import { sortForPicker, useCategories, useCategoryUsage } from '../categories/queries';
import {
  directionProblem,
  useCreateTransaction,
  useDeleteTransaction,
  useUpdateTransaction,
  type Transaction,
  type TxnKind,
} from './queries';

const KINDS: { value: TxnKind; label: string }[] = [
  { value: 'expense', label: 'Expense' },
  { value: 'income', label: 'Income' },
  { value: 'transfer', label: 'Transfer' },
];

type Values = {
  kind: TxnKind;
  amount: string;
  occurred_on: string;
  from_account_id: string;
  to_account_id: string;
  category_id: string;
  description: string;
  notes: string;
  pending: boolean;
};

function initialValues(transaction: Transaction | undefined, currency: Currency, today: string): Values {
  return {
    kind: transaction?.kind ?? 'expense',
    amount: transaction ? toAmountInput(transaction.amount_minor, currency) : '',
    occurred_on: transaction?.occurred_on ?? today,
    from_account_id: transaction?.from_account_id ?? '',
    to_account_id: transaction?.to_account_id ?? '',
    category_id: transaction?.category_id ?? '',
    description: transaction?.description ?? '',
    notes: transaction?.notes ?? '',
    pending: transaction?.status === 'pending',
  };
}

// Add or edit one money event. The amount is the hero; everything else is one
// grouped list. Direction comes from the kind, never from a sign.
export function TransactionSheet({
  onClose,
  transaction,
  defaultAccountId,
  defaultKind,
  defaultToAccountId,
  defaultDescription,
}: {
  onClose: () => void;
  transaction?: Transaction;
  defaultAccountId?: string;
  // Set when the sheet is opened for a particular purpose, such as adding
  // money to a goal, which is a transfer into that goal's account.
  defaultKind?: TxnKind;
  defaultToAccountId?: string;
  defaultDescription?: string;
}) {
  const currency = useCurrency();
  const today = todayInZone();
  const accounts = useAccounts();
  const categories = useCategories();
  const usage = useCategoryUsage();
  const create = useCreateTransaction();
  const update = useUpdateTransaction();

  const [values, setValues] = useState<Values>(() => {
    const base = initialValues(transaction, currency, today);
    if (transaction) return base;
    if (defaultKind) base.kind = defaultKind;
    if (defaultAccountId) base.from_account_id = defaultAccountId;
    if (defaultToAccountId) base.to_account_id = defaultToAccountId;
    if (defaultDescription) base.description = defaultDescription;
    return base;
  });
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof Values>(key: K, value: Values[K]) => setValues((v) => ({ ...v, [key]: value }));

  const open = (accounts.data ?? []).filter((a) => !a.archived_at || a.account_id === values.from_account_id || a.account_id === values.to_account_id);
  const pickable = useMemo(
    () =>
      sortForPicker(
        (categories.data ?? []).filter((c) => !c.archived_at || c.id === values.category_id),
        usage.data,
      ).filter((c) => (values.kind === 'income' ? c.kind === 'income' : c.kind === 'expense')),
    [categories.data, usage.data, values.category_id, values.kind],
  );

  const isTransfer = values.kind === 'transfer';
  const parsed = parseMoney(values.amount, currency);
  const description = values.description.trim();
  const direction = directionProblem({
    kind: values.kind,
    from_account_id: values.kind === 'income' ? null : values.from_account_id || null,
    to_account_id: values.kind === 'expense' ? null : values.to_account_id || null,
  });
  const futureWarning = values.occurred_on > today;

  // The database needs a description, but you shouldn't have to type one.
  // Left blank, the category names it, then the kind. The placeholder shows
  // exactly what will be saved, so nothing is filled in behind your back.
  const categoryName = pickable.find((c) => c.id === values.category_id)?.name;
  const fallbackDescription = categoryName ?? KINDS.find((k) => k.value === values.kind)!.label;
  const finalDescription = description || fallbackDescription;

  const reason = !parsed.ok ? parsed.message : direction;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (reason || !parsed.ok) return;
    const row = {
      kind: values.kind,
      amount_minor: parsed.minor,
      occurred_on: values.occurred_on,
      from_account_id: values.kind === 'income' ? null : values.from_account_id || null,
      to_account_id: values.kind === 'expense' ? null : values.to_account_id || null,
      // A transfer never carries a category: money moving between your own
      // accounts is not spending.
      category_id: isTransfer ? null : values.category_id || null,
      description: finalDescription,
      notes: values.notes.trim() === '' ? null : values.notes.trim(),
      status: values.pending ? ('pending' as const) : ('cleared' as const),
    };
    try {
      if (transaction) await update.mutateAsync({ id: transaction.id, changes: row });
      else await create.mutateAsync(row);
      onClose();
    } catch (cause) {
      setError(dataErrorMessage(cause));
    }
  };

  const busy = create.isPending || update.isPending;

  return (
    <Sheet onClose={onClose} open title={transaction ? 'Edit transaction' : 'Add transaction'}>
      <form onSubmit={submit} className="stack" noValidate>
        <div className="segmented segmented-wide" role="radiogroup" aria-label="Kind">
          {KINDS.map((kind) => (
            <label key={kind.value}>
              <input
                type="radio"
                name="kind"
                value={kind.value}
                checked={values.kind === kind.value}
                onChange={() => set('kind', kind.value)}
              />
              {kind.label}
            </label>
          ))}
        </div>

        <div className="amount-hero">
          <label htmlFor="txn-amount" className="caption">
            Amount
          </label>
          <input
            id="txn-amount"
            className="amount-input num"
            inputMode="decimal"
            autoFocus
            placeholder={formatMoney(0, currency)}
            value={values.amount}
            onChange={(e) => set('amount', e.target.value)}
          />
        </div>

        {/* Order follows how people think: what it was, what kind of spending
            it is, which account it touched, when, and anything extra. */}
        <FormGroup>
          <FormRow label="Description" htmlFor="txn-description">
            <input
              id="txn-description"
              value={values.description}
              maxLength={140}
              placeholder={fallbackDescription}
              onChange={(e) => set('description', e.target.value)}
            />
          </FormRow>

          {!isTransfer && (
            <FormRow label="Category" htmlFor="txn-category">
              <Select
                id="txn-category"
                label="Category"
                placeholder="No category"
                emptyText="No categories yet. Add them in Settings."
                value={values.category_id}
                onChange={(next) => set('category_id', next)}
                options={[{ value: '', label: 'No category' }, ...pickable.map((c) => ({ value: c.id, label: c.name }))]}
              />
            </FormRow>
          )}

          {values.kind !== 'income' && (
            <FormRow label={isTransfer ? 'From' : 'Account'} htmlFor="txn-from">
              <Select
                id="txn-from"
                label={isTransfer ? 'From' : 'Account'}
                placeholder="Choose an account"
                emptyText="Add an account first, in Accounts."
                value={values.from_account_id}
                onChange={(next) => set('from_account_id', next)}
                options={open.map((a) => ({ value: a.account_id, label: a.name }))}
              />
            </FormRow>
          )}

          {values.kind !== 'expense' && (
            <FormRow label={isTransfer ? 'To' : 'Account'} htmlFor="txn-to">
              <Select
                id="txn-to"
                label={isTransfer ? 'To' : 'Account'}
                placeholder="Choose an account"
                emptyText="Add an account first, in Accounts."
                value={values.to_account_id}
                onChange={(next) => set('to_account_id', next)}
                options={open.map((a) => ({ value: a.account_id, label: a.name }))}
              />
            </FormRow>
          )}

          <FormRow label="Date" htmlFor="txn-date">
            <input
              id="txn-date"
              type="date"
              value={values.occurred_on}
              onChange={(e) => set('occurred_on', e.target.value)}
            />
          </FormRow>

          <FormRow label="Notes" htmlFor="txn-notes">
            <input
              id="txn-notes"
              value={values.notes}
              maxLength={4000}
              placeholder="Optional"
              onChange={(e) => set('notes', e.target.value)}
            />
          </FormRow>

          <FormRow label="Pending" htmlFor="txn-pending">
            <input
              id="txn-pending"
              type="checkbox"
              role="switch"
              className="toggle"
              aria-describedby="txn-pending-hint"
              checked={values.pending}
              onChange={(e) => set('pending', e.target.checked)}
            />
          </FormRow>
        </FormGroup>

        <p id="txn-pending-hint" className="form-hint">
          Pending means your bank hasn’t settled it yet. It still counts in the balance; accounts also show a cleared
          balance that leaves pending amounts out.
        </p>
        {isTransfer && (
          <p className="form-hint">
            A transfer moves money between your own accounts, so it carries no category and never counts as spending.
          </p>
        )}
        {futureWarning && (
          <Notice tone="info">This date is in the future. It will be saved as a scheduled transaction.</Notice>
        )}

        {error && <Notice tone="err">{error}</Notice>}
        <FieldErrors messages={[reason]} />

        <div className="actions">
          <Button type="submit" dimmed={Boolean(reason)} busy={busy}>
            {busy ? 'Saving…' : transaction ? 'Save transaction' : 'Add transaction'}
          </Button>
        </div>
      </form>

      {transaction && <DeleteTransaction transaction={transaction} onDone={onClose} onError={setError} />}
    </Sheet>
  );
}

function DeleteTransaction({
  transaction,
  onDone,
  onError,
}: {
  transaction: Transaction;
  onDone: () => void;
  onError: (message: string) => void;
}) {
  const remove = useDeleteTransaction();
  const [confirming, setConfirming] = useState(false);

  const run = async () => {
    try {
      await remove.mutateAsync(transaction.id);
      onDone();
    } catch (cause) {
      onError(dataErrorMessage(cause));
      setConfirming(false);
    }
  };

  return (
    <div className="sheet-danger">
      {confirming ? (
        <div className="actions">
          <Button variant="secondary" busy={remove.isPending} onClick={run}>
            Delete this transaction
          </Button>
          <Button variant="plain" onClick={() => setConfirming(false)}>
            Keep it
          </Button>
        </div>
      ) : (
        <Button variant="plain" onClick={() => setConfirming(true)}>
          Delete transaction
        </Button>
      )}
    </div>
  );
}
