import { useState } from 'react';
import { useCurrency } from '../../lib/profile';
import { parseMoney, toAmountInput } from '../../lib/money';
import { Button } from '../../ui/Button';
import { FieldErrors, FormGroup, FormRow } from '../../ui/Form';
import { Notice } from '../../ui/Notice';
import { Select } from '../../ui/Select';
import { Sheet } from '../../ui/Sheet';
import { dataErrorMessage } from '../auth/errors';
import { LIABILITY_TYPES, useAccounts } from '../accounts/queries';
import { useCreateGoal, useDeleteGoal, useGoals, useUpdateGoal, type GoalProgress } from './queries';

export function GoalSheet({ goal, onClose }: { goal?: GoalProgress; onClose: () => void }) {
  const currency = useCurrency();
  const accounts = useAccounts();
  const goals = useGoals();
  const create = useCreateGoal();
  const update = useUpdateGoal();
  const remove = useDeleteGoal();

  const [name, setName] = useState(goal?.name ?? '');
  const [accountId, setAccountId] = useState(goal?.account_id ?? '');
  const [target, setTarget] = useState(goal?.target_minor ? toAmountInput(goal.target_minor, currency) : '');
  const [targetDate, setTargetDate] = useState(goal?.target_date ?? '');
  const [monthly, setMonthly] = useState(goal?.monthly_plan_minor ? toAmountInput(goal.monthly_plan_minor, currency) : '');
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // One goal per account, so an account already spoken for is not offered.
  const taken = new Set((goals.data ?? []).map((g) => g.account_id));
  const available = (accounts.data ?? []).filter(
    (account) =>
      !account.archived_at &&
      !LIABILITY_TYPES.includes(account.type) &&
      (!taken.has(account.account_id) || account.account_id === goal?.account_id),
  );

  const trimmed = name.trim();
  const parsedTarget = target.trim() === '' ? null : parseMoney(target, currency);
  const parsedMonthly = monthly.trim() === '' ? null : parseMoney(monthly, currency);

  const reason = !trimmed
    ? 'Give the goal a name.'
    : !accountId
      ? 'Choose the account that holds this money.'
      : parsedTarget && !parsedTarget.ok
        ? parsedTarget.message
        : parsedMonthly && !parsedMonthly.ok
          ? parsedMonthly.message
          : undefined;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (reason) return;
    const changes = {
      name: trimmed,
      account_id: accountId,
      target_minor: parsedTarget && parsedTarget.ok ? parsedTarget.minor : null,
      target_date: targetDate === '' ? null : targetDate,
      monthly_plan_minor: parsedMonthly && parsedMonthly.ok ? parsedMonthly.minor : null,
    };
    try {
      if (goal) await update.mutateAsync({ id: goal.goal_id, changes });
      else await create.mutateAsync(changes);
      onClose();
    } catch (cause) {
      const code = (cause as { code?: string } | null)?.code;
      setError(
        code === '23505'
          ? 'That account already backs another goal. Each goal keeps its money in its own account.'
          : dataErrorMessage(cause),
      );
    }
  };

  return (
    <Sheet open onClose={onClose} title={goal ? 'Edit goal' : 'Add goal'}>
      <form onSubmit={submit} className="stack" noValidate>
        <FormGroup>
          <FormRow label="Name" htmlFor="goal-name">
            <input
              id="goal-name"
              value={name}
              maxLength={60}
              placeholder="Emergency fund"
              onChange={(e) => setName(e.target.value)}
            />
          </FormRow>
          <FormRow label="Account" htmlFor="goal-account">
            <Select
              id="goal-account"
              label="Account"
              placeholder="Choose an account"
              value={accountId}
              onChange={setAccountId}
              options={available.map((a) => ({ value: a.account_id, label: a.name }))}
              emptyText="Add a savings account first, in Accounts."
            />
          </FormRow>
          <FormRow label="Target" htmlFor="goal-target">
            <input
              id="goal-target"
              inputMode="decimal"
              value={target}
              placeholder="Optional"
              onChange={(e) => setTarget(e.target.value)}
            />
          </FormRow>
          <FormRow label="By" htmlFor="goal-date">
            <input id="goal-date" type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
          </FormRow>
          <FormRow label="Monthly plan" htmlFor="goal-monthly">
            <input
              id="goal-monthly"
              inputMode="decimal"
              value={monthly}
              placeholder="Optional"
              onChange={(e) => setMonthly(e.target.value)}
            />
          </FormRow>
        </FormGroup>
        <p className="form-hint">
          The account holds the money; the goal is what you mean by it. Every transfer into that account counts as
          setting money aside, so nothing has to be recorded twice.
        </p>

        {error && <Notice tone="err">{error}</Notice>}
        <FieldErrors messages={[reason]} />

        <div className="actions">
          <Button type="submit" dimmed={Boolean(reason)} busy={create.isPending || update.isPending}>
            {goal ? 'Save goal' : 'Add goal'}
          </Button>
        </div>
      </form>

      {goal && (
        <div className="sheet-danger">
          <p className="footnote flush">
            Removing a goal keeps the account and every transfer in it. Only the intention goes away.
          </p>
          {confirmingDelete ? (
            <div className="actions">
              <Button
                variant="secondary"
                busy={remove.isPending}
                onClick={async () => {
                  try {
                    await remove.mutateAsync(goal.goal_id);
                    onClose();
                  } catch (cause) {
                    setError(dataErrorMessage(cause));
                    setConfirmingDelete(false);
                  }
                }}
              >
                Remove “{goal.name}”
              </Button>
              <Button variant="plain" onClick={() => setConfirmingDelete(false)}>
                Keep it
              </Button>
            </div>
          ) : (
            <Button variant="plain" onClick={() => setConfirmingDelete(true)}>
              Remove goal
            </Button>
          )}
        </div>
      )}
    </Sheet>
  );
}
