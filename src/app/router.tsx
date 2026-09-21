import { createBrowserRouter, type RouteObject } from 'react-router';
import { AccountDeletedPage } from '../features/auth/AccountDeletedPage';
import { CheckEmailPage } from '../features/auth/CheckEmailPage';
import { ConfirmPage } from '../features/auth/ConfirmPage';
import { ForgotPasswordPage } from '../features/auth/ForgotPasswordPage';
import { ResetPasswordPage } from '../features/auth/ResetPasswordPage';
import { SignInPage } from '../features/auth/SignInPage';
import { SignUpPage } from '../features/auth/SignUpPage';
import { AccountDetailPage } from '../features/accounts/AccountDetailPage';
import { AccountsPage } from '../features/accounts/AccountsPage';
import { BillDetailPage } from '../features/bills/BillDetailPage';
import { BillsPage } from '../features/bills/BillsPage';
import { BudgetLinePage } from '../features/budgets/BudgetLinePage';
import { BudgetsPage } from '../features/budgets/BudgetsPage';
import { CategoriesPage } from '../features/categories/CategoryManager';
import { CategoryDetailPage } from '../features/categories/CategoryDetailPage';
import { GoalDetailPage } from '../features/goals/GoalDetailPage';
import { MonthPage } from '../features/months/MonthPage';
import { GoalsPage } from '../features/goals/GoalsPage';
import { ImportExportPage } from '../features/import-export/ImportExportPage';
import { ReportsPage } from '../features/reports/ReportsPage';
import { OverviewPage } from '../features/overview/OverviewPage';
import { ActivityPage } from '../features/transactions/ActivityPage';
import { SettingsPage } from '../features/settings/SettingsPage';
import { AppLayout } from './AppLayout';
import { ForwardStrayAuthLink, RedirectIfSignedIn, RequireAuth } from './guards';
import { NotFoundPage } from './pages';

// Exported separately so tests can mount the real tree in a memory router.
export const routes: RouteObject[] = [
  {
    element: <ForwardStrayAuthLink />,
    children: [
      { path: '/auth/confirm', element: <ConfirmPage /> },
      { path: '/reset-password', element: <ResetPasswordPage /> },
      { path: '/check-email', element: <CheckEmailPage /> },
      // Public, and reached at the moment the account stops existing.
      { path: '/account-deleted', element: <AccountDeletedPage /> },
      {
        element: <RedirectIfSignedIn />,
        children: [
          { path: '/sign-in', element: <SignInPage /> },
          { path: '/sign-up', element: <SignUpPage /> },
          { path: '/forgot-password', element: <ForgotPasswordPage /> },
        ],
      },
      {
        element: <RequireAuth />,
        children: [
          {
            element: <AppLayout />,
            children: [
              { path: '/', element: <OverviewPage /> },
              { path: '/accounts', element: <AccountsPage /> },
              { path: '/accounts/:id', element: <AccountDetailPage /> },
              { path: '/activity', element: <ActivityPage /> },
              { path: '/bills', element: <BillsPage /> },
              { path: '/bills/:id', element: <BillDetailPage /> },
              { path: '/budgets', element: <BudgetsPage /> },
              // The month is part of the address, so a month can be linked to.
              { path: '/budgets/:month', element: <BudgetsPage /> },
              { path: '/budgets/:month/:categoryId', element: <BudgetLinePage /> },
              { path: '/goals', element: <GoalsPage /> },
              { path: '/goals/:id', element: <GoalDetailPage /> },
              { path: '/import-export', element: <ImportExportPage /> },
              { path: '/reports', element: <ReportsPage /> },
              // A month is a range over the ledger, never a table of its own.
              { path: '/months/:month', element: <MonthPage /> },
              // Categories have a page of their own, reached from Budgets and
              // Settings; each category has its own page beneath it.
              { path: '/categories', element: <CategoriesPage /> },
              { path: '/categories/:id', element: <CategoryDetailPage /> },
              { path: '/settings', element: <SettingsPage /> },
              { path: '*', element: <NotFoundPage /> },
            ],
          },
        ],
      },
    ],
  },
];

export const router = createBrowserRouter(routes);
