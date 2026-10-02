import { useState } from 'react';
import { useCurrency } from '../../lib/profile';
import { parseMoney, toAmountInput, type Currency } from '../../lib/money';
import { Button } from '../../ui/Button';
import { FieldErrors, FormGroup, FormRow } from '../../ui/Form';
import { Notice } from '../../ui/Notice';
import { Select } from '../../ui/Select';
import { Sheet } from '../../ui/Sheet';
import { dataErrorMessage } from '../auth/errors';
import {
  ACCOUNT_TYPES,
  LIABILITY_TYPES,
  useArchiveAccount,
  useCreateAccount,
  useDeleteAccount,
  useUpdateAccount,
  type Account,
  type AccountType,
} from './queries';

type Values = { name: string; type: AccountType; amount: string; opening_date: string };

function initialValues(account: Account | undefined, currency: Currency): Values {
  return {
    name: account?.name ?? '',
    type: account?.type ?? 'checking',
    amount: account ? toAmountInput(account.opening_balance_minor, currency) : '',
    opening_date: account?.opening_date ?? '',
  };
}

// One sheet for both adding and editing. The opening balance is what the
// account held when you started tracking it; every later change is a
// transaction, never an edit to this number.
// Rendered only while open, so each visit starts from the account it was
// given rather than syncing state in an effect.
export function AccountSheet({
  onClose,
  account,
}: {
  onClose: () => void;
  account?: Account;
}) {
  const currency = useCurrency();
  const create = useCreateAccount();
  const update = useUpdateAccount();
  const [values, setValues] = useState<Values>(() => initialValues(account, currency));
  const [error, setError] = useState<string | null>(null);


  const set = <K extends keyof Values>(key: K, value: Values[K]) => setValues((v) => ({ ...v, [key]: value }));

  const name = values.name.trim();
  const isLiability = LIABILITY_TYPES.includes(values.type);
  const parsed = values.amount.trim() === '' ? ({ ok: true, minor: 0 } as const) : parseMoney(values.amount, currency);
  const reason = !name
    ? 'Give the account a name.'
    : !parsed.ok
      ? parsed.message
      : undefined;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (reason || !parsed.ok) return;
    // Liabilities are held as negative balances, so net worth is a sum.
    const opening = isLiability ? -Math.abs(parsed.minor) : parsed.minor;
    const changes = {
      name,
      type: values.type,
      opening_balance_minor: opening,
      opening_date: values.opening_date === '' ? null : values.opening_date,
    };
    try {
      if (account) await update.mutateAsync({ id: account.id, changes });
      else await create.mutateAsync(changes);
      onClose();
    } catch (cause) {
      setError(dataErrorMessage(cause));
    }
  };

  const busy = create.isPending || update.isPending;
  const typeHint = ACCOUNT_TYPES.find((t) => t.value === values.type)?.hint;

  return (
    <Sheet open onClose={onClose} title={account ? 'Edit account' : 'Add account'}>
      <form onSubmit={submit} className="stack" noValidate>
        <FormGroup>
          <FormRow label="Name" htmlFor="account-name" invalid={Boolean(values.name) && !name}>
            <input
              id="account-name"
              value={values.name}
              maxLength={60}
              placeholder="Everyday checking"
              onChange={(e) => set('name', e.target.value)}
            />
          </FormRow>
          <FormRow label="Type" htmlFor="account-type">
            <Select
              id="account-type"
              label="Account type"
              value={values.type}
              onChange={(next) => set('type', next as AccountType)}
              options={ACCOUNT_TYPES.map((t) => ({ value: t.value, label: t.label, hint: t.hint }))}
            />
          </FormRow>
          <FormRow label={isLiability ? 'Amount owed' : 'Balance today'} htmlFor="account-amount" invalid={!parsed.ok}>
            <input
              id="account-amount"
              inputMode="decimal"
              value={values.amount}
              placeholder={currency === 'COP' ? '0' : '0.00'}
              onChange={(e) => set('amount', e.target.value)}
            />
          </FormRow>
          <FormRow label="Tracking since" htmlFor="account-date">
            <input
              id="account-date"
              type="date"
              value={values.opening_date}
              max={new Date().toISOString().slice(0, 10)}
              onChange={(e) => set('opening_date', e.target.value)}
            />
          </FormRow>
        </FormGroup>
        <p className="form-hint">
          {typeHint}. {isLiability ? 'Enter what you owe as a positive number; Lodestar keeps it as a negative balance.' : 'This is the balance the account holds today, before any transactions you add.'}
        </p>

        {error && <Notice tone="err">{error}</Notice>}
        <FieldErrors messages={[reason]} />

        <div className="actions">
          <Button type="submit" dimmed={Boolean(reason)} busy={busy}>
            {busy ? 'Saving…' : account ? 'Save account' : 'Add account'}
          </Button>
        </div>
      </form>

      {account && <AccountRetirement account={account} onDone={onClose} onError={(m) => setError(m || null)} />}
    </Sheet>
  );
}

// Archiving is the normal end of an account's life: the history stays and the
// account leaves the pickers. Deleting is offered only as a way to undo a
// mistake, and the database refuses it once anything references the account.
function AccountRetirement({
  account,
  onDone,
  onError,
}: {
  account: Account;
  onDone: () => void;
  onError: (message: string) => void;
}) {
  const archive = useArchiveAccount();
  const remove = useDeleteAccount();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const archived = Boolean(account.archived_at);

  const run = async (action: () => Promise<unknown>) => {
    onError('');
    try {
      await action();
      onDone();
    } catch (cause) {
      const code = (cause as { code?: string } | null)?.code;
      onError(
        code === '23503'
          ? 'This account has transactions, so it can’t be deleted. Archive it instead: the history stays and it leaves the pickers.'
          : dataErrorMessage(cause),
      );
      setConfirmingDelete(false);
    }
  };

  return (
    <div className="sheet-danger">
      <Button
        variant="secondary"
        busy={archive.isPending}
        onClick={() => run(() => archive.mutateAsync({ id: account.id, archived: !archived }))}
      >
        {archived ? 'Restore account' : 'Archive account'}
      </Button>
      {confirmingDelete ? (
        <div className="actions">
          <Button variant="secondary" busy={remove.isPending} onClick={() => run(() => remove.mutateAsync(account.id))}>
            Delete “{account.name}” permanently
          </Button>
          <Button variant="plain" onClick={() => setConfirmingDelete(false)}>
            Keep it
          </Button>
        </div>
      ) : (
        <Button variant="plain" onClick={() => setConfirmingDelete(true)}>
          Delete account
        </Button>
      )}
    </div>
  );
}
