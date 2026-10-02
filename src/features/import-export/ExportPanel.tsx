import { useState } from 'react';
import { Download } from 'lucide-react';
import { useSession } from '../../app/AuthProvider';
import { db } from '../../lib/supabase';
import { useCurrency } from '../../lib/profile';
import { formatMoney } from '../../lib/money';
import { Button } from '../../ui/Button';
import { FormGroup, FormRow } from '../../ui/Form';
import { Notice } from '../../ui/Notice';
import { authErrorMessage, dataErrorMessage } from '../auth/errors';
import { toCsv } from './csv';
import { EXPORT_LABELS, exportAll, type ReadPage } from './exportData';

// "budgets, goals and bills": the app's lists have no comma before "and".
function list(items: string[]): string {
  return items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

// One page of a table, in a stable order, for exportAll.
const readPage: ReadPage = async (table, from, to) => {
  const { data, error } = await db().from(table).select('*').order('id').range(from, to);
  if (error) throw error;
  return data as Record<string, unknown>[];
};

// Export re-authenticates first: a signed-in browser left unattended should
// not be able to walk away with the whole ledger. The database records the
// event through log_event, with no amounts or descriptions in it.
export function ExportPanel() {
  const session = useSession();
  const currency = useCurrency();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const email = session.user.email ?? '';

  const run = async () => {
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const check = await db().auth.signInWithPassword({ email, password });
      if (check.error) {
        setError(
          check.error.code === 'invalid_credentials'
            ? 'That password isn’t right.'
            : authErrorMessage(check.error),
        );
        return;
      }

      const result = await exportAll(readPage);
      for (const file of result.files) download(file.filename, file.rows);

      // Audited by name and count only.
      await db().rpc('log_event', { p_event: 'export', p_row_count: result.rowCount });

      setPassword('');
      const rows = `${result.rowCount.toLocaleString('en-US')} ${result.rowCount === 1 ? 'row' : 'rows'}`;
      const files = `${result.files.length} CSV ${result.files.length === 1 ? 'file' : 'files'}`;
      const empty =
        result.empty.length > 0
          ? ` Nothing to export yet for ${list(result.empty.map((table) => EXPORT_LABELS[table]))}.`
          : '';
      setDone(`${rows} exported as ${files}.${empty}`);
    } catch (cause) {
      setError(dataErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="stack">
      <h2 className="title-2">Export</h2>
      <p className="secondary flush">
        Everything you’ve entered, as one CSV file each: your profile, accounts, categories and their groups,
        transactions, budgets, goals, bills and subscriptions, and your import history. Amounts are written in{' '}
        {currency} minor units ({formatMoney(123450, currency)} is written as 123450), exactly as they’re stored.
      </p>
      <p className="form-hint flush">Your browser may ask once to allow several downloads.</p>

      <FormGroup title="Confirm it’s you">
        <FormRow label="Password" htmlFor="export-password">
          <input
            id="export-password"
            type="password"
            autoComplete="current-password"
            value={password}
            placeholder="Required"
            onChange={(e) => setPassword(e.target.value)}
          />
        </FormRow>
      </FormGroup>

      {error && <Notice tone="err">{error}</Notice>}
      {done && <Notice tone="ok">{done}</Notice>}

      <div className="actions">
        <Button variant="secondary" dimmed={!password} busy={busy} onClick={run}>
          <Download strokeWidth={1.75} aria-hidden />
          {busy ? 'Preparing…' : 'Export all data'}
        </Button>
      </div>
    </section>
  );
}

function download(filename: string, rows: string[][]) {
  const blob = new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
