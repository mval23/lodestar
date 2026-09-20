import { useState } from 'react';
import { Link, useLocation } from 'react-router';
import { LayoutGrid } from 'lucide-react';
import { useCurrency, useProfile, useUpdateProfile } from '../../lib/profile';
import { CURRENCIES, type Currency } from '../../lib/money';
import { Amount } from '../../ui/Amount';
import { Button } from '../../ui/Button';
import { EmptyState } from '../../ui/EmptyState';
import { Notice } from '../../ui/Notice';
import { AccountSheet } from '../accounts/AccountSheet';
import { accountTypeLabel, netWorthOf, useAccounts } from '../accounts/queries';

export function OverviewPage() {
  const notice = (useLocation().state as { notice?: string } | null)?.notice;
  const currency = useCurrency();
  const accounts = useAccounts();
  const [sheetOpen, setSheetOpen] = useState(false);

  const rows = (accounts.data ?? []).filter((a) => !a.archived_at);
  const worth = netWorthOf(accounts.data ?? []);
  const firstRun = accounts.isSuccess && (accounts.data ?? []).length === 0;

  return (
    <div className="page">
      <header className="page-head">
        <h1 className="large-title">Overview</h1>
        {!firstRun && rows.length > 0 && <Button onClick={() => setSheetOpen(true)}>Add account</Button>}
      </header>

      {notice && <Notice tone="ok">{notice}</Notice>}

      {firstRun ? (
        <FirstRun onAddAccount={() => setSheetOpen(true)} />
      ) : (
        <>
          <section className="group figure-group">
            <h2 className="caption">Net worth</h2>
            <p className="fig flush">
              <span className="bracket">
                <Amount minor={worth.net} currency={currency} />
              </span>
            </p>
            <p className="footnote flush">Everything you own, less what you owe.</p>
          </section>

          {rows.length > 0 && (
            <section>
              <h2 className="form-group-title">Accounts</h2>
              <ul className="rows-list">
                {rows.slice(0, 6).map((row) => (
                  <li key={row.account_id}>
                    <Link className="row-button" to="/accounts">
                      <span className="row-label">
                        {row.name}
                        <small>{accountTypeLabel(row.type)}</small>
                      </span>
                      <Amount minor={row.balance_minor} currency={currency} />
                    </Link>
                  </li>
                ))}
              </ul>
              {rows.length > 6 && (
                <p className="form-hint">
                  <Link to="/accounts">See all {rows.length} accounts</Link>
                </p>
              )}
            </section>
          )}

          <EmptyState icon={LayoutGrid} title="Transactions are next">
            Adding income, expenses and transfers arrives in the next build. Accounts and balances work now.
          </EmptyState>
        </>
      )}

      {sheetOpen && <AccountSheet onClose={() => setSheetOpen(false)} />}
    </div>
  );
}

// First run: choose the currency, then add the first account. The choice is
// offered here because it can only be changed until the first transaction.
function FirstRun({ onAddAccount }: { onAddAccount: () => void }) {
  const profile = useProfile();
  const update = useUpdateProfile();
  const currency = useCurrency();

  const choose = (next: Currency) => {
    if (!profile.data || next === currency) return;
    update.mutate({ id: profile.data.id, changes: { currency: next } });
  };

  return (
    <section className="group stack">
      <div>
        <h2 className="title-2">Welcome to Lodestar</h2>
        <p className="secondary flush">
          Let’s start with where you are today: add an account and its current balance. Budgets, bills and goals can
          come later, whenever you’re ready.
        </p>
      </div>

      <div>
        <h3 className="form-group-title">Your currency</h3>
        <div className="form-group">
          <div className="form-row">
            <span className="form-label">Currency</span>
            <div className="segmented" role="radiogroup" aria-label="Currency">
              {(Object.keys(CURRENCIES) as Currency[]).map((code) => (
                <label key={code}>
                  <input
                    type="radio"
                    name="first-run-currency"
                    value={code}
                    checked={currency === code}
                    onChange={() => choose(code)}
                  />
                  {code}
                </label>
              ))}
            </div>
          </div>
        </div>
        <p className="form-hint">
          Every account and amount uses {CURRENCIES[currency].label}, and nothing is ever converted. You can change this
          until you record your first transaction.
        </p>
      </div>

      {update.isError && <Notice tone="err">That didn’t save. Try again in a moment.</Notice>}

      <div className="actions">
        <Button onClick={onAddAccount}>Add your first account</Button>
      </div>
    </section>
  );
}
