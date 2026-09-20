import { CategoryManager } from '../categories/CategoryManager';
import { BudgetList } from './BudgetList';

// Budgets and categories share a page because a budget is a plan for one
// category in one month: managing them apart means holding both in your head.
export function BudgetsPage() {
  return (
    <div className="page page-narrow">
      <header className="page-head">
        <h1 className="large-title">Budgets</h1>
      </header>

      <BudgetList />

      <CategoryManager />
    </div>
  );
}
