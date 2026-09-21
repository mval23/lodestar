import { Link, Navigate, useNavigate, useParams } from 'react-router';
import { useProfile } from '../../lib/profile';
import { monthStartInZone } from '../../lib/dates';
import { budgetMonthPath, monthFromParam } from '../../lib/routes';
import { BudgetList } from './BudgetList';

// The month's plan, category by category. The month is part of the address;
// /budgets alone opens the current month. Categories themselves are kept on
// their own page: planning happens every week, and renaming or merging
// happens rarely, so the two no longer share one long scroll.
export function BudgetsPage() {
  const { month: param } = useParams();
  const navigate = useNavigate();
  const profile = useProfile();
  const month = param === undefined ? monthStartInZone(profile.data?.timezone) : monthFromParam(param);

  if (month === null) return <Navigate to="/budgets" replace />;

  return (
    <div className="page">
      <header className="page-head">
        <h1 className="large-title">Budgets</h1>
        <nav className="actions" aria-label="Related">
          {/* On a phone, Bills sits under Budgets (CLAUDE.md): the tab bar has
              no room for it. The sidebar lists it on a wide screen. */}
          <Link className="mobile-only" to="/bills">
            Bills
          </Link>
          <Link to="/categories">Categories</Link>
        </nav>
      </header>

      <BudgetList month={month} onMonth={(next) => navigate(budgetMonthPath(next), { replace: true })} />
    </div>
  );
}
