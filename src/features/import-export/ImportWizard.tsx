import { useMemo, useState } from 'react';
import Papa from 'papaparse';
import { FileUp } from 'lucide-react';
import { useCurrency } from '../../lib/profile';
import { formatDate } from '../../lib/dates';
import { Amount } from '../../ui/Amount';
import { Button } from '../../ui/Button';
import { FormGroup, FormRow } from '../../ui/Form';
import { Notice } from '../../ui/Notice';
import { Select } from '../../ui/Select';
import { dataErrorMessage } from '../auth/errors';
import { useAccounts } from '../accounts/queries';
import { useCategories } from '../categories/queries';
import { EMPTY_MAP, guessMap, prepareRows, type ColumnMap, type DateOrder } from './csv';
import { useImportTransactions, useUndoImport, type ImportResult } from './queries';

type Parsed = { filename: string; headers: string[]; rows: Record<string, string>[] };

const FIELDS: { key: keyof ColumnMap; label: string; required: boolean; hint: string }[] = [
  { key: 'date', label: 'Date', required: true, hint: 'When it happened' },
  { key: 'description', label: 'Description', required: true, hint: 'What it was' },
  { key: 'amount', label: 'Amount', required: true, hint: 'Money out, or both directions if signed' },
  { key: 'amountIn', label: 'Money in', required: false, hint: 'Only if your file splits in and out' },
  { key: 'category', label: 'Category', required: false, hint: 'Matched to your categories by name' },
  { key: 'notes', label: 'Notes', required: false, hint: 'Anything extra to keep' },
];

// Nothing is saved until the review step: you see every row, and every row
// Lodestar could not read, before anything is written.
export function ImportWizard() {
  const currency = useCurrency();
  const accounts = useAccounts();
  const categories = useCategories();
  const runImport = useImportTransactions();
  const undo = useUndoImport();

  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [map, setMap] = useState<ColumnMap>(EMPTY_MAP);
  const [dateOrder, setDateOrder] = useState<DateOrder>('dmy');
  const [accountId, setAccountId] = useState('');
  const [allOutgoing, setAllOutgoing] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);
  const [result, setResult] = useState<(ImportResult & { filename: string }) | null>(null);
  const [error, setError] = useState<string | null>(null);

  const openAccounts = (accounts.data ?? []).filter((a) => !a.archived_at);
  const categoryIdByName = useMemo(
    () => new Map((categories.data ?? []).map((c) => [c.name.trim().toLowerCase(), c.id])),
    [categories.data],
  );

  const readFile = (file: File) => {
    setReadError(null);
    setResult(null);
    setError(null);
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: 'greedy',
      // No worker: Papa builds one from a blob: URL, which the app's CSP
      // refuses. A statement of a few thousand rows parses fast enough on
      // the main thread, and the file never leaves the browser either way.
      worker: false,
      complete: (output) => {
        const headers = (output.meta.fields ?? []).filter(Boolean);
        if (headers.length === 0) {
          setReadError('That file has no header row, so its columns can’t be named.');
          return;
        }
        setParsed({ filename: file.name, headers, rows: output.data });
        setMap(guessMap(headers));
      },
      error: () => setReadError('That file couldn’t be read. Export it again as CSV and retry.'),
    });
  };

  const prepared = useMemo(() => {
    if (!parsed || !accountId || !map.date || !map.description || !map.amount) return null;
    return prepareRows({
      rows: parsed.rows,
      map,
      dateOrder,
      currency,
      accountId,
      allOutgoing,
      categoryIdByName,
    });
  }, [parsed, map, dateOrder, currency, accountId, allOutgoing, categoryIdByName]);

  const reset = () => {
    setParsed(null);
    setMap(EMPTY_MAP);
    setAccountId('');
    setAllOutgoing(false);
    setResult(null);
    setError(null);
  };

  const submit = async () => {
    if (!parsed || !prepared || prepared.rows.length === 0) return;
    setError(null);
    try {
      const outcome = await runImport.mutateAsync({
        filename: parsed.filename,
        rows: prepared.rows.map((r) => r.row),
      });
      setResult({ ...outcome, filename: parsed.filename });
      setParsed(null);
    } catch (cause) {
      setError(dataErrorMessage(cause));
    }
  };

  if (result) {
    return (
      <section className="stack">
        <Notice tone="ok">
          <p>
            {result.inserted_count} {result.inserted_count === 1 ? 'transaction' : 'transactions'} imported from{' '}
            {result.filename}
            {result.duplicate_count > 0 &&
              `. ${result.duplicate_count} ${result.duplicate_count === 1 ? 'row was' : 'rows were'} already here, so ${result.duplicate_count === 1 ? 'it was' : 'they were'} skipped`}
            .
          </p>
        </Notice>
        <div className="actions">
          <Button
            variant="secondary"
            busy={undo.isPending}
            onClick={async () => {
              await undo.mutateAsync(result.batch_id).catch((cause) => setError(dataErrorMessage(cause)));
              setResult(null);
            }}
          >
            Undo this import
          </Button>
          <Button variant="plain" onClick={reset}>
            Import another file
          </Button>
        </div>
        {error && <Notice tone="err">{error}</Notice>}
      </section>
    );
  }

  if (!parsed) {
    return (
      <section className="stack">
        <div className="group dropzone">
          <FileUp strokeWidth={1.75} aria-hidden />
          <h3 className="headline">Import a CSV</h3>
          <p className="secondary flush">
            Export a statement from your bank, then choose it here. You’ll match its columns and review every row before
            anything is saved.
          </p>
          <label className="btn btn-primary">
            Choose a file
            <input
              type="file"
              accept=".csv,text/csv"
              className="visually-hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) readFile(file);
                event.target.value = '';
              }}
            />
          </label>
        </div>
        {readError && <Notice tone="err">{readError}</Notice>}
        {openAccounts.length === 0 && (
          <Notice tone="warn">Add an account first: every imported row has to land somewhere.</Notice>
        )}
      </section>
    );
  }

  const missing = FIELDS.filter((f) => f.required && !map[f.key]).map((f) => f.label);
  const blocked = !accountId || missing.length > 0;

  return (
    <section className="stack">
      <header className="page-head">
        <div>
          <h3 className="headline">{parsed.filename}</h3>
          <p className="footnote flush">{parsed.rows.length} rows read. Nothing is saved yet.</p>
        </div>
        <Button variant="plain" onClick={reset}>
          Choose another file
        </Button>
      </header>

      <div>
        <h4 className="form-group-title">Where these belong</h4>
        <FormGroup>
          <FormRow label="Account" htmlFor="import-account">
            <Select
              id="import-account"
              label="Account"
              placeholder="Choose an account"
              value={accountId}
              onChange={setAccountId}
              options={openAccounts.map((a) => ({ value: a.account_id, label: a.name }))}
              emptyText="Add an account first, in Accounts."
            />
          </FormRow>
          <FormRow label="Date order" htmlFor="import-date-order">
            <Select
              id="import-date-order"
              label="Date order"
              value={dateOrder}
              onChange={(next) => setDateOrder(next as DateOrder)}
              options={[
                { value: 'dmy', label: 'Day first', hint: '19/09/2026 is 19 September' },
                { value: 'mdy', label: 'Month first', hint: '09/19/2026 is 19 September' },
              ]}
            />
          </FormRow>
          <FormRow label="All money out" htmlFor="import-all-out">
            <input
              id="import-all-out"
              type="checkbox"
              role="switch"
              className="toggle"
              checked={allOutgoing}
              onChange={(e) => setAllOutgoing(e.target.checked)}
            />
          </FormRow>
        </FormGroup>
        <p className="form-hint">
          Turn “All money out” on when the file has no minus signs and every row is spending. Otherwise a minus sign, or
          a separate “Money in” column, decides the direction.
        </p>
      </div>

      <div>
        <h4 className="form-group-title">Match the columns</h4>
        <FormGroup>
          {FIELDS.map((field) => (
            <FormRow key={field.key} label={field.label} htmlFor={`import-${field.key}`}>
              <Select
                id={`import-${field.key}`}
                label={field.label}
                placeholder={field.required ? 'Choose a column' : 'Not in this file'}
                value={map[field.key]}
                onChange={(next) => setMap((current) => ({ ...current, [field.key]: next }))}
                options={[
                  { value: '', label: field.required ? 'Choose a column' : 'Not in this file' },
                  ...parsed.headers.map((header) => ({ value: header, label: header })),
                ]}
              />
            </FormRow>
          ))}
        </FormGroup>
        {missing.length > 0 && <p className="form-hint">Still needed: {missing.join(', ')}.</p>}
      </div>

      {prepared && (
        <div>
          <h4 className="form-group-title">Review</h4>
          {prepared.problems.length > 0 && (
            <Notice tone="warn">
              <p>
                {prepared.problems.length} {prepared.problems.length === 1 ? 'row' : 'rows'} can’t be read and will be
                skipped. Fix them in the file and import again, or import the rest.
              </p>
              <ul className="footnote">
                {prepared.problems.slice(0, 5).map((problem) => (
                  <li key={problem.line}>{problem.message}</li>
                ))}
                {prepared.problems.length > 5 && <li>…and {prepared.problems.length - 5} more.</li>}
              </ul>
            </Notice>
          )}

          <div className="table-wrap">
            <table className="ledger">
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Description</th>
                  <th scope="col">Category</th>
                  <th scope="col" className="num">
                    Amount
                  </th>
                </tr>
              </thead>
              <tbody>
                {prepared.rows.slice(0, 25).map((prepped) => (
                  <tr key={prepped.row.source_ref}>
                    <td>{formatDate(prepped.row.occurred_on)}</td>
                    <td>{prepped.row.description}</td>
                    <td className="secondary">
                      {prepped.row.category_id
                        ? (categories.data ?? []).find((c) => c.id === prepped.row.category_id)?.name
                        : '—'}
                    </td>
                    <td className="num">
                      <Amount
                        minor={prepped.row.kind === 'expense' ? -prepped.row.amount_minor : prepped.row.amount_minor}
                        currency={currency}
                        signed
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {prepared.rows.length > 25 && (
            <p className="form-hint">Showing the first 25 of {prepared.rows.length} rows.</p>
          )}
        </div>
      )}

      {error && <Notice tone="err">{error}</Notice>}

      <div className="actions">
        <Button
          dimmed={blocked || !prepared || prepared.rows.length === 0}
          busy={runImport.isPending}
          onClick={submit}
        >
          {prepared && prepared.rows.length > 0 ? `Import ${prepared.rows.length} rows` : 'Import'}
        </Button>
        {blocked && <span className="footnote">Choose an account and match the required columns first.</span>}
      </div>
    </section>
  );
}
