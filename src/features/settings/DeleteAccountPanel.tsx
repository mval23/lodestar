import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { db } from '../../lib/supabase';
import { Button } from '../../ui/Button';
import { FormRow } from '../../ui/Form';
import { Notice } from '../../ui/Notice';
import { authErrorMessage, dataErrorMessage } from '../auth/errors';
import { confirmationPhrase, deletionErrorMessage, failureCode, matchesPhrase } from './deletion';

export const transactionCountKey = ['transactions', 'count'] as const;

// Counted, not guessed: the confirmation says how much is about to go.
function useTransactionCount() {
  return useQuery({
    queryKey: transactionCountKey,
    queryFn: async (): Promise<number> => {
      const { count, error } = await db().from('transactions').select('id', { count: 'exact', head: true });
      if (error) throw error;
      return count ?? 0;
    },
  });
}

// Deletion asks for two things: the password, so an unattended browser is not
// enough, and the phrase typed out, so it cannot happen by a stray click. The
// Edge Function insists on the first of those again on its own side.
export function DeleteAccountPanel({ email }: { email: string }) {
  const navigate = useNavigate();
  const count = useTransactionCount();
  const [password, setPassword] = useState('');
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const phrase = count.isSuccess ? confirmationPhrase(count.data) : '';
  const ready = password !== '' && matchesPhrase(typed, phrase);

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      const check = await db().auth.signInWithPassword({ email, password });
      if (check.error) {
        setError(
          check.error.code === 'invalid_credentials' ? 'That password isn’t right.' : authErrorMessage(check.error),
        );
        return;
      }

      const { error: failed } = await db().functions.invoke('delete-account', { method: 'POST' });
      if (failed) {
        setError(deletionErrorMessage(await failureCode(failed)));
        return;
      }

      // Leave the signed-in routes first. Clearing the session while still on
      // this page would send them to sign in for an account that is gone.
      navigate('/account-deleted', { replace: true });
      await db().auth.signOut({ scope: 'local' });
    } catch (cause) {
      setError(dataErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="stack">
      <h2 className="form-group-title">Delete your Lodestar account</h2>
      <div className="group stack-tight">
        <p className="flush">
          This removes your account and everything in it — accounts, transactions, categories, budgets, goals and bills
          — straight away, for good. There is no undo.
        </p>
        <p className="secondary flush">
          Export your data first if you want to keep a copy. Backups age out within the provider’s retention window,
          which is the one delay we can’t avoid.
        </p>
      </div>

      {count.isPending && <p className="secondary">Counting what’s in your account…</p>}
      {count.isError && <Notice tone="err">{dataErrorMessage(count.error)}</Notice>}

      {count.isSuccess && (
        <>
          <div className="form-group">
            <FormRow label="Password" htmlFor="delete-password">
              <input
                id="delete-password"
                type="password"
                autoComplete="current-password"
                value={password}
                placeholder="Required"
                onChange={(event) => setPassword(event.target.value)}
              />
            </FormRow>
            <FormRow label="Confirmation" htmlFor="delete-confirm">
              <input
                id="delete-confirm"
                type="text"
                autoComplete="off"
                spellCheck={false}
                value={typed}
                aria-describedby="delete-confirm-hint"
                placeholder={phrase}
                onChange={(event) => setTyped(event.target.value)}
              />
            </FormRow>
          </div>
          <p id="delete-confirm-hint" className="secondary flush">
            To confirm, type <strong>{phrase}</strong>
          </p>

          {error && <Notice tone="err">{error}</Notice>}

          <div className="actions">
            <Button
              variant="secondary"
              className="btn-destructive"
              dimmed={!ready}
              busy={busy}
              onClick={() => (ready ? run() : setError('Enter your password and type the confirmation exactly.'))}
            >
              <Trash2 strokeWidth={1.75} aria-hidden />
              {busy ? 'Deleting…' : 'Delete account'}
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
