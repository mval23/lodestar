import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useCurrency, useProfile } from '../../lib/profile';
import { formatMonth, monthStartInZone, todayInZone } from '../../lib/dates';
import { activityPath, billPath, goalPath, isUuid } from '../../lib/routes';
import { Amount } from '../../ui/Amount';
import { Button } from '../../ui/Button';
import { DetailHeader, DetailNotFound, Facet, Facets, FigureRow, KeyFigure, SectionHead } from '../../ui/Detail';
import { MonthLine } from '../../ui/MonthChart';
import { Notice } from '../../ui/Notice';
import { dataErrorMessage } from '../auth/errors';
import { useCategories } from '../categories/queries';
import { useGoals } from '../goals/queries';
import { useBills } from '../bills/queries';
import {
  ActivityRows,
  KIND_LABEL,
  KIND_ORDER,
  KindTabs,
  QuickAdd,
  type ActivityRow,
} from '../transactions/DetailActivity';
import type { TxnKind } from '../transactions/queries';
import { AccountSheet } from './AccountSheet';
import {
  accountTypeLabel,
  useAccount,
  useAccountBalance,
  useAccountLedger,
  useAccountMonths,
  useAccounts,
  useArchiveAccount,
  type AccountBalance,
} from './queries';

// Every figure on this page comes from account_balances, account_month_flow
// or account_ledger; nothing is added up here.
export function AccountDetailPage() {
  const { id } = useParams();
  const valid = isUuid(id);
  const balance = useAccountBalance(valid ? id : undefined);
  const back = { to: '/accounts', label: 'Accounts' };

  if (!valid || (balance.isSuccess && !balance.data)) return <DetailNotFound what="account" back={back} />;
  if (balance.isError)
    return (
      <div className="page">
        <Notice tone="err">{dataErrorMessage(balance.error)}</Notice>
      </div>
    );
  if (!balance.data)
    return (
      <div className="page">
        <p className="secondary">Loading the account…</p>
      </div>
    );
  return <AccountDetail account={balance.data} />;
}

function AccountDetail({ account }: { account: AccountBalance }) {
  const currency = useCurrency();
  const profile = useProfile();
  const thisMonth = monthStartInZone(profile.data?.timezone);
  const today = todayInZone(profile.data?.timezone);
  const months = useAccountMonths(account.account_id, 12);
  const goals = useGoals();
  const bills = useBills();
  const archive = useArchiveAccount();
  // The sheet edits the table row, which carries columns the view does not.
  const row = useAccount(account.account_id);
  const [kind, setKind] = useState<TxnKind>('expense');
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const chart = months.data ?? [];
  const goal = (goals.data ?? []).find((g) => g.account_id === account.account_id && !g.archived_at);
  const drawing = (bills.data ?? []).filter(
    (b) => !b.archived_at && (b.from_account_id === account.account_id || b.to_account_id === account.account_id),
  );
  const owed = account.is_liability;

  const toggleArchive = async () => {
    setError(null);
    await archive
      .mutateAsync({ id: account.account_id, archived: !account.archived_at })
      .catch((cause) => setError(dataErrorMessage(cause)));
  };

  return (
    <div className="page">
      <DetailHeader
        back={{ to: '/accounts', label: 'Accounts' }}
        title={account.name}
        subtitle={
          <>
            {accountTypeLabel(account.type)}
            {account.archived_at && ' · Archived'}
            {goal && (
              <>
                {' · Funds '}
                <Link to={goalPath(goal.goal_id)}>{goal.name}</Link>
              </>
            )}
          </>
        }
        actions={
          <>
            <Button variant="secondary" busy={archive.isPending} onClick={toggleArchive}>
              {account.archived_at ? 'Restore' : 'Archive'}
            </Button>
            <Button onClick={() => setEditing(true)}>Edit</Button>
          </>
        }
      />

      {error && <Notice tone="err">{error}</Notice>}

      <FigureRow>
        <KeyFigure
          label={owed ? 'Owed' : 'Current balance'}
        >
          <Amount minor={account.balance_minor} currency={currency} />
        </KeyFigure>
        <Facets label="Totals">
          <Facet label="Money in">
            <Amount minor={account.money_in_minor} currency={currency} />
          </Facet>
          <Facet label="Money out">
            <Amount minor={account.money_out_minor} currency={currency} />
          </Facet>
          <Facet label="Opening">
            <Amount minor={account.opening_balance_minor} currency={currency} />
          </Facet>
        </Facets>
      </FigureRow>

      {months.isError && <Notice tone="err">{dataErrorMessage(months.error)}</Notice>}
      {chart.length > 0 && (
        <MonthLine
          title={owed ? 'Owed at each month end' : 'Balance at each month end'}
          caption={chart.length === 1 ? formatMonth(chart[0]!.month) : `Last ${chart.length} months`}
          rows={chart.map((m) => ({ month: m.month, value: m.closing_balance_minor }))}
          currency={currency}
          currentMonth={thisMonth}
          valueLabel="Balance"
        />
      )}

      {drawing.length > 0 && (
        <p className="footnote flush">
          {drawing.length === 1 ? 'Bill on this account: ' : 'Bills on this account: '}
          {drawing.map((b, i) => (
            <span key={b.id}>
              {i > 0 && ', '}
              <Link to={billPath(b.id)}>{b.name}</Link>
            </span>
          ))}
        </p>
      )}

      <section className="stack" aria-labelledby="account-activity">
        <SectionHead
          id="account-activity"
          title="Activity"
          link={{ to: activityPath({ accountId: account.account_id, kind }), label: 'See all in Activity' }}
        />
        <KindTabs
          label="Activity by kind"
          value={kind}
          onChange={setKind}
          tabs={KIND_ORDER.map((k) => ({ kind: k }))}
        >
          <QuickAdd key={`${account.account_id}-${kind}`} scope={{ kind, accountId: account.account_id, defaultDate: today }} />
          <LedgerTable accountId={account.account_id} kind={kind} />
        </KindTabs>
      </section>

      {editing && row.data && <AccountSheet account={row.data} onClose={() => setEditing(false)} />}
    </div>
  );
}

function LedgerTable({ accountId, kind }: { accountId: string; kind: TxnKind }) {
  const ledger = useAccountLedger(accountId, kind);
  const accounts = useAccounts();
  const categories = useCategories();
  const names = useMemo(() => new Map((accounts.data ?? []).map((a) => [a.account_id, a.name])), [accounts.data]);
  const cats = useMemo(() => new Map((categories.data ?? []).map((c) => [c.id, c.name])), [categories.data]);

  if (ledger.isError) return <Notice tone="err">{dataErrorMessage(ledger.error)}</Notice>;
  if (!ledger.data) return <p className="activity-empty secondary">Loading…</p>;

  const rows: ActivityRow[] = ledger.data.rows.map((row) => {
    const incoming = row.signed_amount_minor > 0;
    const otherId = incoming ? row.from_account_id : row.to_account_id;
    const detail =
      row.kind === 'transfer'
        ? `${incoming ? 'From' : 'To'} ${names.get(otherId ?? '') ?? 'another account'} · no category`
        : (cats.get(row.category_id ?? '') ?? 'No category');
    return {
      id: row.transaction_id,
      occurred_on: row.occurred_on,
      description: row.description,
      detail,
      amount: row.signed_amount_minor,
      signed: row.kind === 'income' || (row.kind === 'transfer' && incoming),
      balance: row.balance_after_minor,
    };
  });

  return (
    <>
      <ActivityRows
        rows={rows}
        showBalance
        caption={`${KIND_LABEL[kind]} on this account, newest first, with the balance after each`}
        empty={`No ${KIND_LABEL[kind].toLowerCase()} on this account yet. Add one above.`}
      />
      {ledger.data.total > rows.length && (
        <p className="footnote flush activity-more">
          Showing the latest {rows.length} of {ledger.data.total}.{' '}
          <Link to={activityPath({ accountId, kind })}>See the rest in Activity</Link>
        </p>
      )}
    </>
  );
}

