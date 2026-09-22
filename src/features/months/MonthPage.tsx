import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { ChevronLeft, ChevronRight } from 'lucide-react';
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
import { Amount } from '../../ui/Amount';
import { DetailHeader, DetailNotFound, Facet, Facets, FigureRow, KeyFigure, SectionHead } from '../../ui/Detail';
import { Notice } from '../../ui/Notice';
import { dataErrorMessage } from '../auth/errors';
import { useAccounts } from '../accounts/queries';
import { useBills } from '../bills/queries';
import { useCategories, useCategoryMonthTotals } from '../categories/queries';
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
import { useMonthAccounts, useMonthSummary } from './queries';

// One calendar month as a page. A month is a range over transactions, never a
// row of its own: the "This Month" and "Last month" flags a spreadsheet needs
// are exactly what this page makes unnecessary.
export function MonthPage() {
  const { month: param } = useParams();
  const month = monthFromParam(param);
  if (!month) return <DetailNotFound what="month" back={{ to: '/reports', label: 'Reports' }} />;
  return <MonthDetail key={month} month={month} />;
}

function MonthDetail({ month }: { month: string }) {
  const currency = useCurrency();
  const profile = useProfile();
  const thisMonth = monthStartInZone(profile.data?.timezone);
  const today = todayInZone(profile.data?.timezone);
  const range = monthRange(month);
  const summary = useMonthSummary(month);
  const categories = useCategories();
  const catTotals = useCategoryMonthTotals(month, month);
  const accountRows = useMonthAccounts(month);
  const accounts = useAccounts();
  const bills = useBills();
  const largest = useLargestExpense(range.from, range.to);
  const [kind, setKind] = useState<TxnKind>('expense');

  const s = summary.data;
  const catName = useMemo(() => new Map((categories.data ?? []).map((c) => [c.id, c.name])), [categories.data]);
  const accName = useMemo(() => new Map((accounts.data ?? []).map((a) => [a.account_id, a.name])), [accounts.data]);
  const spending = (catTotals.data ?? [])
    .filter((c) => c.kind === 'expense')
    .sort((a, b) => b.total_minor - a.total_minor);
  const spendMax = Math.max(1, ...spending.map((c) => c.total_minor));
  const active = (accountRows.data ?? []).filter(
    (a) => a.income_minor + a.expense_minor + a.transfer_in_minor + a.transfer_out_minor > 0,
  );
  // Bills whose next date falls in this month; paid ones show in the activity.
  const due = (bills.data ?? []).filter((b) => !b.archived_at && b.next_due_on >= range.from && b.next_due_on <= range.to);
  const isCurrent = month === thisMonth;
  const defaultDate = isCurrent ? today : month < thisMonth ? range.to : range.from;

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
        subtitle={
          <>
            {s ? `${s.income_count + s.expense_count + s.transfer_count} transactions` : 'Loading…'}
            {isCurrent && ' · The month you are in, in your time zone'}
          </>
        }
        actions={<Link to={budgetMonthPath(month)}>Budgets for this month</Link>}
      />

      {summary.isError && <Notice tone="err">{dataErrorMessage(summary.error)}</Notice>}

      <FigureRow>
        <KeyFigure
          label="Net this month"
          footnote={
            s && (
              <>
                <Amount minor={s.income_minor} currency={currency} /> in · <Amount minor={s.expense_minor} currency={currency} /> out ·
                transfers left out
              </>
            )
          }
        >
          <Amount minor={s?.net_minor ?? 0} currency={currency} />
        </KeyFigure>
        <Facets label="This month">
          <Facet label="Moved into goals">
            <Amount minor={s?.to_goals_minor ?? 0} currency={currency} />
          </Facet>
          <Facet
            label="Largest expense"
            note={largest.data ? `${largest.data.description}, ${formatDateShort(largest.data.occurred_on)}` : undefined}
          >
            {largest.data ? <Amount minor={largest.data.amount_minor} currency={currency} /> : '—'}
          </Facet>
        </Facets>
      </FigureRow>

      <section className="group stack-tight" aria-labelledby="month-where">
        <h2 className="headline" id="month-where">
          Where it went
        </h2>
        {catTotals.isError && <Notice tone="err">{dataErrorMessage(catTotals.error)}</Notice>}
        {catTotals.data && spending.length === 0 && <p className="secondary flush">No categorized spending this month.</p>}
        <ul className="bar-list">
          {spending.map((c) => (
            <li key={c.category_id}>
              <div className="bar-list-row">
                <Link to={categoryPath(c.category_id)}>{catName.get(c.category_id) ?? 'Category'}</Link>
                <Amount minor={c.total_minor} currency={currency} />
              </div>
              <div className="bar-track" role="presentation">
                <i style={{ width: `${Math.max(2, Math.round((c.total_minor / spendMax) * 100))}%` }} />
              </div>
            </li>
          ))}
        </ul>
        {s && spending.length > 0 && s.expense_minor > spending.reduce((sum, c) => sum + c.total_minor, 0) && (
          <p className="footnote flush">The rest was spent without a category.</p>
        )}
      </section>

      <div className="detail-pair">
        <section className="group stack-tight" aria-labelledby="month-accounts">
          <h2 className="headline" id="month-accounts">
            By account
          </h2>
          {active.length === 0 ? (
            <p className="secondary flush">No account moved this month.</p>
          ) : (
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
                      <Link to={accountPath(a.account_id)}>{accName.get(a.account_id) ?? 'Account'}</Link>
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
          )}
        </section>

        <section className="group stack-tight" aria-labelledby="month-bills">
          <h2 className="headline" id="month-bills">
            Bills due this month
          </h2>
          {due.length === 0 ? (
            <p className="secondary flush">Nothing else falls due this month.</p>
          ) : (
            <ul className="mini-list">
              {due.map((b) => (
                <li key={b.id}>
                  <Link to={billPath(b.id)}>{b.name}</Link>
                  <span className="secondary">Due {formatDateShort(b.next_due_on)}</span>
                  <Amount minor={b.amount_minor} currency={currency} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

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
