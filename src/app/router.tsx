import { createBrowserRouter, Navigate, type RouteObject } from 'react-router';
import { CheckEmailPage } from '../features/auth/CheckEmailPage';
import { ConfirmPage } from '../features/auth/ConfirmPage';
import { ForgotPasswordPage } from '../features/auth/ForgotPasswordPage';
import { ResetPasswordPage } from '../features/auth/ResetPasswordPage';
import { SignInPage } from '../features/auth/SignInPage';
import { SignUpPage } from '../features/auth/SignUpPage';
import { AccountsPage } from '../features/accounts/AccountsPage';
import { BudgetsPage } from '../features/budgets/BudgetsPage';
import { OverviewPage } from '../features/overview/OverviewPage';
import { ActivityPage } from '../features/transactions/ActivityPage';
import { SettingsPage } from '../features/settings/SettingsPage';
import { AppLayout } from './AppLayout';
import { ForwardStrayAuthLink, RedirectIfSignedIn, RequireAuth } from './guards';
import { NotFoundPage, PlaceholderPage, PLACEHOLDER_ROUTES } from './pages';

// Exported separately so tests can mount the real tree in a memory router.
export const routes: RouteObject[] = [
  {
    element: <ForwardStrayAuthLink />,
    children: [
      { path: '/auth/confirm', element: <ConfirmPage /> },
      { path: '/reset-password', element: <ResetPasswordPage /> },
      { path: '/check-email', element: <CheckEmailPage /> },
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
              { path: '/activity', element: <ActivityPage /> },
              { path: '/budgets', element: <BudgetsPage /> },
              // Categories used to live on their own page; keep old links working.
              { path: '/categories', element: <Navigate to="/budgets" replace /> },
              { path: '/settings', element: <SettingsPage /> },
              ...PLACEHOLDER_ROUTES.map((r) => ({
                path: r.path,
                element: (
                  <PlaceholderPage title={r.title} icon={r.icon}>
                    {r.text}
                  </PlaceholderPage>
                ),
              })),
              { path: '*', element: <NotFoundPage /> },
            ],
          },
        ],
      },
    ],
  },
];

export const router = createBrowserRouter(routes);
