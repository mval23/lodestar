import { useState } from 'react';
import { SquareStack } from 'lucide-react';
import { useCurrency } from '../../lib/profile';
import { Amount } from '../../ui/Amount';
import { Button } from '../../ui/Button';
import { EmptyState } from '../../ui/EmptyState';
import { Notice } from '../../ui/Notice';
import { dataErrorMessage } from '../auth/errors';
import { AccountSheet } from './AccountSheet';
import {
  accountTypeLabel,
  netWorthOf,
  useAccounts,
  type Account,
  type AccountBalance,
} from './queries';

// The view carries everything the row shows, but the edit sheet writes the
// table, so the row is turned back into an account before editing.
function toAccount(row: AccountBalance): Account {
  return {
    id: row.account_id,
    user_id: row.user_id,
    name: row.name,
    type: row.type,
    opening_balance_minor: row.opening_balance_minor,
    opening_date: null,
    sort_order: row.sort_order,
    archived_at: row.archived_at,
    source_ref: null,
    created_at: '',
    updated_at: '',
  };
}

export function AccountsPage() {
  const currency = useCurrency();
  const accounts = useAccounts();
  const [editing, setEditing] = useState<Account | undefined>();
  const [sheetOpen, setSheetOpen] = useState(false);

  const rows = accounts.data ?? [];
  const open = rows.filter((a) => !a.archived_at);
  const archived = rows.filter((a) => a.archived_at);
  const worth = netWorthOf(rows);

  const openSheet = (account?: Account) => {
    setEditing(account);
    setSheetOpen(true);
  };

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1 className="large-title">Accounts</h1>
          {open.length > 0 && (
            <p className="footnote flush">
              {open.length} {open.length === 1 ? 'account' : 'accounts'}
              {archived.length > 0 && `, ${archived.length} archived`}
            </p>
          )}
        </div>
        <Button onClick={() => openSheet()}>Add account</Button>
      </header>

      {accounts.isError && <Notice tone="err">{dataErrorMessage(accounts.error)}</Notice>}
      {accounts.isPending && <p className="secondary">Loading your accounts…</p>}

      {accounts.isSuccess && rows.length === 0 && (
        <EmptyState
          icon={SquareStack}
          title="No accounts yet"
          action={<Button onClick={() => openSheet()}>Add your first account</Button>}
        >
          Start with where you are today: add an account and the balance it holds right now.
        </EmptyState>
      )}

      {open.length > 0 && (
        <>
          <section className="group figure-group">
            <h2 className="caption">Net worth</h2>
            <p className="fig flush">
              <span className="bracket">
                <Amount minor={worth.net} currency={currency} />
              </span>
            </p>
            <p className="footnote flush">
              <Amount minor={worth.assets} currency={currency} /> in assets
              {worth.liabilities !== 0 && (
                <>
                  {' · '}
                  <Amount minor={worth.liabilities} currency={currency} /> owed
                </>
              )}
            </p>
          </section>

          <AccountList rows={open} onEdit={openSheet} />
        </>
      )}

      {archived.length > 0 && (
        <details className="archived">
          <summary>{archived.length} archived</summary>
          <AccountList rows={archived} onEdit={openSheet} />
        </details>
      )}

      {sheetOpen && <AccountSheet account={editing} onClose={() => setSheetOpen(false)} />}
    </div>
  );
}

// One string, so it reads as one line to a screen reader and to a test.
function describeRow(row: AccountBalance): string {
  const parts = [accountTypeLabel(row.type)];
  if (row.archived_at) parts.push('Archived');
  if (row.balance_minor !== row.cleared_balance_minor) parts.push('Has pending');
  return parts.join(' · ');
}

function AccountList({ rows, onEdit }: { rows: AccountBalance[]; onEdit: (account: Account) => void }) {
  const currency = useCurrency();
  return (
    <ul className="rows-list">
      {rows.map((row) => (
        <li key={row.account_id}>
          <button type="button" className="row-button" onClick={() => onEdit(toAccount(row))}>
            <span className="row-label">
              {row.name}
              <small>{describeRow(row)}</small>
            </span>
            <Amount minor={row.balance_minor} currency={currency} />
          </button>
        </li>
      ))}
    </ul>
  );
}
