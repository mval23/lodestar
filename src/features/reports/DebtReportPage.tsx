import { Link } from 'react-router';
import { useCurrency } from '../../lib/profile';
import { addMonths, formatMonth } from '../../lib/dates';
import { share } from '../../lib/percent';
import { accountPath } from '../../lib/routes';
import { debtFindings } from '../../lib/standsOut';
import { Amount } from '../../ui/Amount';
import { Notice } from '../../ui/Notice';
import { PaceCapsule } from '../../ui/PaceCapsule';
import { StackedMonthBars, type StackTone } from '../../ui/StackedMonthBars';
import { dataErrorMessage } from '../auth/errors';
import { monthsBetween, rangeLabel } from './filters';
import { useAccountMonthFlows, useDebtSummary, type DebtLine } from './queries';
import { ReportClosing, ReportHead, monthEnd, useReportRange } from './ReportParts';

// Debt repayment: what cards and loans owed at each month end, drawn below
// zero, what was paid into each, and when a loan would be cleared at its
// recent payment. Debts stay negative everywhere. Interest is not separated
// from payments, so the payoff month is an estimate, and says so.

const TONES: StackTone[] = ['ink', 'fixed', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7'];

export function DebtReportPage() {
  const currency = useCurrency();
  const report = useReportRange();
  const { range } = report;
  const debts = useDebtSummary(range.from, range.to);
  const months = Array.from({ length: monthsBetween(range.from, range.to) }, (_, i) => addMonths(range.from, i));
  const flows = useAccountMonthFlows(range.from, addMonths(range.to, -1));

  const rows = debts.data ?? [];
  const first = rows[0];
  const ids = new Set(rows.map((d) => d.account_id));
  const flowRows = (flows.data ?? []).filter((f) => ids.has(f.account_id));
  const tone = new Map(rows.map((d, i) => [d.account_id, TONES[i % TONES.length]!]));
  const series = (pick: (f: (typeof flowRows)[number]) => number) =>
    rows.map((d) => ({
      key: d.account_id,
      label: d.name,
      tone: tone.get(d.account_id)!,
      values: new Map(flowRows.filter((f) => f.account_id === d.account_id).map((f) => [f.month, pick(f)])),
    }));
  // What is reduced is the owed balance coming up towards zero.
  const reduced = first ? first.total_end_minor - first.total_start_minor : 0;
  const loans = rows.filter((d) => d.type === 'loan' && d.balance_minor < 0);
  // The loan cleared last, at its recent payment.
  const lastPayoff = [...loans].filter((d) => d.payoff_month).sort((a, b) => b.payoff_month!.localeCompare(a.payoff_month!))[0] ?? null;
  const error = debts.error ?? flows.error;

  return (
    <div className="page">
      <ReportHead
        back={report.search}
        title="Debt repayment"
        showScope={false}
        subtitle={`${rangeLabel(range)} · complete months · every card and loan`}
      />

      {error && <Notice tone="err">{dataErrorMessage(error)}</Notice>}
      {!debts.data && !error && <p className="secondary">Working out your figures…</p>}
      {debts.data && rows.length === 0 && <p className="secondary">No cards or loans. Nothing is owed.</p>}

      {debts.data && first && (
        <>
          <section className="group fig-band" aria-label="Debt">
            <div className="fig-cell">
              <h2 className="caption">Debt balance, {monthEnd(addMonths(range.to, -1))}</h2>
              <p className="fig flush">
                <span className="bracket">
                  <Amount minor={first.total_end_minor} currency={currency} />
                </span>
              </p>
              <p className="footnote flush">
                <Amount minor={first.total_start_minor} currency={currency} /> at {monthEnd(addMonths(range.from, -1))}
              </p>
            </div>
            <div className="fig-cell">
              <h2 className="caption">{reduced >= 0 ? 'Debt reduced by' : 'Debt grew by'}</h2>
              <p className="card-figure flush">
                <Amount minor={Math.abs(reduced)} currency={currency} />
              </p>
              <p className="footnote flush">Change in what’s owed, {months.length} months</p>
            </div>
            <div className="fig-cell">
              <h2 className="caption">Paid to debt</h2>
              <p className="card-figure flush">
                <Amount minor={first.total_paid_minor} currency={currency} />
              </p>
              <p className="footnote flush">
                Across {rows.length} {rows.length === 1 ? 'card or loan' : 'cards and loans'}
              </p>
            </div>
            <div className="fig-cell">
              <h2 className="caption">
                {lastPayoff ? `${lastPayoff.name} paid off` : 'Paid off'} <span className="estimate-tag">Estimate</span>
              </h2>
              <p className="card-figure flush">{lastPayoff?.payoff_month ? formatMonth(lastPayoff.payoff_month) : '—'}</p>
              <p className="footnote flush">
                {lastPayoff
                  ? `${lastPayoff.payments_left} more ${lastPayoff.payments_left === 1 ? 'payment' : 'payments'} at the recent amount`
                  : loans.length > 0
                    ? 'No recent payments to estimate from'
                    : 'No loans owed'}
              </p>
            </div>
          </section>

          <div className="report-pair wide-left">
            <StackedMonthBars
              title="Owed at the end of each month"
              caption="Debts are negative balances, drawn below zero."
              months={months}
              series={series((f) => Math.max(0, -f.closing_balance_minor))}
              currency={currency}
              currentMonth={months[months.length - 1] ?? ''}
              direction="down"
            />
            <div className="stack">
              <section className="group stack-tight" aria-labelledby="debt-accounts">
                <h2 className="headline" id="debt-accounts">
                  By account
                </h2>
                <ul className="savings-goals">
                  {rows.map((d) => (
                    <DebtRow key={d.account_id} debt={d} />
                  ))}
                </ul>
              </section>
              <StackedMonthBars
                title="Paid to debt each month"
                months={months}
                series={series((f) => f.transfer_in_minor)}
                currency={currency}
                currentMonth={months[months.length - 1] ?? ''}
              />
            </div>
          </div>

          <ReportClosing
            currency={currency}
            findings={debtFindings(
              reduced,
              rows,
              lastPayoff?.payoff_month ? { name: lastPayoff.name, recent_minor: lastPayoff.recent_payment_minor, month: formatMonth(lastPayoff.payoff_month) } : null,
              months.length,
            )}
            about={[
              'Each loan payment lowers the balance in full; interest isn’t separated.',
              'So the balance and the payoff month may differ from the lender’s figures.',
              'Card purchases count as spending when made; paying the card is a transfer.',
            ]}
          />
        </>
      )}
    </div>
  );
}

function DebtRow({ debt }: { debt: DebtLine }) {
  const currency = useCurrency();
  const owedAtStart = -debt.start_minor;
  const repaid = owedAtStart > 0 ? Math.max(0, debt.end_minor - debt.start_minor) : 0;
  return (
    <li>
      <div className="savings-goal-head">
        <span>
          <Link to={accountPath(debt.account_id)}>{debt.name}</Link>
          <small> {debt.type === 'loan' ? 'loan' : 'credit card'}</small>
        </span>
        <strong className="num">
          <Amount minor={debt.balance_minor} currency={currency} />
        </strong>
      </div>
      {debt.type === 'loan' ? (
        <>
          {owedAtStart > 0 && <PaceCapsule spent={repaid} planned={owedAtStart} tone="save" />}
          <p className="footnote flush">
            {owedAtStart > 0 ? `${share(repaid, owedAtStart)} repaid this period` : 'Nothing owed when the period began'}
            {debt.payoff_month && (
              <>
                {' · '}
                <span className="estimate-tag">Estimate</span> paid off {formatMonth(debt.payoff_month)}
              </>
            )}
          </p>
        </>
      ) : (
        <p className="footnote flush">
          {debt.months_with_purchases === 0
            ? 'No purchases this period'
            : debt.months_paid_full === debt.months_with_purchases
              ? 'Paid in full every month · no balance carried'
              : `Paid in full ${debt.months_paid_full} of ${debt.months_with_purchases} months`}
        </p>
      )}
    </li>
  );
}
