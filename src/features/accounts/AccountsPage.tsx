import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { SquareStack } from 'lucide-react';
import { addMonths, formatDateShort, monthStartInZone } from '../../lib/dates';
import { describeMoney, type Currency } from '../../lib/money';
import { useCurrency, useProfile } from '../../lib/profile';
import { accountPath, monthRange } from '../../lib/routes';
import { Amount } from '../../ui/Amount';
import { Button } from '../../ui/Button';
import { EmptyState } from '../../ui/EmptyState';
import { Notice } from '../../ui/Notice';
import { Sparkline } from '../../ui/Sparkline';
import { dataErrorMessage } from '../auth/errors';
import { useGoals, type GoalProgress } from '../goals/queries';
import { useAccountClosings, type AccountClosing } from '../overview/queries';
import { useNetWorth } from '../reports/queries';
import { AccountSheet } from './AccountSheet';
import { AccountsSummary } from './AccountsSummary';
import { ACCOUNT_GROUPS } from './groups';
import { StarButton } from './StarButton';
import {
  accountTypeLabel,
  useAccounts,
  type Account,
  type AccountBalance,
} from './queries';

// How far back each account's line reaches.
const TREND_MONTHS = 6;

export function AccountsPage() {
  const accounts = useAccounts();
  const profile = useProfile();
  const currency = useCurrency();
  const month = monthStartInZone(profile.data?.timezone);
  const closings = useAccountClosings(month);
  const netWorth = useNetWorth(12);
  const goals = useGoals();
  const [editing, setEditing] = useState<Account | undefined>();
  const [sheetOpen, setSheetOpen] = useState(false);

  const rows = accounts.data ?? [];
  const open = rows.filter((a) => !a.archived_at);
  const archived = rows.filter((a) => a.archived_at);
  const favorites = open.filter((a) => a.is_favorite);
  const since = formatDateShort(monthRange(addMonths(month, -1)).to);
  const trends = trendsOf(closings.data ?? [], month);
  const goalOf = new Map(
    (goals.data ?? []).filter((g) => !g.archived_at).map((g) => [g.account_id, g] as const),
  );

  const openSheet = (account?: Account) => {
    setEditing(account);
    setSheetOpen(true);
  };

  const list = (members: AccountBalance[], showType: boolean) => (
    <ul className="rows-list account-rows">
      {members.map((row) => (
        <AccountRow
          key={row.account_id}
          row={row}
          trend={trends.get(row.account_id)}
          goal={goalOf.get(row.account_id)}
          showType={showType}
          since={since}
          currency={currency}
        />
      ))}
    </ul>
  );

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
        <Button data-tour="add-account" onClick={() => openSheet()}>
          Add account
        </Button>
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
          <AccountsSummary accounts={rows} trend={netWorth.data ?? []} since={since} currency={currency} />

          <div className="stack">
            <p className="account-columns" aria-hidden="true">
              <span />
              <span>Last {TREND_MONTHS} months</span>
              <span>Since {since}</span>
              <span>Balance</span>
            </p>

            {/* Starred accounts, first, as a shortcut. They stay in their own
                group below too, so every group's subtotal is all of it. */}
            {favorites.length > 0 && (
              <section className="account-group" aria-labelledby="accounts-favorites">
                <h2 className="account-group-head" id="accounts-favorites">
                  <span>Favorites</span>
                </h2>
                {list(favorites, true)}
              </section>
            )}

            {ACCOUNT_GROUPS.map((group) => {
              const members = open.filter((row) => group.types.includes(row.type));
              if (members.length === 0) return null;
              const id = `accounts-${group.title.toLowerCase().replace(/\W+/g, '-')}`;
              // Balances already summed in Postgres, added for a heading.
              const subtotal = members.reduce((sum, row) => sum + row.balance_minor, 0);
              const changes = members.map((row) => changeOf(row, trends.get(row.account_id)));
              const known = changes.filter((c): c is number => c !== null);
              return (
                <section key={group.title} className="account-group" aria-labelledby={id}>
                  <h2 className="account-group-head" id={id}>
                    <span>{group.title}</span>
                    <span className="account-group-change">
                      {known.length > 0 && <Change minor={known.reduce((a, b) => a + b, 0)} since={since} currency={currency} />}
                    </span>
                    <Amount minor={subtotal} currency={currency} />
                  </h2>
                  {list(members, group.types.length > 1)}
                </section>
              );
            })}
          </div>
        </>
      )}

      {archived.length > 0 && (
        <details className="archived">
          <summary>{archived.length} archived</summary>
          <ArchivedList rows={archived} currency={currency} />
        </details>
      )}

      {sheetOpen && <AccountSheet account={editing} onClose={() => setSheetOpen(false)} />}
    </div>
  );
}

type Trend = { series: number[]; previous: number | null };

// Each account's month-end balances over the last few months, and where it
// stood at the end of last month. Every figure is a month-end balance from
// account_month_flow; nothing is summed here.
function trendsOf(closings: AccountClosing[], month: string): Map<string, Trend> {
  const months = Array.from({ length: TREND_MONTHS }, (_, i) => addMonths(month, i - (TREND_MONTHS - 1)));
  const previous = addMonths(month, -1);
  const byAccount = new Map<string, Map<string, number>>();
  for (const c of closings) {
    if (!byAccount.has(c.account_id)) byAccount.set(c.account_id, new Map());
    byAccount.get(c.account_id)!.set(c.month, c.closing_balance_minor);
  }
  const trends = new Map<string, Trend>();
  for (const [id, byMonth] of byAccount) {
    trends.set(id, {
      series: months.filter((m) => byMonth.has(m)).map((m) => byMonth.get(m)!),
      previous: byMonth.get(previous) ?? null,
    });
  }
  return trends;
}

// How far the balance has moved since last month's end; nothing for an
// account that didn't exist then.
function changeOf(row: AccountBalance, trend: Trend | undefined): number | null {
  return trend?.previous == null ? null : row.balance_minor - trend.previous;
}

function Change({ minor, since, currency }: { minor: number; since: string; currency: Currency }) {
  return (
    <span className="account-change">
      <Amount minor={minor} currency={currency} signed />
      <span className="visually-hidden"> since {since}</span>
    </span>
  );
}

// A row opens the account's own page, where it is also edited. The star sits
// beside the link, not in it, so starring never opens the account.
function AccountRow({
  row,
  trend,
  goal,
  showType,
  since,
  currency,
}: {
  row: AccountBalance;
  trend: Trend | undefined;
  goal: GoalProgress | undefined;
  showType: boolean;
  since: string;
  currency: Currency;
}) {
  const change = changeOf(row, trend);
  const series = trend?.series ?? [];

  const meta: ReactNode[] = [];
  if (showType) meta.push(accountTypeLabel(row.type));
  if (!row.include_in_net_worth) meta.push('Not in net worth');

  return (
    <li className="account-row">
      <StarButton accountId={row.account_id} name={row.name} favorite={row.is_favorite} />
      <Link to={accountPath(row.account_id)} className="account-link">
        <span className="row-label">
          {row.name}
          {meta.length > 0 && <small>{meta.join(' · ')}</small>}
          {goal && <GoalLine goal={goal} currency={currency} />}
        </span>
        <span className="account-trend">
          {series.length >= 2 && (
            <Sparkline
              tiny
              values={series}
              label={`${row.name} at each month end, from ${describeMoney(series[0]!, currency)} to ${describeMoney(series[series.length - 1]!, currency)}.`}
            />
          )}
        </span>
        <span className="account-row-change">
          {change !== null && <Change minor={change} since={since} currency={currency} />}
        </span>
        <Amount minor={row.balance_minor} currency={currency} className="account-balance" />
      </Link>
    </li>
  );
}

// The goal this account funds: how far along it is, or just its name when
// it has no target.
function GoalLine({ goal, currency }: { goal: GoalProgress; currency: Currency }) {
  if (!goal.target_minor) return <small>Funds {goal.name}</small>;
  const share = Math.max(0, Math.min(100, Math.floor((goal.balance_minor / goal.target_minor) * 100)));
  return (
    <small className="account-goal">
      <span className="account-goal-bar" aria-hidden="true">
        <i style={{ width: `${share}%` }} />
      </span>
      <span>
        Goal · {share}% of <Amount minor={goal.target_minor} currency={currency} />
      </span>
    </small>
  );
}

function ArchivedList({ rows, currency }: { rows: AccountBalance[]; currency: Currency }) {
  return (
    <ul className="rows-list">
      {rows.map((row) => (
        <li key={row.account_id}>
          <Link to={accountPath(row.account_id)} className="row-button">
            <span className="row-label">
              {row.name}
              <small>
                {accountTypeLabel(row.type)} · Archived
                {!row.include_in_net_worth && ' · Not in net worth'}
              </small>
            </span>
            <Amount minor={row.balance_minor} currency={currency} />
          </Link>
        </li>
      ))}
    </ul>
  );
}
