import { Link } from 'react-router';
import { Compass, type LucideIcon } from 'lucide-react';
import { EmptyState } from '../ui/EmptyState';
import { SIDEBAR_FOOT, SIDEBAR_MAIN } from './nav';

// Screens that later phases fill in. Each keeps its place in the navigation
// so the shell can be reviewed now.
export function PlaceholderPage({ title, icon, children }: { title: string; icon: LucideIcon; children: string }) {
  return (
    <div className="page">
      <header className="page-head">
        <h1 className="large-title">{title}</h1>
      </header>
      <EmptyState icon={icon} title="Not built yet">
        {children}
      </EmptyState>
    </div>
  );
}

const LATER: Record<string, string> = {
  '/accounts': 'Accounts and their balances arrive in the next build.',
  '/bills': 'Bills and subscriptions arrive after accounts and transactions.',
  '/goals': 'Goals arrive after accounts and transactions.',
  '/reports': 'Cash-flow and net-worth reports arrive after budgets and goals.',
};

export const PLACEHOLDER_ROUTES = [...SIDEBAR_MAIN, ...SIDEBAR_FOOT]
  .filter((item) => item.to in LATER)
  .map((item) => ({ path: item.to, title: item.label, icon: item.icon, text: LATER[item.to]! }));

export function NotFoundPage() {
  return (
    <div className="page">
      <EmptyState
        icon={Compass}
        title="This page doesn’t exist"
        action={
          <Link className="btn btn-primary" to="/">
            Go to Overview
          </Link>
        }
      >
        Check the address, or head back to your overview.
      </EmptyState>
    </div>
  );
}
