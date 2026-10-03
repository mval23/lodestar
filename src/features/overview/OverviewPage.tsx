import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { ArrowDownUp, CalendarClock, ChevronRight, Flag, type LucideIcon } from 'lucide-react';
import { useCurrency, useProfile, useUpdateProfile } from '../../lib/profile';
import { CURRENCIES, type Currency } from '../../lib/money';
import { formatDate, monthStartInZone, todayInZone } from '../../lib/dates';
import { Button } from '../../ui/Button';
import { SectionHead } from '../../ui/Detail';
import { Notice } from '../../ui/Notice';
import { dataErrorMessage } from '../auth/errors';
import { AccountSheet } from '../accounts/AccountSheet';
import { useAccounts } from '../accounts/queries';
import { TransactionSheet } from '../transactions/TransactionSheet';
import { GoalsGroup, BudgetsGroup, OverviewStandsOut, ThisMonthBand, WhereYouStand } from './Dashboard';
import { hasSeenTour, useTour } from '../tour/Tour';
import { navTarget } from '../tour/steps';
import { PHONE, useMediaQuery } from '../../lib/media';
import { ComingUp, WideOverview } from './WideOverview';

// Where you stand, in one screen. A wide screen gets WideOverview: what
// stands out, this month in one band, then three columns. A phone gets the
// same parts stacked, with Where you stand and Coming up folded. Every block
// links to the page that explains it.
export function OverviewPage() {
  const notice = (useLocation().state as { notice?: string } | null)?.notice;
  const currency = useCurrency();
  const profile = useProfile();
  const accounts = useAccounts();
  const [accountSheet, setAccountSheet] = useState(false);
  const [txnSheet, setTxnSheet] = useState(false);
  const phone = useMediaQuery(PHONE);

  const today = todayInZone(profile.data?.timezone);
  const thisMonth = monthStartInZone(profile.data?.timezone);
  const rows = accounts.data ?? [];
  const firstRun = accounts.isSuccess && rows.length === 0;

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1 className="large-title">Overview</h1>
          {!firstRun && <p className="footnote flush">{formatDate(today)}</p>}
        </div>
        {!firstRun && !accounts.isPending && (
          <div className="actions">
            <Button data-tour="add-transaction" onClick={() => setTxnSheet(true)}>
              Add transaction
            </Button>
          </div>
        )}
      </header>

      {notice && <Notice tone="ok">{notice}</Notice>}

      {accounts.isError && <Notice tone="err">{dataErrorMessage(accounts.error)}</Notice>}

      {/* Until the accounts land there is no net worth to state. Standing in
          with $0.00 would be the first thing this screen says, and it would
          be wrong. */}
      {accounts.isPending && <p className="secondary">Working out where you stand…</p>}

      {firstRun ? (
        <>
          <FirstRun onAddAccount={() => setAccountSheet(true)} />
          <MoreOnPhone />
        </>
      ) : accounts.isPending ? null : (
        !phone ? (
          <WideOverview accounts={rows} today={today} month={thisMonth} currency={currency} />
        ) : (
          <>
            {/* The same parts as a wide screen, stacked: this month first, and
                the rest folded so the month's figures fit on one screen. */}
            <OverviewStandsOut month={thisMonth} currency={currency} />
            <ThisMonthBand accounts={rows} month={thisMonth} currency={currency} />
            <BudgetsGroup month={thisMonth} currency={currency} />
            <details className="fold">
              <summary className="fold-summary">Where you stand</summary>
              <div className="fold-body">
                <WhereYouStand accounts={rows} month={thisMonth} currency={currency} />
                <GoalsGroup currency={currency} />
              </div>
            </details>
            <details className="fold">
              <summary className="fold-summary">Coming up</summary>
              <div className="fold-body">
                <ComingUp today={today} currency={currency} />
              </div>
            </details>
            <MoreOnPhone />
          </>
        )
      )}

      {accountSheet && <AccountSheet onClose={() => setAccountSheet(false)} />}
      {txnSheet && <TransactionSheet onClose={() => setTxnSheet(false)} />}
    </div>
  );
}

// First run: choose the currency, then add the first account. The choice is
// offered here because it can only be changed until the first transaction.
// The tour starts by itself the first time this browser sees it, and ends
// pointing back at this card; it can be taken again from here or Settings.
function FirstRun({ onAddAccount }: { onAddAccount: () => void }) {
  const profile = useProfile();
  const update = useUpdateProfile();
  const currency = useCurrency();
  const tour = useTour();
  const { start } = tour;

  useEffect(() => {
    if (!hasSeenTour()) start();
  }, [start]);

  const choose = (next: Currency) => {
    if (!profile.data || next === currency) return;
    update.mutate({ id: profile.data.id, changes: { currency: next } });
  };

  return (
    <section className="group stack" data-tour="first-run">
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
        <Button variant="plain" onClick={tour.start}>
          Show me around
        </Button>
      </div>
    </section>
  );
}

// The phone's tab bar has room for five screens. Everything else the sidebar
// offers has to be reachable from somewhere, and the Overview is where
// CLAUDE.md puts it: without this, Goals and Import & export had no way in
// on a phone at all. On a wide screen the sidebar already lists them.
const MORE: { to: string; label: string; hint: string; icon: LucideIcon }[] = [
  { to: '/bills', label: 'Bills', hint: 'Bills and subscriptions, and what’s due next', icon: CalendarClock },
  { to: '/goals', label: 'Goals', hint: 'What you’re saving for, and how close you are', icon: Flag },
  { to: '/import-export', label: 'Import & export', hint: 'Bring in a CSV, or take all your data', icon: ArrowDownUp },
];

function MoreOnPhone() {
  return (
    <nav className="stack-tight mobile-only" aria-labelledby="overview-more">
      <SectionHead id="overview-more" title="More" />
      <ul className="rows-list">
        {MORE.map(({ to, label, hint, icon: Icon }) => (
          <li key={to}>
            <Link className="row-button" to={to} data-tour={navTarget(to)}>
              <Icon className="row-icon" strokeWidth={1.75} aria-hidden />
              <span className="row-label row-grow">
                {label}
                <small>{hint}</small>
              </span>
              <ChevronRight className="row-chevron" strokeWidth={1.75} aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
