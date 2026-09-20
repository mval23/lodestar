import { useState } from 'react';
import { useCurrency } from '../../lib/profile';
import { formatDate } from '../../lib/dates';
import { parseMoney, toAmountInput } from '../../lib/money';
import { Button } from '../../ui/Button';
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

  const run = async (override?: { amountMinor?: number; paidOn?: string }) => {
    setError(null);
    try {
      const result = await markPaid.mutateAsync({
        id: bill.id,
        paidOn: override?.paidOn ?? today,
        ...(override?.amountMinor !== undefined ? { amountMinor: override.amountMinor } : {}),
      });
      setAsking(false);
      setDone(`Recorded. Next due ${formatDate(result.next_due_on)}.`);
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
        <div className="bill-confirm">
          <label className="footnote">
            Amount
            <input
              inputMode="decimal"
              className="num"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          </label>
          <label className="footnote">
            Paid on
            <input type="date" value={paidOn} onChange={(event) => setPaidOn(event.target.value)} />
          </label>
          <Button
            variant="secondary"
            dimmed={!parsed.ok}
            busy={markPaid.isPending}
            onClick={() => parsed.ok && run({ amountMinor: parsed.minor, paidOn })}
          >
            Mark as paid
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
          Mark as paid
        </Button>
        <Button variant="plain" onClick={() => setAsking(true)}>
          Different amount or date
        </Button>
      </div>
      {error && <Notice tone="err">{error}</Notice>}
    </div>
  );
}
