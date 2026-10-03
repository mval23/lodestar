import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { ChevronLeft, ChevronRight, Circle, CircleCheck } from 'lucide-react';
import { useCurrency, useProfile } from '../../lib/profile';
import { addMonths, formatDateShort, formatMonth, monthStartInZone, todayInZone } from '../../lib/dates';
import {
  accountPath,
  activityPath,
  billPath,
  budgetMonthPath,
  categoryPath,
  monthFromParam,
  monthPath,
  monthRange,
} from '../../lib/routes';
import { monthFindings } from '../../lib/standsOut';
import { Amount } from '../../ui/Amount';
import { Comparison } from '../../ui/Comparison';
import { DetailHeader, DetailNotFound, SectionHead } from '../../ui/Detail';
import { Notice } from '../../ui/Notice';
import { RunningTotalChart } from '../../ui/RunningTotalChart';
import { SplitBars, type SplitRow } from '../../ui/SplitBar';
import { StandsOut } from '../../ui/StandsOut';
import { dataErrorMessage } from '../auth/errors';
import { useAccounts } from '../accounts/queries';
import { useBills } from '../bills/queries';
import { useCategories } from '../categories/queries';
import { useMonthToDate } from '../overview/queries';
import {
  ActivityRows,
  KIND_LABEL,
  KIND_ORDER,
  KindTabs,
  QuickAdd,
  describeTransaction,
  signedAmount,
  type ActivityRow,
} from '../transactions/DetailActivity';
import { DEFAULT_FILTERS, useLargestExpense, useTransactions, type TxnKind } from '../transactions/queries';
import {
  useDailySpending,
  useMonthAccounts,
  useMonthBillPayments,
  useMonthCategories,
  useMonthSummary,
  type MonthCategory,
} from './queries';

// One calendar month as a dashboard: how it is going against a typical
// month, where the money went and came from, and which bills are paid. A
// month is a range over transactions, never a row of its own: the "This
// Month" and "Last month" flags a spreadsheet needs are exactly what this
// page makes unnecessary. Every sum and average comes from the database.
export function MonthPage() {
  const { month: param } = useParams();
  const month = monthFromParam(param);
  if (!month) return <DetailNotFound what="month" back={{ to: '/reports', label: 'Reports' }} />;
  return <MonthDetail key={month} month={month} />;
}

// A no-break space and a word joiner keep "Sep 1–24" on one line.
const span = (month: string, day: number) => `${formatMonth(month).slice(0, 3)}\u00a01–\u2060${day}`;

function MonthDetail({ month }: { month: string }) {
  const currency = useCurrency();
  const profile = useProfile();
  const thisMonth = monthStartInZone(profile.data?.timezone);
  const today = todayInZone(profile.data?.timezone);
  const range = monthRange(month);
  const summary = useMonthSummary(month);
  const soFar = useMonthToDate(month);
  const daily = useDailySpending(month);
  const byCategory = useMonthCategories(month);
  const categories = useCategories();
  const accountRows = useMonthAccounts(month);
  const accounts = useAccounts();
  const largest = useLargestExpense(range.from, range.to);
  const [kind, setKind] = useState<TxnKind>('expense');

  const s = summary.data;
  const mtd = soFar.data ?? null;
  const catName = useMemo(() => new Map((categories.data ?? []).map((c) => [c.id, c.name])), [categories.data]);
  const accName = useMemo(() => new Map((accounts.data ?? []).map((a) => [a.account_id, a.name])), [accounts.data]);
  const isCurrent = month === thisMonth;
  const isFuture = month > thisMonth;
  const inProgress = isCurrent && mtd !== null && mtd.day_of_month < mtd.days_in_month;
  const defaultDate = isCurrent ? today : month < thisMonth ? range.to : range.from;
  const comparable = mtd !== null && mtd.typical_months > 0;
  const against = mtd ? (inProgress ? `vs a typical ${span(month, mtd.day_of_month)}` : `vs a typical ${formatMonth(month).split(' ')[0]}`) : '';
  const nameOf = (c: MonthCategory) => (c.category_id ? (catName.get(c.category_id) ?? 'Category') : 'Uncategorized');
  const error = summary.error ?? soFar.error ?? daily.error ?? byCategory.error;

  const subtitle = isFuture
    ? 'Not begun yet'
    : inProgress && mtd
      ? `${span(month, mtd.day_of_month)} so far · ${mtd.days_in_month - mtd.day_of_month} ${mtd.days_in_month - mtd.day_of_month === 1 ? 'day' : 'days'} left`
      : s
        ? `${s.income_count + s.expense_count + s.transfer_count} transactions`
        : 'Loading…';

  return (
    <div className="page">
      <DetailHeader
        back={{ to: '/reports', label: 'Reports' }}
        title={formatMonth(month)}
        titleExtra={
          <nav className="month-nav" aria-label="Month">
            <Link className="btn btn-secondary" to={monthPath(addMonths(month, -1))} aria-label={`Previous month, ${formatMonth(addMonths(month, -1))}`}>
              <ChevronLeft strokeWidth={1.75} aria-hidden />
            </Link>
            <Link className="btn btn-secondary" to={monthPath(addMonths(month, 1))} aria-label={`Next month, ${formatMonth(addMonths(month, 1))}`}>
              <ChevronRight strokeWidth={1.75} aria-hidden />
            </Link>
          </nav>
        }
        subtitle={subtitle}
        actions={<Link to={budgetMonthPath(month)}>Budgets for this month</Link>}
      />

      {error && <Notice tone="err">{dataErrorMessage(error)}</Notice>}

      {mtd && byCategory.data && (
        <StandsOut
          currency={currency}
          findings={monthFindings(
            mtd,
            byCategory.data.map((c) => ({ name: nameOf(c), spent_minor: c.spent_minor, typical_minor: c.typical_minor })),
            against.replace(/^vs /, ''),
            inProgress,
          )}
        />
      )}

      <section className="group fig-band fig-band-5" aria-label="This month">
        <div className="fig-cell">
          <h2 className="caption">{inProgress ? 'Net so far' : 'Net'}</h2>
          {mtd ? (
            <>
              <p className="fig flush">
                <span className="bracket">
                  <Amount minor={mtd.money_in_minor - mtd.money_out_minor} currency={currency} signed />
                </span>
              </p>
              <p className="footnote flush">
                {comparable ? (
                  <Comparison
                    delta={mtd.money_in_minor - mtd.money_out_minor - (mtd.typical_in_minor - mtd.typical_out_minor)}
                    currency={currency}
                    against={against}
                  />
                ) : (
                  'No earlier months to compare yet'
                )}
              </p>
            </>
          ) : (
            <p className="footnote flush">Loading…</p>
          )}
        </div>
        {(
          [
            ['Money in', 'money_in_minor', 'typical_in_minor'],
            ['Money out', 'money_out_minor', 'typical_out_minor'],
            ['Into goals', 'to_goals_minor', 'typical_to_goals_minor'],
          ] as const
        ).map(([label, key, typical]) => (
          <div className="fig-cell" key={label}>
            <h2 className="caption">{label}</h2>
            {mtd ? (
              <>
                <p className="card-figure flush">
                  <Amount minor={mtd[key]} currency={currency} />
                </p>
                <p className="footnote flush">
                  {comparable ? <Comparison delta={mtd[key] - mtd[typical]} currency={currency} against={against} /> : '—'}
                </p>
              </>
            ) : (
              <p className="footnote flush">Loading…</p>
            )}
          </div>
        ))}
        <div className="fig-cell">
          <h2 className="caption">Largest expense</h2>
          {largest.data ? (
            <>
              <p className="card-figure flush month-largest">{largest.data.description}</p>
              <p className="footnote flush">
                <Amount minor={largest.data.amount_minor} currency={currency} /> · {formatDateShort(largest.data.occurred_on)}
              </p>
            </>
          ) : (
            <p className="footnote flush">{largest.isPending ? 'Loading…' : largest.isError ? '—' : 'Nothing spent'}</p>
          )}
        </div>
      </section>

      <div className="report-pair wide-left">
        <div className="stack">
          {daily.data && (
            <RunningTotalChart
              title="How the month is going"
              caption={
                comparable
                  ? `Spending added up day by day, against the pace of a typical month (${mtd?.typical_months === 1 ? 'the month before' : `the ${mtd?.typical_months} months before`}).`
                  : 'Spending added up day by day.'
              }
              days={daily.data}
              currency={currency}
              valueLabel={formatMonth(month)}
              typicalLabel="Typical month"
              showTypical={comparable}
            />
          )}
          {mtd && <MoneyInWent moneyIn={mtd.money_in_minor} spent={mtd.money_out_minor} goals={mtd.to_goals_minor} />}
        </div>

        <div className="stack">
          <section className="group stack-tight" aria-labelledby="month-where">
            <div>
              <h2 className="headline" id="month-where">
                Where it went
              </h2>
              <p className="footnote flush">
                {inProgress && mtd ? `${span(month, mtd.day_of_month)}` : formatMonth(month)}
                {comparable && ` · change ${against}`}
              </p>
            </div>
            {byCategory.data && byCategory.data.length === 0 && <p className="secondary flush">Nothing spent this month.</p>}
            {byCategory.data && byCategory.data.length > 0 && (
              <CategoryTable rows={byCategory.data} nameOf={nameOf} comparable={comparable} />
            )}
          </section>
          <BillsThisMonth month={month} today={today} />
        </div>
      </div>

      <section className="group stack-tight" aria-labelledby="month-accounts">
        <h2 className="headline" id="month-accounts">
          By account
        </h2>
        <AccountTable month={month} rows={accountRows.data} names={accName} />
      </section>

      <section className="stack" aria-labelledby="month-activity">
        <SectionHead
          id="month-activity"
          title="The month’s activity"
          link={{ to: activityPath({ kind, from: range.from, to: range.to }), label: 'See all in Activity' }}
        />
        <KindTabs
          label="The month’s activity by kind"
          value={kind}
          onChange={setKind}
          tabs={KIND_ORDER.map((k) => ({
            kind: k,
            count: s ? (k === 'income' ? s.income_count : k === 'expense' ? s.expense_count : s.transfer_count) : 0,
            summary: (
              <Amount
                minor={s ? (k === 'income' ? s.income_minor : k === 'expense' ? s.expense_minor : s.transfer_minor) : 0}
                currency={currency}
              />
            ),
          }))}
        >
          <QuickAdd key={`${month}-${kind}`} scope={{ kind, defaultDate }} />
          <MonthRows kind={kind} from={range.from} to={range.to} catName={catName} accName={accName} />
        </KindTabs>
      </section>
    </div>
  );
}

// What went out against what came in: spent and into goals above, money in
// below, and the difference either kept or drawn from balances.
function MoneyInWent({ moneyIn, spent, goals }: { moneyIn: number; spent: number; goals: number }) {
  const currency = useCurrency();
  if (moneyIn === 0 && spent === 0 && goals === 0) return null;
  const out = spent + goals;
  const rows: SplitRow[] = [
    {
      label: 'Where it went',
      parts: [
        { label: 'Spent', minor: spent, tone: 'out' },
        { label: 'Into goals', minor: goals, tone: 'in' },
        ...(moneyIn > out ? [{ label: 'Kept', minor: moneyIn - out, tone: 'base' as const }] : []),
      ],
    },
    {
      label: 'What came in',
      parts: [
        { label: 'Money in', minor: moneyIn, tone: 'base' },
        ...(out > moneyIn ? [{ label: 'From balances', minor: out - moneyIn, tone: 'short' as const }] : []),
      ],
    },
  ];
  return (
    <section className="group stack-tight" aria-labelledby="month-in-went">
      <div>
        <h2 className="headline" id="month-in-went">
          Where the money in went
        </h2>
        <p className="footnote flush">
          {out > moneyIn
            ? 'More went out than came in; the rest came from what your accounts already held.'
            : 'Spending and goals, against what came in.'}
        </p>
      </div>
      <SplitBars rows={rows} currency={currency} label="Where the money in went" />
    </section>
  );
}

function CategoryTable({
  rows,
  nameOf,
  comparable,
}: {
  rows: MonthCategory[];
  nameOf: (row: MonthCategory) => string;
  comparable: boolean;
}) {
  const currency = useCurrency();
  const shown = rows.filter((r) => r.spent_minor > 0 || r.typical_minor > 0);
  const largest = Math.max(1, ...shown.map((r) => r.spent_minor));
  return (
    <table className="ledger compact month-categories">
      <thead>
        <tr>
          <th scope="col">Category</th>
          <th scope="col">
            <span className="visually-hidden">Share</span>
          </th>
          <th scope="col" className="num">
            Spent
          </th>
          {comparable && (
            <th scope="col" className="num">
              vs typical
            </th>
          )}
        </tr>
      </thead>
      <tbody>
        {shown.map((row) => (
          <tr key={row.category_id ?? 'none'}>
            <th scope="row">
              {row.category_id ? <Link to={categoryPath(row.category_id)}>{nameOf(row)}</Link> : nameOf(row)}
            </th>
            <td className="month-cat-bar" aria-hidden="true">
              <span className="bar-track">
                <i style={{ width: `${row.spent_minor > 0 ? Math.max(2, Math.round((row.spent_minor / largest) * 100)) : 0}%` }} />
              </span>
            </td>
            <td className="num">
              <Amount minor={row.spent_minor} currency={currency} />
            </td>
            {comparable && (
              <td className="num secondary">
                <Amount minor={row.spent_minor - row.typical_minor} currency={currency} signed />
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// The month's bills and subscriptions: paid ones ticked with the date they
// were paid, the ones still due this month open.
function BillsThisMonth({ month, today }: { month: string; today: string }) {
  const currency = useCurrency();
  const bills = useBills();
  const payments = useMonthBillPayments(month);
  const range = monthRange(month);
  const paidBy = new Map((payments.data ?? []).map((p) => [p.recurring_item_id, p]));
  const lines = (bills.data ?? [])
    .filter((b) => !b.archived_at && b.kind === 'expense')
    .flatMap((b) => {
      const paid = paidBy.get(b.id);
      if (paid) return [{ bill: b, paid: true, on: paid.last_paid_on, minor: paid.paid_minor }];
      if (b.next_due_on >= range.from && b.next_due_on <= range.to)
        return [{ bill: b, paid: false, on: b.next_due_on, minor: b.amount_minor }];
      return [];
    })
    .sort((a, b) => a.on.localeCompare(b.on));
  const paidCount = lines.filter((l) => l.paid).length;
  const due = lines.filter((l) => !l.paid);
  const nextLater = (bills.data ?? [])
    .filter((b) => !b.archived_at && b.kind === 'expense' && b.next_due_on > range.to)
    .map((b) => b.next_due_on)
    .sort()[0];

  return (
    <section className="group stack-tight" aria-labelledby="month-bills">
      <h2 className="headline" id="month-bills">
        Bills this month
      </h2>
      {payments.isError && <Notice tone="err">{dataErrorMessage(payments.error)}</Notice>}
      {lines.length === 0 ? (
        <p className="secondary flush">No bills paid or due this month.</p>
      ) : (
        <>
          <ul className="bill-checklist">
            {lines.map((line) => (
              <li key={line.bill.id} className={line.paid ? 'paid' : undefined}>
                {line.paid ? <CircleCheck strokeWidth={1.75} aria-hidden /> : <Circle strokeWidth={1.75} aria-hidden />}
                <Link to={billPath(line.bill.id)}>{line.bill.name}</Link>
                <span className="secondary">
                  {line.paid ? 'Paid' : line.on < today ? 'Was due' : 'Due'} {formatDateShort(line.on)}
                </span>
                <Amount minor={line.minor} currency={currency} />
              </li>
            ))}
          </ul>
          <p className="footnote flush">
            {due.length === 0
              ? `All ${paidCount} paid${nextLater ? ` · nothing else due until ${formatDateShort(nextLater)}` : ''}`
              : `${paidCount} of ${lines.length} paid · ${due.length} still due`}
          </p>
        </>
      )}
    </section>
  );
}

function AccountTable({
  month,
  rows,
  names,
}: {
  month: string;
  rows: ReturnType<typeof useMonthAccounts>['data'];
  names: Map<string, string>;
}) {
  const currency = useCurrency();
  const active = (rows ?? []).filter((a) => a.income_minor + a.expense_minor + a.transfer_in_minor + a.transfer_out_minor > 0);
  if (rows && active.length === 0) return <p className="secondary flush">No account moved in {formatMonth(month)}.</p>;
  return (
    <table className="ledger compact">
      <thead>
        <tr>
          <th scope="col">Account</th>
          <th scope="col" className="num">
            In
          </th>
          <th scope="col" className="num">
            Out
          </th>
        </tr>
      </thead>
      <tbody>
        {active.map((a) => (
          <tr key={a.account_id}>
            <th scope="row">
              <Link to={accountPath(a.account_id)}>{names.get(a.account_id) ?? 'Account'}</Link>
            </th>
            <td className="num">
              <Amount minor={a.income_minor + a.transfer_in_minor} currency={currency} />
            </td>
            <td className="num">
              <Amount minor={a.expense_minor + a.transfer_out_minor} currency={currency} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function MonthRows({
  kind,
  from,
  to,
  catName,
  accName,
}: {
  kind: TxnKind;
  from: string;
  to: string;
  catName: Map<string, string>;
  accName: Map<string, string>;
}) {
  const page = useTransactions({ ...DEFAULT_FILTERS, kind, from, to });
  if (page.isError) return <Notice tone="err">{dataErrorMessage(page.error)}</Notice>;
  if (!page.data || page.isPlaceholderData) return <p className="activity-empty secondary">Loading…</p>;

  const rows: ActivityRow[] = page.data.rows.map((row) => ({
    id: row.id,
    occurred_on: row.occurred_on,
    description: row.description,
    detail: describeTransaction(
      row,
      (id) => accName.get(id ?? '') ?? '—',
      (id) => (id ? (catName.get(id) ?? null) : null),
    ),
    // From the month's side a transfer only moved, so it carries no sign.
    amount: row.kind === 'transfer' ? row.amount_minor : signedAmount(row),
    signed: row.kind === 'income',
    kind: row.kind,
    category_id: row.kind === 'transfer' ? undefined : row.category_id,
  }));

  return (
    <>
      <ActivityRows
        rows={rows}
        caption={`${KIND_LABEL[kind]} this month, newest first`}
        empty={`No ${KIND_LABEL[kind].toLowerCase()} this month. Add one above.`}
      />
      {page.data.total > rows.length && (
        <p className="footnote flush activity-more">
          Showing the latest {rows.length} of {page.data.total}.{' '}
          <Link to={activityPath({ kind, from, to })}>See the rest in Activity</Link>
        </p>
      )}
    </>
  );
}
