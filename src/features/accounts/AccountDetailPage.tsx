import { useMemo, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router';
import { useCurrency, useProfile } from '../../lib/profile';
import { addMonths, formatDate, formatDateShort, formatMonth, monthStartInZone, todayInZone } from '../../lib/dates';
import { addDays } from '../../lib/calendar';
import { share } from '../../lib/percent';
import { accountPath, activityPath, billPath, categoryPath, goalPath, isUuid } from '../../lib/routes';
import { accountFindings } from '../../lib/standsOut';
import { Amount } from '../../ui/Amount';
import { Button } from '../../ui/Button';
import { DetailHeader, DetailNotFound, SectionHead } from '../../ui/Detail';
import { FlowBalanceChart } from '../../ui/FlowBalanceChart';
import { Notice } from '../../ui/Notice';
import { ScrollTable } from '../../ui/ScrollTable';
import { StandsOut } from '../../ui/StandsOut';
import { dataErrorMessage } from '../auth/errors';
import { useCategories } from '../categories/queries';
import { useGoals, type GoalProgress } from '../goals/queries';
import { useBills } from '../bills/queries';
import { rangeLabel } from '../reports/filters';
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
  useAccountOutflows,
  useAccounts,
  useAccountSummary,
  useArchiveAccount,
  type AccountBalance,
  type AccountSummary,
  type OutflowLine,
} from './queries';

// An account as a dashboard: its balance and how it moved, what a typical
// month brings in and takes out, and where the money goes. Every figure
// comes from account_balances, account_month_flow, account_summary,
// account_outflows or account_ledger; the chart adds a month's money in
// (income and transfers) and out, two sums Postgres already made.
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

// The period the typical months and "Where it goes" cover: complete months,
// ending with the last one.
const PERIODS = [3, 6, 12] as const;
type Period = (typeof PERIODS)[number];

const shortDay = (day: string) => formatDateShort(day);

function AccountDetail({ account }: { account: AccountBalance }) {
  const currency = useCurrency();
  const profile = useProfile();
  const thisMonth = monthStartInZone(profile.data?.timezone);
  const today = todayInZone(profile.data?.timezone);
  const [period, setPeriod] = useState<Period>(3);
  const range = { from: addMonths(thisMonth, -period), to: thisMonth };
  const months = useAccountMonths(account.account_id, 12);
  const summary = useAccountSummary(account.account_id, range.from, range.to);
  const goals = useGoals();
  const bills = useBills();
  const archive = useArchiveAccount();
  // The sheet edits the table row, which carries columns the view does not.
  const row = useAccount(account.account_id);
  const [kind, setKind] = useState<TxnKind>('expense');
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const chart = months.data ?? [];
  const s = summary.data ?? null;
  const goal = (goals.data ?? []).find((g) => g.account_id === account.account_id && !g.archived_at);
  const drawing = (bills.data ?? []).filter(
    (b) => !b.archived_at && (b.from_account_id === account.account_id || b.to_account_id === account.account_id),
  );
  const owed = account.is_liability;
  const label = rangeLabel(range);

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
            {row.data?.opening_date && ` · tracking since ${formatDate(row.data.opening_date)}`}
            {account.archived_at && ' · Archived'}
            {!account.include_in_net_worth && ' · Not in net worth'}
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
      {summary.isError && <Notice tone="err">{dataErrorMessage(summary.error)}</Notice>}
      {s && (
        <StandsOut
          currency={currency}
          findings={accountFindings({
            name: account.name,
            liability: owed,
            since_month_end_minor: s.since_month_end_minor,
            month_end: shortDay(s.month_end_on),
            lowest_minor: s.lowest_minor,
            lowest_on: shortDay(s.lowest_on),
          })}
        />
      )}

      <div className="detail-period">
        <span className="footnote">Typical months and where it goes, over</span>
        <div className="segmented" role="radiogroup" aria-label="Period">
          {PERIODS.map((n) => (
            <label key={n}>
              <input type="radio" name="account-period" value={n} checked={period === n} onChange={() => setPeriod(n)} />
              {n} months
            </label>
          ))}
        </div>
      </div>

      <section className="group fig-band" aria-label="This account">
        <div className="fig-cell">
          <h2 className="caption">{owed ? 'Owed' : 'Balance'}</h2>
          <p className="fig flush">
            <span className="bracket">
              <Amount minor={account.balance_minor} currency={currency} />
            </span>
          </p>
          <p className="footnote flush">
            {s ? (
              <>
                <Amount minor={s.since_month_end_minor} currency={currency} signed /> since {shortDay(s.month_end_on)} ·{' '}
                <Amount minor={s.since_year_ago_minor} currency={currency} signed /> since {formatDate(s.year_ago_on)}
              </>
            ) : (
              'Working out the changes…'
            )}
          </p>
          {account.type === 'investment' && (
            <p className="footnote flush">Prices aren’t tracked: this is what you’ve recorded.</p>
          )}
        </div>
        <TypeCells account={account} summary={s} goal={goal ?? null} label={label} thisMonth={thisMonth} />
      </section>

      <div className="report-pair wide-left">
        <div className="stack">
          {months.isError && <Notice tone="err">{dataErrorMessage(months.error)}</Notice>}
          {chart.length > 0 && (
            <FlowBalanceChart
              title="What moved the balance"
              caption={`Money in above zero, money out below, and the ${owed ? 'amount owed' : 'balance'} at each month end. ${formatMonth(thisMonth).split(' ')[0]} is to date.`}
              months={chart.map((m) => ({
                month: m.month,
                in_minor: m.income_minor + m.transfer_in_minor,
                out_minor: m.expense_minor + m.transfer_out_minor,
                balance_minor: m.closing_balance_minor,
              }))}
              currency={currency}
              currentMonth={thisMonth}
            />
          )}
        </div>
        <WhereItGoes account={account} from={range.from} to={range.to} label={label} />
      </div>

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
          title="Latest"
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

// The three figures after the balance, chosen by what the account is for.
function TypeCells({
  account,
  summary: s,
  goal,
  label,
  thisMonth,
}: {
  account: AccountBalance;
  summary: AccountSummary | null;
  goal: GoalProgress | null;
  label: string;
  thisMonth: string;
}) {
  const currency = useCurrency();
  const money = (minor: number | undefined) => (s && minor !== undefined ? <Amount minor={minor} currency={currency} /> : '—');
  const lowest = (title: string) => (
    <Cell title={title} figure={money(s?.lowest_minor)}>
      {s ? formatDate(s.lowest_on) : null}
    </Cell>
  );

  if (account.type === 'credit_card') {
    return (
      <>
        <Cell title="Purchases, a typical month" figure={money(s?.avg_expense_minor)}>
          Spending on the card, {label}
        </Cell>
        <Cell title="Paid, a typical month" figure={money(s?.avg_transfer_in_minor)}>
          Payments into the card, {label}
        </Cell>
        {lowest('Most owed, last 90 days')}
      </>
    );
  }
  if (account.type === 'loan') {
    const left = s?.payments_left ?? null;
    return (
      <>
        <Cell title="Paid, a typical month" figure={money(s?.avg_transfer_in_minor)}>
          Payments into the loan, {label}
        </Cell>
        <Cell
          title={
            <>
              Paid off around <span className="estimate-tag">Estimate</span>
            </>
          }
          figure={left !== null ? formatMonth(addMonths(thisMonth, left)) : '—'}
        >
          {left !== null
            ? `${left} more ${left === 1 ? 'payment' : 'payments'} at that amount; interest isn’t separated`
            : account.balance_minor >= 0
              ? 'Nothing is owed'
              : 'No recent payments to estimate from'}
        </Cell>
        {lowest('Most owed, last 90 days')}
      </>
    );
  }
  const saving = account.type === 'savings' || account.type === 'investment';
  return (
    <>
      <Cell title={saving ? 'Put in, a typical month' : 'In, a typical month'} figure={money(s?.avg_in_minor)}>
        {saving ? 'Transfers and income in' : 'Income and transfers in'}, {label}
      </Cell>
      <Cell title={saving ? 'Taken out, a typical month' : 'Out, a typical month'} figure={money(s?.avg_out_minor)}>
        {saving ? 'Withdrawals and spending' : 'Spending and transfers to your other accounts'}, {label}
      </Cell>
      {goal ? (
        <Cell
          title={<Link to={goalPath(goal.goal_id)}>{goal.name}</Link>}
          figure={goal.target_minor ? share(goal.balance_minor, goal.target_minor) : 'No target'}
        >
          {goal.target_minor ? (
            <>
              of <Amount minor={goal.target_minor} currency={currency} /> saved
            </>
          ) : (
            'A fund that grows with every transfer in'
          )}
        </Cell>
      ) : (
        lowest('Lowest, last 90 days')
      )}
    </>
  );
}

function Cell({ title, figure, children }: { title: ReactNode; figure: ReactNode; children?: ReactNode }) {
  return (
    <div className="fig-cell">
      <h2 className="caption">{title}</h2>
      <p className="card-figure flush">{figure}</p>
      {children && <p className="footnote flush">{children}</p>}
    </div>
  );
}

// A transfer leaves the account but stays yours, so it is named for where
// it went and tagged.
function outflowName(line: OutflowLine): string {
  if (line.line !== 'account') return line.name;
  if (line.account_type === 'credit_card' || line.account_type === 'loan') return `${line.name} payments`;
  if (line.account_type === 'cash') return `Cash to ${line.name}`;
  return `To ${line.name}`;
}

function outflowLink(line: OutflowLine, accountId: string, from: string, to: string): string {
  if (line.line === 'goals') return '/goals';
  if (line.line === 'account' && line.to_account_id) return accountPath(line.to_account_id);
  if (line.category_id) return categoryPath(line.category_id);
  return activityPath({ accountId, kind: 'expense', categoryId: 'none', from, to: addDays(to, -1) });
}

function WhereItGoes({ account, from, to, label }: { account: AccountBalance; from: string; to: string; label: string }) {
  const currency = useCurrency();
  const outflows = useAccountOutflows(account.account_id, from, to);
  const lines = outflows.data ?? [];
  const total = lines[0]?.total_out_minor ?? 0;
  const largest = Math.max(1, ...lines.map((l) => l.out_minor));

  return (
    <section className="group stack-tight" aria-labelledby="account-goes">
      <div>
        <h2 className="headline" id="account-goes">
          Where it goes
        </h2>
        <p className="footnote flush">
          Money out of {account.name}, {label}
          {total > 0 && (
            <>
              {' · '}
              <Amount minor={total} currency={currency} />
            </>
          )}
        </p>
      </div>
      {outflows.isError ? (
        <Notice tone="err">{dataErrorMessage(outflows.error)}</Notice>
      ) : !outflows.data ? (
        <p className="footnote flush">Loading…</p>
      ) : lines.length === 0 ? (
        <p className="secondary flush">Nothing went out of this account in {label}.</p>
      ) : (
        <ScrollTable label="Where it goes table">
          <table className="ledger compact outflows">
            <thead>
              <tr>
                <th scope="col">Where</th>
                <th scope="col">
                  <span className="visually-hidden">Share</span>
                </th>
                <th scope="col" className="num">
                  Out
                </th>
                <th scope="col" className="num">
                  Share
                </th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <tr key={`${line.line}-${line.category_id ?? ''}-${line.to_account_id ?? ''}`}>
                  <th scope="row">
                    <Link className="plain-link" to={outflowLink(line, account.account_id, from, to)}>
                      {outflowName(line)}
                    </Link>
                    {line.line !== 'category' && <small className="secondary"> · transfer</small>}
                  </th>
                  <td className="month-cat-bar" aria-hidden="true">
                    <span className={`bar-track${line.line !== 'category' ? ' bar-transfer' : ''}`}>
                      <i style={{ width: `${Math.max(2, Math.round((line.out_minor / largest) * 100))}%` }} />
                    </span>
                  </td>
                  <td className="num">
                    <Amount minor={line.out_minor} currency={currency} />
                  </td>
                  <td className="num secondary">{share(line.out_minor, total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollTable>
      )}
      <p className="footnote flush">
        Transfers move money to your own accounts.
        {!account.is_liability && ' Card purchases are counted on the card, not here.'}
      </p>
    </section>
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
      kind: row.kind,
      category_id: row.kind === 'transfer' ? undefined : (row.category_id ?? null),
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

