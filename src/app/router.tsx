import { createBrowserRouter } from 'react-router';
import { CheckEmailPage } from '../features/auth/CheckEmailPage';
import { ConfirmPage } from '../features/auth/ConfirmPage';
import { ForgotPasswordPage } from '../features/auth/ForgotPasswordPage';
import { ResetPasswordPage } from '../features/auth/ResetPasswordPage';
import { SignInPage } from '../features/auth/SignInPage';
import { SignUpPage } from '../features/auth/SignUpPage';
import { SettingsPage } from '../features/settings/SettingsPage';
import { AppLayout } from './AppLayout';
import { ForwardStrayAuthLink, RedirectIfSignedIn, RequireAuth } from './guards';
import { NotFoundPage, OverviewPage, PlaceholderPage, PLACEHOLDER_ROUTES } from './pages';

export const router = createBrowserRouter([
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
]);
