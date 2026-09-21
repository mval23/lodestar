import { formatDate } from '../../lib/dates';
import { Notice } from '../../ui/Notice';
import { dataErrorMessage } from '../auth/errors';
import { ExportPanel } from './ExportPanel';
import { ImportWizard } from './ImportWizard';
import { useImportBatches } from './queries';

export function ImportExportPage() {
  const batches = useImportBatches();

  return (
    <div className="page page-form">
      <header className="page-head">
        <h1 className="large-title">Import &amp; export</h1>
      </header>

      <section className="stack">
        <h2 className="title-2">Import</h2>
        <ImportWizard />
      </section>

      {batches.isError && <Notice tone="err">{dataErrorMessage(batches.error)}</Notice>}

      {(batches.data ?? []).length > 0 && (
        <section>
          <h2 className="form-group-title">Past imports</h2>
          <ul className="rows-list">
            {(batches.data ?? []).map((batch) => (
              <li key={batch.id}>
                <div className="row-button">
                  <span className="row-label">
                    {batch.filename ?? 'Untitled file'}
                    <small>
                      {formatDate(batch.created_at.slice(0, 10))} · {batch.row_count}{' '}
                      {batch.row_count === 1 ? 'row' : 'rows'} · {batch.source === 'notion' ? 'Notion' : 'CSV'}
                    </small>
                  </span>
                </div>
              </li>
            ))}
          </ul>
          <p className="form-hint">
            Deleting an import removes every transaction it created. Undo is offered right after an import.
          </p>
        </section>
      )}

      <ExportPanel />
    </div>
  );
}
