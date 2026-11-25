import { useMemo, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router';
import { useCurrency, useProfile } from '../../lib/profile';
import { addMonths, formatDate, formatDateShort, formatMonth, formatWeekday, monthStartInZone, todayInZone } from '../../lib/dates';
import { addDays } from '../../lib/calendar';
import { share } from '../../lib/percent';
import { accountPath, activityPath, billPath, categoryPath, goalPath, isUuid } from '../../lib/routes';
import { Amount } from '../../ui/Amount';
import { Button } from '../../ui/Button';
import { DetailHeader, DetailNotFound, SectionHead } from '../../ui/Detail';
import { InOutChart } from '../../ui/InOutChart';
import { Notice } from '../../ui/Notice';
import { ScrollTable } from '../../ui/ScrollTable';
import { Select } from '../../ui/Select';
import { dataErrorMessage } from '../auth/errors';
import { useCategories } from '../categories/queries';
import { useGoalPace, useGoals, type GoalProgress } from '../goals/queries';
import { describeDue, describeSchedule, dueStateOf, useBills, type RecurringItem } from '../bills/queries';
import { rangeLabel } from '../reports/filters';
import {
  ActivityRows,
  KIND_LABEL,
  KIND_ORDER,
  KindTabs,
  QuickAdd,
  type ActivityRow,
  type TabKind,
} from '../transactions/DetailActivity';
import type { TxnKind } from '../transactions/queries';
import { AccountSheet } from './AccountSheet';
import { StarButton } from './StarButton';
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

// An account as a dashboard, top to bottom: where it stands, with the bills
// on it and the goal it funds; money in and out month by month; where the
// money goes; and its own activity. Every figure comes from
// account_balances, account_month_flow, account_summary, account_outflows,
// account_ledger, recurring_items or goal_progress; the chart adds a month's
// money in (income and transfers) and out, two sums Postgres already made.
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

// The complete months a typical month and "Where it goes" are worked out
// over. The chart shows the same months and this one, to date.
const PERIODS = [3, 6, 12] as const;
type Period = (typeof PERIODS)[number];

// How many of the biggest outflows show before "Show more": with many
// categories, the long tail is one tap away rather than in the way.
const TOP_OUTFLOWS = 6;
// The soonest few bills; the rest wait behind "Show N more", so a long
// schedule doesn't stretch the top of the page.
const NEXT_BILLS = 4;

const shortDay = (day: string) => formatDateShort(day);

function AccountDetail({ account }: { account: AccountBalance }) {
  const currency = useCurrency();
  const profile = useProfile();
  const thisMonth = monthStartInZone(profile.data?.timezone);
  const today = todayInZone(profile.data?.timezone);
  const [period, setPeriod] = useState<Period>(12);
  const range = { from: addMonths(thisMonth, -period), to: thisMonth };
  const months = useAccountMonths(account.account_id, 13);
  const summary = useAccountSummary(account.account_id, range.from, range.to);
  const goals = useGoals();
  const bills = useBills();
  const archive = useArchiveAccount();
  // The sheet edits the table row, which carries columns the view does not.
  const row = useAccount(account.account_id);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const s = summary.data ?? null;
  const goal = (goals.data ?? []).find((g) => g.account_id === account.account_id && !g.archived_at) ?? null;
  const onAccount = (bills.data ?? [])
    .filter((b) => !b.archived_at && (b.from_account_id === account.account_id || b.to_account_id === account.account_id))
    .sort((a, b) => a.next_due_on.localeCompare(b.next_due_on) || a.name.localeCompare(b.name));
  const owed = account.is_liability;
  const label = rangeLabel(range);
  const chart = (months.data ?? []).slice(-(period + 1));

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
        titleExtra={<StarButton accountId={account.account_id} name={account.name} favorite={account.is_favorite} size={22} />}
        subtitle={
          <>
            {accountTypeLabel(account.type)}
            {row.data?.opening_date && ` · tracking since ${formatDate(row.data.opening_date)}`}
            {account.archived_at && ' · Archived'}
            {!account.include_in_net_worth && ' · Not in net worth'}
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

      <div className={goal ? 'account-top with-goal' : 'account-top'}>
        <section className="group account-standing" aria-labelledby="account-balance">
          <h2 className="caption" id="account-balance">
            {owed ? 'Owed' : 'Balance'}
          </h2>
          <p className="fig flush">
            <span className="bracket">
              <Amount minor={account.balance_minor} currency={currency} />
            </span>
          </p>
          {s ? (
            <>
              <p className="footnote flush">
                <Amount minor={s.since_month_end_minor} currency={currency} signed /> since {shortDay(s.month_end_on)} ·{' '}
                <Amount minor={s.since_year_ago_minor} currency={currency} signed /> since {formatDate(s.year_ago_on)}
              </p>
              <p className="footnote flush">
                {owed ? 'Most owed' : 'Lowest'} in the last 90 days: <Amount minor={s.lowest_minor} currency={currency} />,{' '}
                {shortDay(s.lowest_on)}
              </p>
            </>
          ) : (
            <p className="footnote flush">Working out the changes…</p>
          )}
          {account.type === 'investment' && (
            <p className="footnote flush">Prices aren’t tracked: this is what you’ve recorded.</p>
          )}
        </section>

        <BillsOnAccount account={account} bills={onAccount} today={today} />
        {goal && <GoalFund goal={goal} />}
      </div>

      {months.isError && <Notice tone="err">{dataErrorMessage(months.error)}</Notice>}
      {chart.length > 0 && (
        <InOutChart
          title="Money in and out"
          caption={`Each month; ${formatMonth(thisMonth).split(' ')[0]} is to date.`}
          months={chart.map((m) => ({
            month: m.month,
            in_minor: m.income_minor + m.transfer_in_minor,
            out_minor: m.expense_minor + m.transfer_out_minor,
            balance_minor: m.closing_balance_minor,
          }))}
          currency={currency}
          currentMonth={thisMonth}
          head={
            <div className="inout-head">
              <TypicalFigures account={account} summary={s} label={label} thisMonth={thisMonth} />
              <div className="segmented" role="radiogroup" aria-label="Months to show">
                {PERIODS.map((n) => (
                  <label key={n}>
                    <input type="radio" name="account-period" value={n} checked={period === n} onChange={() => setPeriod(n)} />
                    {n} months
                  </label>
                ))}
              </div>
            </div>
          }
        />
      )}

      <WhereItGoes account={account} thisMonth={thisMonth} />

      <AccountActivity account={account} today={today} />

      {editing && row.data && <AccountSheet account={row.data} onClose={() => setEditing(false)} />}
    </div>
  );
}

// The bills, expected income and planned transfers on this account, soonest
// first, each signed for this account: money in it gets a plus.
function BillsOnAccount({ account, bills, today }: { account: AccountBalance; bills: RecurringItem[]; today: string }) {
  const currency = useCurrency();
  const [all, setAll] = useState(false);
  const shown = all ? bills : bills.slice(0, NEXT_BILLS);
  const hidden = bills.length - shown.length;
  return (
    <section className="group account-bills" aria-labelledby="account-bills">
      <div className="card-head">
        <h2 className="headline" id="account-bills">
          Bills on this account
        </h2>
        <Link className="footnote" to="/bills">
          Bills
        </Link>
      </div>
      {bills.length === 0 ? (
        <p className="secondary flush">Nothing is scheduled on this account. Add a bill, income or transfer on Bills.</p>
      ) : (
        <ul className="account-bill-list">
          {shown.map((bill) => {
            const incoming = bill.to_account_id === account.account_id;
            const overdue = dueStateOf(bill.next_due_on, today) === 'overdue';
            return (
              <li key={bill.id}>
                <Link to={billPath(bill.id)} className="account-bill">
                  <span className="row-label">
                    <span>
                      {bill.name}
                      {bill.kind !== 'expense' && <span className="kind-tag">{bill.kind === 'income' ? 'Income' : 'Transfer'}</span>}
                    </span>
                    <small className={overdue ? 'due-overdue' : undefined}>
                      {overdue ? describeDue(bill.next_due_on, today) : `Next ${formatWeekday(bill.next_due_on)}`} ·{' '}
                      {describeSchedule(bill.cadence_unit, bill.cadence_interval)}
                      {bill.amount_is_variable && ' · amount varies'}
                    </small>
                  </span>
                  <Amount
                    minor={incoming ? bill.amount_minor : -bill.amount_minor}
                    currency={currency}
                    signed={incoming}
                    className="account-bill-amount"
                  />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {bills.length > NEXT_BILLS && (
        <p className="flush">
          <button type="button" className="btn btn-plain show-more" aria-expanded={all} onClick={() => setAll((v) => !v)}>
            {all ? `Show the next ${NEXT_BILLS} only` : `Show ${hidden} more`}
          </button>
        </p>
      )}
    </section>
  );
}

// The goal this account is the fund for: how far along, and its plan.
function GoalFund({ goal }: { goal: GoalProgress }) {
  const currency = useCurrency();
  const pace = useGoalPace(goal.goal_id);
  const target = goal.target_minor;
  const width = target ? Math.max(0, Math.min(100, Math.floor((goal.balance_minor / target) * 100))) : 0;
  return (
    <section className="group account-goal-card" aria-labelledby="account-goal">
      <div className="card-head">
        <h2 className="headline" id="account-goal">
          Funds a goal
        </h2>
        <Link className="footnote" to={goalPath(goal.goal_id)}>
          {goal.name}
        </Link>
      </div>
      {target ? (
        <>
          <p className="card-figure flush">
            {share(goal.balance_minor, target)}{' '}
            <span className="footnote">
              of <Amount minor={target} currency={currency} />
            </span>
          </p>
          <span className="account-goal-track" aria-hidden="true">
            <i style={{ width: `${width}%` }} />
          </span>
        </>
      ) : (
        <p className="card-figure flush">No target</p>
      )}
      <p className="footnote flush">
        {goal.monthly_plan_minor ? (
          <>
            <Amount minor={goal.monthly_plan_minor} currency={currency} /> a month planned
          </>
        ) : (
          'No monthly plan'
        )}
        {target && pace.data?.estimated_month && ` · at the recent pace, around ${formatMonth(pace.data.estimated_month)}`}
      </p>
    </section>
  );
}

// The typical month's figures over the switch's months, chosen by what the
// account is for: a card has purchases and payments, a loan its payments and
// when it might be paid off, the rest money in and out.
function TypicalFigures({
  account,
  summary: s,
  label,
  thisMonth,
}: {
  account: AccountBalance;
  summary: AccountSummary | null;
  label: string;
  thisMonth: string;
}) {
  const currency = useCurrency();
  const money = (minor: number | undefined) => (s && minor !== undefined ? <Amount minor={minor} currency={currency} /> : '—');

  let figures: { title: ReactNode; figure: ReactNode; note: ReactNode }[];
  if (account.type === 'credit_card') {
    figures = [
      { title: 'Purchases, a typical month', figure: money(s?.avg_expense_minor), note: 'Spending on the card' },
      { title: 'Paid, a typical month', figure: money(s?.avg_transfer_in_minor), note: 'Payments into the card' },
    ];
  } else if (account.type === 'loan') {
    const left = s?.payments_left ?? null;
    figures = [
      { title: 'Paid, a typical month', figure: money(s?.avg_transfer_in_minor), note: 'Payments into the loan' },
      {
        title: (
          <>
            Paid off around <span className="estimate-tag">Estimate</span>
          </>
        ),
        figure: left !== null ? formatMonth(addMonths(thisMonth, left)) : '—',
        note:
          left !== null
            ? `${left} more ${left === 1 ? 'payment' : 'payments'} at that amount; interest isn’t separated`
            : account.balance_minor >= 0
              ? 'Nothing is owed'
              : 'No recent payments to estimate from',
      },
    ];
  } else {
    const saving = account.type === 'savings' || account.type === 'investment';
    figures = [
      {
        title: saving ? 'Put in, a typical month' : 'In, a typical month',
        figure: money(s?.avg_in_minor),
        note: saving ? 'Transfers and income in' : 'Income and transfers in',
      },
      {
        title: saving ? 'Taken out, a typical month' : 'Out, a typical month',
        figure: money(s?.avg_out_minor),
        note: saving ? 'Withdrawals and spending' : 'Spending and transfers to your other accounts',
      },
    ];
  }

  return (
    <dl className="typical-figures">
      {figures.map((f, i) => (
        <div key={i}>
          <dt className="caption">{f.title}</dt>
          <dd className="typical-figure">{f.figure}</dd>
          <dd className="footnote flush">
            {f.note}, {label}
          </dd>
        </div>
      ))}
    </dl>
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

function WhereItGoes({ account, thisMonth }: { account: AccountBalance; thisMonth: string }) {
  const currency = useCurrency();
  const [period, setPeriod] = useState<Period>(3);
  const [all, setAll] = useState(false);
  const from = addMonths(thisMonth, -period);
  const to = thisMonth;
  const label = rangeLabel({ from, to });
  const outflows = useAccountOutflows(account.account_id, from, to);
  const lines = outflows.data ?? [];
  const total = lines[0]?.total_out_minor ?? 0;
  const largest = Math.max(1, ...lines.map((l) => l.out_minor));
  const shown = all ? lines : lines.slice(0, TOP_OUTFLOWS);
  const hidden = lines.length - shown.length;

  return (
    <section className="group stack-tight" aria-labelledby="account-goes">
      <div className="card-head account-goes-head">
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
        <div className="segmented" role="radiogroup" aria-label="Where it goes, over">
          {PERIODS.map((n) => (
            <label key={n}>
              <input type="radio" name="account-goes-period" value={n} checked={period === n} onChange={() => setPeriod(n)} />
              {n} months
            </label>
          ))}
        </div>
      </div>
      {outflows.isError ? (
        <Notice tone="err">{dataErrorMessage(outflows.error)}</Notice>
      ) : !outflows.data ? (
        <p className="footnote flush">Loading…</p>
      ) : lines.length === 0 ? (
        <p className="secondary flush">Nothing went out of this account in {label}.</p>
      ) : (
        <>
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
                {shown.map((line) => (
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
          {(hidden > 0 || all) && lines.length > TOP_OUTFLOWS && (
            <p className="flush">
              <button type="button" className="btn btn-plain show-more" aria-expanded={all} onClick={() => setAll((v) => !v)}>
                {all ? 'Show the top 6 only' : `Show ${hidden} more`}
              </button>
            </p>
          )}
        </>
      )}
      <p className="footnote flush">
        Transfers move money to your own accounts.
        {!account.is_liability && ' Card purchases are counted on the card, not here.'}
      </p>
    </section>
  );
}

// The account's own activity: every kind together, or one at a time, with a
// quick-add row on top. On All the row asks which kind it is adding.
function AccountActivity({ account, today }: { account: AccountBalance; today: string }) {
  const [kind, setKind] = useState<TabKind>('all');
  const [adding, setAdding] = useState<TxnKind>('expense');
  const addKind = kind === 'all' ? adding : kind;

  return (
    <section className="stack" aria-labelledby="account-activity">
      <SectionHead
        id="account-activity"
        title="Activity"
        link={{
          to: activityPath({ accountId: account.account_id, ...(kind === 'all' ? {} : { kind }) }),
          label: 'See all in Activity',
        }}
      />
      <KindTabs<TabKind>
        label="Activity by kind"
        value={kind}
        onChange={setKind}
        tabs={[{ kind: 'all' }, ...KIND_ORDER.map((k) => ({ kind: k }))]}
      >
        {/* On All, what to add is the first field of the add row, kept
            outside the form so switching it keeps its focus while the form
            starts afresh for the new kind. */}
        <div className={kind === 'all' ? 'quick-add-row with-kind' : 'quick-add-row'}>
          {kind === 'all' && (
            <Select
              className="quick-kind"
              label="What to add"
              value={adding}
              onChange={(next) => setAdding(next as TxnKind)}
              options={[
                { value: 'expense', label: 'Expense' },
                { value: 'income', label: 'Income' },
                { value: 'transfer', label: 'Transfer' },
              ]}
            />
          )}
          <QuickAdd key={`${account.account_id}-${addKind}`} scope={{ kind: addKind, accountId: account.account_id, defaultDate: today }} />
        </div>
        <LedgerTable accountId={account.account_id} kind={kind} />
      </KindTabs>
    </section>
  );
}

function LedgerTable({ accountId, kind }: { accountId: string; kind: TabKind }) {
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
  const what = kind === 'all' ? 'Transactions' : KIND_LABEL[kind];

  return (
    <>
      <ActivityRows
        rows={rows}
        showBalance
        caption={`${what} on this account, newest first, with the balance after each`}
        empty={`No ${what.toLowerCase()} on this account yet. Add one above.`}
      />
      {ledger.data.total > rows.length && (
        <p className="footnote flush activity-more">
          Showing the latest {rows.length} of {ledger.data.total}.{' '}
          <Link to={activityPath({ accountId, ...(kind === 'all' ? {} : { kind }) })}>See the rest in Activity</Link>
        </p>
      )}
    </>
  );
}
