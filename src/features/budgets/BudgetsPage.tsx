import { ChartPie } from 'lucide-react';
import { EmptyState } from '../../ui/EmptyState';
import { CategoryManager } from '../categories/CategoryManager';

// Budgets and categories share a page because a budget is a plan for one
// category in one month: managing them apart means holding both in your head.
export function BudgetsPage() {
  return (
    <div className="page page-narrow">
      <header className="page-head">
        <h1 className="large-title">Budgets</h1>
      </header>

      <EmptyState icon={ChartPie} title="Monthly plans aren’t built yet">
        Planning an amount per category, with what you’ve spent and what’s left, arrives in the next build. The
        categories you set up here are what those plans will attach to.
      </EmptyState>

      <CategoryManager />
    </div>
  );
}
