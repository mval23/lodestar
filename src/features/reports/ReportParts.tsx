import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { ChevronLeft, Info, SlidersHorizontal } from 'lucide-react';
import { useProfile } from '../../lib/profile';
import type { Currency } from '../../lib/money';
import type { Finding } from '../../lib/standsOut';
import { addMonths, formatDate, monthStartInZone, todayInZone } from '../../lib/dates';
import { monthRange } from '../../lib/routes';
import { Button } from '../../ui/Button';
import { FormGroup, FormRow } from '../../ui/Form';
import { Select } from '../../ui/Select';
import { Sheet } from '../../ui/Sheet';
import { Findings } from '../../ui/StandsOut';
import { useAccounts } from '../accounts/queries';
import {
  COMPARES,
  DEFAULT_FILTERS,
  PERIODS,
  SCOPES,
  compareStart,
  filterSearch,
  periodRange,
  rangeLabel,
  scopeAccountIds,
  useReportFilters,
  type Compare,
  type Period,
  type Scope,
} from './filters';
import { useFirstActivityMonth } from './queries';

// What every report page shares: the filters from the address, the period
// they make, the accounts in scope, and the words for the comparison.
export function useReportRange() {
  const profile = useProfile();
  const timezone = profile.data?.timezone;
  const currentMonth = monthStartInZone(timezone);
  const today = todayInZone(timezone);
  const [filters, setFilters] = useReportFilters();
  const first = useFirstActivityMonth();
  const accounts = useAccounts();

  const range = periodRange(filters.period, currentMonth, first.data ?? null);
  const compareFrom = compareStart(range, filters.compare);
  const compareRange = { from: compareFrom, to: addMonths(compareFrom, Math.max(0, monthsOf(range))) };
  const accountIds = scopeAccountIds(filters.scope, accounts.data ?? []);

  return {
    currentMonth,
    today,
    filters,
    setFilters,
    search: filterSearch(filters),
    range,
    compareFrom,
    // "vs Oct 2024 – Sep 2025": what every change is measured against.
    against: `vs ${rangeLabel(compareRange)}`,
    accountIds,
    // Nothing complete to report yet: no activity, or only this month's.
    nothingYet: first.isSuccess && (first.data === null || first.data >= currentMonth),
    ready: first.isSuccess && accounts.isSuccess,
  };
}

function monthsOf(range: { from: string; to: string }): number {
  const [fy, fm] = range.from.split('-').map(Number);
  const [ty, tm] = range.to.split('-').map(Number);
  return ((ty ?? 0) - (fy ?? 0)) * 12 + ((tm ?? 0) - (fm ?? 0));
}

// The last day of a month, as "Sep 30, 2026": where a period ends or
// began. With the year, since a 12-month period begins and ends on the same
// day of the year.
export function monthEnd(month: string): string {
  return formatDate(monthRange(month).to);
}

// The report filters as one capsule that says what is chosen, "Last 12
// months · vs previous · All accounts", and opens a sheet to change it: the
// same pattern as Activity's Filters, and one line on a phone instead of
// three.
const COMPARE_SHORT: Record<Compare, string> = { previous: 'vs previous', year: 'vs a year earlier' };

export function ReportFiltersBar({ showScope = true }: { showScope?: boolean }) {
  const [filters, setFilters] = useReportFilters();
  const [open, setOpen] = useState(false);
  const label = (options: { value: string; label: string }[], value: string) => options.find((o) => o.value === value)?.label ?? '';
  const isDefault =
    filters.period === DEFAULT_FILTERS.period &&
    filters.compare === DEFAULT_FILTERS.compare &&
    (!showScope || filters.scope === DEFAULT_FILTERS.scope);
  return (
    <div className="report-filters">
      <button type="button" className="capsule-button report-filter-summary" onClick={() => setOpen(true)} aria-haspopup="dialog">
        <SlidersHorizontal strokeWidth={1.75} aria-hidden />
        <span className="visually-hidden">Report filters: </span>
        <strong>{label(PERIODS, filters.period)}</strong>
        <span>· {COMPARE_SHORT[filters.compare]}</span>
        {showScope && <span>· {label(SCOPES, filters.scope)}</span>}
      </button>
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="Report filters"
        leading={
          <button type="button" className="btn btn-plain" onClick={() => setFilters({ ...DEFAULT_FILTERS })} disabled={isDefault}>
            Reset
          </button>
        }
        footer={
          <Button variant="plain" className="btn-compact" onClick={() => setOpen(false)}>
            Done
          </Button>
        }
      >
        <div className="stack filters-sheet">
          <FormGroup>
            <FormRow label="Period" htmlFor="report-period">
              <Select
                id="report-period"
                label="Period"
                value={filters.period}
                onChange={(period) => setFilters({ period: period as Period })}
                options={PERIODS}
              />
            </FormRow>
            <FormRow label="Compare with" htmlFor="report-compare">
              <Select
                id="report-compare"
                label="Compare with"
                value={filters.compare}
                onChange={(compare) => setFilters({ compare: compare as Compare })}
                options={COMPARES}
              />
            </FormRow>
            {showScope && (
              <FormRow label="Accounts" htmlFor="report-scope">
                <Select
                  id="report-scope"
                  label="Accounts"
                  value={filters.scope}
                  onChange={(scope) => setFilters({ scope: scope as Scope })}
                  options={SCOPES.map(({ value, label: text }) => ({ value, label: text }))}
                />
              </FormRow>
            )}
          </FormGroup>
        </div>
      </Sheet>
    </div>
  );
}

// A report page's head: back to the hub (filters kept), the title, the
// period in words, and the filters.
export function ReportHead({
  title,
  subtitle,
  back,
  showScope,
  controls,
}: {
  title: string;
  subtitle: ReactNode;
  back?: string;
  showScope?: boolean;
  // In place of the shared filters, for a report that picks something else
  // (Budget vs actual picks one month).
  controls?: ReactNode;
}) {
  return (
    <header className="detail-head">
      {back !== undefined && (
        <Link to={`/reports${back}`} className="back-link">
          <ChevronLeft strokeWidth={1.75} aria-hidden />
          Reports
        </Link>
      )}
      <div className="page-head">
        <div>
          <h1 className="large-title">{title}</h1>
          <p className="footnote flush">{subtitle}</p>
        </div>
        {controls ?? <ReportFiltersBar showScope={showScope} />}
      </div>
    </header>
  );
}

// What the period comes to, in a sentence or two, beside the limits of the
// figures: the closing pair of every report page.
export function ReportClosing({ findings, currency, about }: { findings: Finding[]; currency: Currency; about: ReactNode[] }) {
  return (
    <div className="report-pair">
      {findings.length > 0 && (
        <section className="group about-figures" aria-labelledby="stands-out">
          <h2 className="caption" id="stands-out">
            What stands out
          </h2>
          <p className="report-findings flush">
            <Findings findings={findings} currency={currency} />
          </p>
        </section>
      )}
      <AboutFigures items={about} />
    </div>
  );
}

// The limits of what the figures can say, under them, in a few lines.
export function AboutFigures({ items }: { items: ReactNode[] }) {
  return (
    <section className="group about-figures" aria-labelledby="about-figures">
      <h2 className="caption about-title" id="about-figures">
        <Info strokeWidth={1.75} aria-hidden />
        About these figures
      </h2>
      <ul>
        {items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    </section>
  );
}

export const REFUND_NOTE =
  'A refund recorded as income raises both money in and money out, since Lodestar has no refund kind yet.';

// Shares and changes as percentages live in lib/percent, shared with the
// Category page; re-exported here for the report pages.
export { percentChange, share } from '../../lib/percent';
