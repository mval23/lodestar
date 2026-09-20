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

type Table = 'accounts' | 'categories' | 'transactions';

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

      const files = await Promise.all(
        (['accounts', 'categories', 'transactions'] as Table[]).map(async (table) => ({
          table,
          rows: await readAll(table),
        })),
      );

      for (const file of files) download(`lodestar-${file.table}.csv`, file.rows);

      // Audited by name and count only.
      const total = files.reduce((sum, file) => sum + Math.max(0, file.rows.length - 1), 0);
      await db().rpc('log_event', { p_event: 'export', p_subject_id: null, p_row_count: total });

      setPassword('');
      setDone(`${total} rows exported as ${files.length} CSV files.`);
    } catch (cause) {
      setError(dataErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  const readAll = async (table: Table): Promise<string[][]> => {
    const { data, error } = await db().from(table).select('*');
    if (error) throw error;
    const rows = data as Record<string, unknown>[];
    if (rows.length === 0) return [[`No ${table}`]];
    const headers = Object.keys(rows[0]!);
    return [
      headers,
      ...rows.map((row) =>
        headers.map((header) => {
          const value = row[header];
          // Amounts are written twice: the exact minor units a re-import
          // needs, and a readable form for a spreadsheet.
          if (typeof value === 'number' && header.endsWith('_minor')) {
            return `${value}`;
          }
          return value === null || value === undefined ? '' : String(value);
        }),
      ),
    ];
  };

  return (
    <section className="stack">
      <h2 className="title-2">Export</h2>
      <p className="secondary flush">
        Your accounts, categories and transactions as CSV files. Amounts are written in {currency} minor units (
        {formatMoney(123450, currency)} is written as 123450), which is what an import reads back exactly.
      </p>

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
