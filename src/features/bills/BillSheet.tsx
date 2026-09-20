import { useMemo, useState } from 'react';
import { useCurrency } from '../../lib/profile';
import { parseMoney, toAmountInput } from '../../lib/money';
import { todayInZone } from '../../lib/dates';
import { Button } from '../../ui/Button';
import { FieldErrors, FormGroup, FormRow } from '../../ui/Form';
import { Notice } from '../../ui/Notice';
import { Select } from '../../ui/Select';
import { Sheet } from '../../ui/Sheet';
import { dataErrorMessage } from '../auth/errors';
import { useAccounts } from '../accounts/queries';
import { sortForPicker, useCategories, useCategoryUsage } from '../categories/queries';
import { directionProblem } from '../transactions/queries';
import {
  CADENCES,
  LABELS,
  kindForLabel,
  useCreateBill,
  useDeleteBill,
  useUpdateBill,
  type CadenceUnit,
  type RecurringItem,
  type RecurringLabel,
} from './queries';

export function BillSheet({ bill, onClose }: { bill?: RecurringItem; onClose: () => void }) {
  const currency = useCurrency();
  const accounts = useAccounts();
  const categories = useCategories();
  const usage = useCategoryUsage();
  const create = useCreateBill();
  const update = useUpdateBill();
  const remove = useDeleteBill();

  const today = todayInZone();
  const [name, setName] = useState(bill?.name ?? '');
  const [label, setLabel] = useState<RecurringLabel>(bill?.label ?? 'bill');
  const [amount, setAmount] = useState(bill ? toAmountInput(bill.amount_minor, currency) : '');
  const [variable, setVariable] = useState(bill?.amount_is_variable ?? false);
  const [fromAccount, setFromAccount] = useState(bill?.from_account_id ?? '');
  const [toAccount, setToAccount] = useState(bill?.to_account_id ?? '');
  const [categoryId, setCategoryId] = useState(bill?.category_id ?? '');
  const [unit, setUnit] = useState<CadenceUnit>(bill?.cadence_unit ?? 'month');
  const [interval, setInterval] = useState(String(bill?.cadence_interval ?? 1));
  const [nextDue, setNextDue] = useState(bill?.next_due_on ?? today);
  const [endsOn, setEndsOn] = useState(bill?.ends_on ?? '');
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const kind = kindForLabel(label, bill?.kind ?? 'expense');
  const isTransfer = kind === 'transfer';
  const open = (accounts.data ?? []).filter((a) => !a.archived_at);
  const pickable = useMemo(
    () =>
      sortForPicker(
        (categories.data ?? []).filter((c) => !c.archived_at || c.id === categoryId),
        usage.data,
      ).filter((c) => (kind === 'income' ? c.kind === 'income' : c.kind === 'expense')),
    [categories.data, usage.data, categoryId, kind],
  );

  const trimmed = name.trim();
  const parsed = parseMoney(amount, currency);
  const intervalNumber = Number(interval);
  const direction = directionProblem({
    kind,
    from_account_id: kind === 'income' ? null : fromAccount || null,
    to_account_id: kind === 'expense' ? null : toAccount || null,
  });

  const reason = !trimmed
    ? 'Give it a name.'
    : !parsed.ok
      ? parsed.message
      : !Number.isInteger(intervalNumber) || intervalNumber < 1 || intervalNumber > 12
        ? 'Repeat every 1 to 12.'
        : direction;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (reason || !parsed.ok) return;
    const changes = {
      name: trimmed,
      label,
      kind,
      amount_minor: parsed.minor,
      amount_is_variable: variable,
      from_account_id: kind === 'income' ? null : fromAccount || null,
      to_account_id: kind === 'expense' ? null : toAccount || null,
      category_id: isTransfer ? null : categoryId || null,
      cadence_unit: unit,
      cadence_interval: intervalNumber,
      // The anchor is what every future date is measured from, so a monthly
      // bill on the 31st keeps landing on month ends rather than drifting.
      anchor_on: bill?.anchor_on ?? nextDue,
      next_due_on: nextDue,
      ends_on: endsOn === '' ? null : endsOn,
    };
    try {
      if (bill) await update.mutateAsync({ id: bill.id, changes });
      else await create.mutateAsync(changes);
      onClose();
    } catch (cause) {
      setError(dataErrorMessage(cause));
    }
  };

  const archived = Boolean(bill?.archived_at);

  return (
    <Sheet open onClose={onClose} title={bill ? 'Edit bill' : 'Add bill'}>
      <form onSubmit={submit} className="stack" noValidate>
        <FormGroup>
          <FormRow label="Name" htmlFor="bill-name">
            <input id="bill-name" value={name} maxLength={60} placeholder="Rent" onChange={(e) => setName(e.target.value)} />
          </FormRow>
          <FormRow label="Kind" htmlFor="bill-label">
            <Select
              id="bill-label"
              label="Kind"
              value={label}
              onChange={(next) => setLabel(next as RecurringLabel)}
              options={LABELS.map((l) => ({ value: l.value, label: l.label, hint: l.hint }))}
            />
          </FormRow>
          <FormRow label="Amount" htmlFor="bill-amount">
            <input
              id="bill-amount"
              inputMode="decimal"
              value={amount}
              placeholder={variable ? 'Usual amount' : 'Required'}
              onChange={(e) => setAmount(e.target.value)}
            />
          </FormRow>
          <FormRow label="Amount varies" htmlFor="bill-variable">
            <input
              id="bill-variable"
              type="checkbox"
              role="switch"
              className="toggle"
              checked={variable}
              onChange={(e) => setVariable(e.target.checked)}
            />
          </FormRow>

          {kind !== 'income' && (
            <FormRow label={isTransfer ? 'From' : 'Paid from'} htmlFor="bill-from">
              <Select
                id="bill-from"
                label={isTransfer ? 'From' : 'Paid from'}
                placeholder="Choose an account"
                value={fromAccount}
                onChange={setFromAccount}
                options={open.map((a) => ({ value: a.account_id, label: a.name }))}
                emptyText="Add an account first, in Accounts."
              />
            </FormRow>
          )}
          {kind !== 'expense' && (
            <FormRow label={isTransfer ? 'To' : 'Paid into'} htmlFor="bill-to">
              <Select
                id="bill-to"
                label={isTransfer ? 'To' : 'Paid into'}
                placeholder="Choose an account"
                value={toAccount}
                onChange={setToAccount}
                options={open.map((a) => ({ value: a.account_id, label: a.name }))}
                emptyText="Add an account first, in Accounts."
              />
            </FormRow>
          )}
          {!isTransfer && (
            <FormRow label="Category" htmlFor="bill-category">
              <Select
                id="bill-category"
                label="Category"
                placeholder="No category"
                value={categoryId}
                onChange={setCategoryId}
                options={[{ value: '', label: 'No category' }, ...pickable.map((c) => ({ value: c.id, label: c.name }))]}
                emptyText="No categories yet. Add them in Budgets."
              />
            </FormRow>
          )}

          <FormRow label="Repeats" htmlFor="bill-unit">
            <Select
              id="bill-unit"
              label="Repeats"
              value={unit}
              onChange={(next) => setUnit(next as CadenceUnit)}
              options={CADENCES.map((c) => ({ value: c.value, label: c.label }))}
            />
          </FormRow>
          <FormRow label="Every" htmlFor="bill-interval">
            <input
              id="bill-interval"
              inputMode="numeric"
              value={interval}
              onChange={(e) => setInterval(e.target.value)}
            />
          </FormRow>
          <FormRow label="Next due" htmlFor="bill-next">
            <input id="bill-next" type="date" value={nextDue} onChange={(e) => setNextDue(e.target.value)} />
          </FormRow>
          <FormRow label="Ends" htmlFor="bill-ends">
            <input id="bill-ends" type="date" value={endsOn} placeholder="Never" onChange={(e) => setEndsOn(e.target.value)} />
          </FormRow>
        </FormGroup>
        <p className="form-hint">
          Dates are measured from the first due date, so a monthly bill on the 31st lands on the 28th in February and
          back on the 31st in March, rather than drifting earlier each month.
        </p>

        {error && <Notice tone="err">{error}</Notice>}
        <FieldErrors messages={[reason]} />

        <div className="actions">
          <Button type="submit" dimmed={Boolean(reason)} busy={create.isPending || update.isPending}>
            {bill ? 'Save bill' : 'Add bill'}
          </Button>
        </div>
      </form>

      {bill && (
        <div className="sheet-danger">
          <Button
            variant="secondary"
            onClick={async () => {
              try {
                await update.mutateAsync({
                  id: bill.id,
                  changes: { archived_at: archived ? null : new Date().toISOString() },
                });
                onClose();
              } catch (cause) {
                setError(dataErrorMessage(cause));
              }
            }}
          >
            {archived ? 'Restore bill' : 'Archive bill'}
          </Button>
          <p className="footnote flush">
            Deleting a bill keeps every payment you already recorded; they simply stop pointing at it.
          </p>
          {confirmingDelete ? (
            <div className="actions">
              <Button
                variant="secondary"
                busy={remove.isPending}
                onClick={async () => {
                  try {
                    await remove.mutateAsync(bill.id);
                    onClose();
                  } catch (cause) {
                    setError(dataErrorMessage(cause));
                    setConfirmingDelete(false);
                  }
                }}
              >
                Delete “{bill.name}”
              </Button>
              <Button variant="plain" onClick={() => setConfirmingDelete(false)}>
                Keep it
              </Button>
            </div>
          ) : (
            <Button variant="plain" onClick={() => setConfirmingDelete(true)}>
              Delete bill
            </Button>
          )}
        </div>
      )}
    </Sheet>
  );
}
