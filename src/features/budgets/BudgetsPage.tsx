import { Navigate, useNavigate, useParams } from 'react-router';
import { useProfile } from '../../lib/profile';
import { monthStartInZone } from '../../lib/dates';
import { budgetMonthPath, monthFromParam } from '../../lib/routes';
import { CategoryManager } from '../categories/CategoryManager';
import { BudgetList } from './BudgetList';

// Budgets and categories share a page because a budget is a plan for one
// category in one month: managing them apart means holding both in your head.
// The month is part of the address; /budgets alone opens the current month.
export function BudgetsPage() {
  const { month: param } = useParams();
  const navigate = useNavigate();
  const profile = useProfile();
  const month = param === undefined ? monthStartInZone(profile.data?.timezone) : monthFromParam(param);

  if (month === null) return <Navigate to="/budgets" replace />;

  return (
    <div className="page page-narrow">
      <header className="page-head">
        <h1 className="large-title">Budgets</h1>
      </header>

      <BudgetList month={month} onMonth={(next) => navigate(budgetMonthPath(next), { replace: true })} />

      <CategoryManager />
    </div>
  );
}
