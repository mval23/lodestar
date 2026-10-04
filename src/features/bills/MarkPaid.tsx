import { useState } from 'react';
import { useCurrency } from '../../lib/profile';
import { formatDate } from '../../lib/dates';
import { parseMoney, toAmountInput } from '../../lib/money';
import { Button } from '../../ui/Button';
import { DatePicker } from '../../ui/DatePicker';
import { Notice } from '../../ui/Notice';
import { dataErrorMessage } from '../auth/errors';
import { useMarkBillPaid, type RecurringItem } from './queries';

// Marking a bill paid writes the transaction and moves the due date in one
// database transaction. If the insert fails, the date does not move, so a
// bill can never look paid without the money to match.
export function MarkPaid({ bill, today }: { bill: RecurringItem; today: string }) {
  const currency = useCurrency();
  const markPaid = useMarkBillPaid();
  const [asking, setAsking] = useState(false);
  const [amount, setAmount] = useState(() => toAmountInput(bill.amount_minor, currency));
  const [paidOn, setPaidOn] = useState(today);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const parsed = parseMoney(amount, currency);
  // Income is received, not paid.
  const incoming = bill.kind === 'income';
  const action = incoming ? 'Mark as received' : 'Mark as paid';
  const dateLabel = incoming ? 'Received on' : 'Paid on';

  const run = async (override?: { amountMinor?: number; paidOn?: string }) => {
    setError(null);
    try {
      const result = await markPaid.mutateAsync({
        id: bill.id,
        paidOn: override?.paidOn ?? today,
        ...(override?.amountMinor !== undefined ? { amountMinor: override.amountMinor } : {}),
      });
      setAsking(false);
      setDone(`Recorded. Next ${incoming ? 'expected' : 'due'} ${formatDate(result.next_due_on)}.`);
    } catch (cause) {
      const code = (cause as { code?: string } | null)?.code;
      setError(
        code === '55000'
          ? 'This bill is archived, so it can’t be marked paid. Restore it first.'
          : dataErrorMessage(cause),
      );
    }
  };

  if (done) {
    return (
      <div className="bill-aside">
        <Notice tone="ok">{done}</Notice>
      </div>
    );
  }

  // A bill whose amount varies always asks; a fixed one only asks if you
  // want to change something.
  if (asking || bill.amount_is_variable) {
    return (
      <div className="bill-aside stack-tight">
        {/* Filled capsules with their names inside, on one line with the
            action: no outlined boxes, no labels floating above. */}
        <div className="bill-confirm">
          <label className="confirm-field">
            <span>Amount</span>
            <input
              inputMode="decimal"
              className="num"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          </label>
          <div className="confirm-field bill-paid-on">
            <span aria-hidden>{dateLabel}</span>
            <DatePicker label={dateLabel} value={paidOn} onChange={setPaidOn} />
          </div>
          <Button
            variant="secondary"
            dimmed={!parsed.ok}
            busy={markPaid.isPending}
            onClick={() => parsed.ok && run({ amountMinor: parsed.minor, paidOn })}
          >
            {action}
          </Button>
          {asking && (
            <Button variant="plain" onClick={() => setAsking(false)}>
              Cancel
            </Button>
          )}
        </div>
        {!parsed.ok && <p className="field-error">{parsed.message}</p>}
        {error && <Notice tone="err">{error}</Notice>}
      </div>
    );
  }

  return (
    <div className="bill-aside">
      <div className="actions">
        <Button variant="secondary" busy={markPaid.isPending} onClick={() => run()}>
          {action}
        </Button>
        <Button variant="plain" onClick={() => setAsking(true)}>
          Different amount or date
        </Button>
      </div>
      {error && <Notice tone="err">{error}</Notice>}
    </div>
  );
}
