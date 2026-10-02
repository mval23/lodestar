import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router';
import { Check } from 'lucide-react';
import { useCurrency, useHasTransactions, useProfile, useUpdateProfile } from '../../lib/profile';
import { CURRENCIES, type Currency } from '../../lib/money';
import { setupPath } from '../../lib/routes';
import { Button } from '../../ui/Button';
import { LogoSymbol } from '../../ui/Logo';
import { Notice } from '../../ui/Notice';
import { AccountsStep, BillsStep, BudgetsStep, CategoriesStep, ExpenseStep, GoalsStep } from './SetupSteps';
import { STEPS, isStepSlug, useSetupProgress, type StepSlug } from './progress';

// A walkthrough for someone new: a welcome, six steps, and a last screen.
// Each step is the same add-sheet the rest of the app uses, framed with what
// it's for. The step is part of the address, so a reload or the back button
// keeps the person where they were.
export function SetupPage() {
  const { step } = useParams();
  if (step === undefined) return <Welcome />;
  if (step === 'done') return <Finished />;
  if (!isStepSlug(step)) return <Navigate to={setupPath()} replace />;
  return <StepPage slug={step} />;
}

function Welcome() {
  // A first run is sent here from the Overview, carrying its notice along.
  const notice = (useLocation().state as { notice?: string } | null)?.notice;
  const progress = useSetupProgress();
  const started = progress.done.accounts;
  const resume = progress.next ?? 'done';

  return (
    <div className="page page-form">
      {notice && <Notice tone="ok">{notice}</Notice>}

      <header className="setup-hero">
        <LogoSymbol size={40} />
        <h1 className="large-title">Welcome to Lodestar</h1>
        <p className="secondary flush">
          Let’s start with where you are today, then set up the rest in a few short steps. Only the first one is
          needed: skip any of the others and come back whenever you’re ready.
        </p>
      </header>

      <CurrencyChoice />

      <section aria-labelledby="setup-outline">
        <h2 className="form-group-title" id="setup-outline">
          What we’ll set up
        </h2>
        <ol className="rows-list setup-outline">
          {STEPS.map((step, index) => (
            <li key={step.slug}>
              <div className="row-button row-static">
                <StepMark index={index} done={progress.done[step.slug]} />
                <span className="row-label row-grow">
                  {step.title}
                  <small>{step.label}</small>
                </span>
                {progress.done[step.slug] && <span className="footnote">Done</span>}
              </div>
            </li>
          ))}
        </ol>
      </section>

      <div className="actions">
        {started ? (
          <>
            <Link className="btn btn-primary" to={setupPath(resume)}>
              Continue setup
            </Link>
            <Link className="btn btn-plain" to="/">
              Go to Overview
            </Link>
          </>
        ) : (
          <Link className="btn btn-primary" to={setupPath('accounts')}>
            Start
          </Link>
        )}
      </div>
    </div>
  );
}

// Every amount uses one currency, and it can change only until the first
// transaction (trigger profiles_currency_lock), so it is asked here, first.
function CurrencyChoice() {
  const profile = useProfile();
  const update = useUpdateProfile();
  const currency = useCurrency();
  const hasTransactions = useHasTransactions();
  const locked = hasTransactions.data !== false;

  const choose = (next: Currency) => {
    if (!profile.data || next === currency) return;
    update.mutate({ id: profile.data.id, changes: { currency: next } });
  };

  return (
    <section>
      <h2 className="form-group-title">Your currency</h2>
      <div className="form-group">
        <div className="form-row">
          <span className="form-label">Currency</span>
          <div className="segmented" role="radiogroup" aria-label="Currency">
            {(Object.keys(CURRENCIES) as Currency[]).map((code) => (
              <label key={code}>
                <input
                  type="radio"
                  name="setup-currency"
                  value={code}
                  checked={currency === code}
                  disabled={locked}
                  onChange={() => choose(code)}
                />
                {code}
              </label>
            ))}
          </div>
        </div>
      </div>
      <p className="form-hint">
        {hasTransactions.data === true
          ? `Every amount is in ${CURRENCIES[currency].label}. It’s fixed now that you have transactions.`
          : `Every account and amount uses ${CURRENCIES[currency].label}, and nothing is ever converted. You can change this until you record your first transaction.`}
      </p>
      {update.isError && <Notice tone="err">That didn’t save. Try again in a moment.</Notice>}
    </section>
  );
}

function StepPage({ slug }: { slug: StepSlug }) {
  const progress = useSetupProgress();
  const navigate = useNavigate();
  const index = STEPS.findIndex((step) => step.slug === slug);
  const step = STEPS[index]!;
  const done = progress.done[slug];
  const previous = index === 0 ? setupPath() : setupPath(STEPS[index - 1]!.slug);
  const next = index === STEPS.length - 1 ? setupPath('done') : setupPath(STEPS[index + 1]!.slug);
  // Everything else hangs off an account, so it is the one step that can't
  // be skipped.
  const required = slug === 'accounts';

  return (
    <div className="page page-form">
      <Stepper current={slug} done={progress.done} />

      <header className="stack-tight">
        <p className="caption flush">
          Step {index + 1} of {STEPS.length}
        </p>
        <h1 className="large-title">{step.title}</h1>
        <p className="secondary flush">{step.lead}</p>
      </header>

      {slug === 'accounts' && <AccountsStep />}
      {slug === 'categories' && <CategoriesStep />}
      {slug === 'bills' && <BillsStep />}
      {slug === 'budgets' && <BudgetsStep />}
      {slug === 'goals' && <GoalsStep />}
      {slug === 'expense' && <ExpenseStep />}

      <footer className="setup-foot">
        <Link className="btn btn-secondary" to={previous}>
          Back
        </Link>
        {done ? (
          <Button onClick={() => navigate(next)}>Continue</Button>
        ) : required ? (
          <p className="footnote flush">Add an account to go on.</p>
        ) : (
          <Link className="btn btn-plain" to={next}>
            Skip for now
          </Link>
        )}
      </footer>
    </div>
  );
}

// The six steps in a row. Each one is a link, so a step can be revisited in
// any order; done steps carry a check, so the state is never colour alone.
function Stepper({ current, done }: { current: StepSlug; done: Record<StepSlug, boolean> }) {
  return (
    <nav aria-label="Setup steps">
      <ol className="setup-steps">
        {STEPS.map((step, index) => {
          const isCurrent = step.slug === current;
          return (
            <li key={step.slug} data-current={isCurrent || undefined}>
              <Link to={setupPath(step.slug)} aria-current={isCurrent ? 'step' : undefined}>
                <StepMark index={index} done={done[step.slug]} current={isCurrent} />
                <span className="setup-step-label">{step.label}</span>
                {done[step.slug] && <span className="visually-hidden">, done</span>}
              </Link>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function StepMark({ index, done, current }: { index: number; done: boolean; current?: boolean }) {
  return (
    <span className="setup-mark" data-done={done || undefined} data-current={current || undefined} aria-hidden>
      {done ? <Check strokeWidth={2.25} /> : index + 1}
    </span>
  );
}

function Finished() {
  const progress = useSetupProgress();
  const skipped = STEPS.filter((step) => !progress.done[step.slug]);

  return (
    <div className="page page-form">
      <header className="setup-hero">
        <LogoSymbol size={40} />
        <h1 className="large-title">You’re set up</h1>
        <p className="secondary flush">
          Know where you stand. Your overview shows your net worth, this month’s plan and what’s due next. Add
          transactions as they happen, or import a CSV from your bank.
        </p>
      </header>

      <section aria-labelledby="setup-summary">
        <h2 className="form-group-title" id="setup-summary">
          {skipped.length === 0 ? 'Every step is done' : `${STEPS.length - skipped.length} of ${STEPS.length} steps done`}
        </h2>
        <ul className="rows-list setup-outline">
          {STEPS.map((step, index) => (
            <li key={step.slug}>
              <Link className="row-button" to={setupPath(step.slug)}>
                <StepMark index={index} done={progress.done[step.slug]} />
                <span className="row-label row-grow">
                  {step.label}
                  <small>{progress.done[step.slug] ? 'Done' : 'Skipped for now'}</small>
                </span>
                {!progress.done[step.slug] && <span className="footnote">Set up</span>}
              </Link>
            </li>
          ))}
        </ul>
        {skipped.length > 0 && (
          <p className="form-hint">
            Anything skipped can be set up later from its own page, or from here.
          </p>
        )}
      </section>

      <div className="actions">
        <Link className="btn btn-primary" to="/">
          Go to Overview
        </Link>
      </div>
    </div>
  );
}
