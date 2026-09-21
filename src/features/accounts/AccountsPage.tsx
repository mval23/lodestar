import { useState } from 'react';
import { Link } from 'react-router';
import { SquareStack } from 'lucide-react';
import { useCurrency } from '../../lib/profile';
import { accountPath } from '../../lib/routes';
import { Amount } from '../../ui/Amount';
import { Button } from '../../ui/Button';
import { EmptyState } from '../../ui/EmptyState';
import { Notice } from '../../ui/Notice';
import { dataErrorMessage } from '../auth/errors';
import { AccountSheet } from './AccountSheet';
import { NetWorthGroup } from './NetWorthGroup';
import { accountTypeLabel, useAccounts, type Account, type AccountBalance } from './queries';

export function AccountsPage() {
  const accounts = useAccounts();
  const [editing, setEditing] = useState<Account | undefined>();
  const [sheetOpen, setSheetOpen] = useState(false);

  const rows = accounts.data ?? [];
  const open = rows.filter((a) => !a.archived_at);
  const archived = rows.filter((a) => a.archived_at);

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
          <NetWorthGroup accounts={rows} />
          <AccountList rows={open} />
        </>
      )}

      {archived.length > 0 && (
        <details className="archived">
          <summary>{archived.length} archived</summary>
          <AccountList rows={archived} />
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
  return parts.join(' · ');
}

// A row opens the account's own page, where it is also edited.
function AccountList({ rows }: { rows: AccountBalance[] }) {
  const currency = useCurrency();
  return (
    <ul className="rows-list">
      {rows.map((row) => (
        <li key={row.account_id}>
          <Link to={accountPath(row.account_id)} className="row-button">
            <span className="row-label">
              {row.name}
              <small>{describeRow(row)}</small>
            </span>
            <Amount minor={row.balance_minor} currency={currency} />
          </Link>
        </li>
      ))}
    </ul>
  );
}
