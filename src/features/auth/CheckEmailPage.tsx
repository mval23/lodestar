import { useState } from 'react';
import { Link, Navigate, useLocation } from 'react-router';
import { db } from '../../lib/supabase';
import { authCallbackUrl } from '../../lib/redirect';
import { Button } from '../../ui/Button';
import { Notice } from '../../ui/Notice';
import { AuthLayout } from './AuthLayout';
import { authErrorMessage } from './errors';

type State = { email?: string; purpose?: 'signup' | 'recovery' } | null;

export function CheckEmailPage() {
  const state = useLocation().state as State;
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);

  if (!state?.email) return <Navigate to="/sign-in" replace />;
  const { email, purpose = 'signup' } = state;

  const resend = async () => {
    setStatus('sending');
    setError(null);
    const { error } =
      purpose === 'signup'
        ? await db().auth.resend({ type: 'signup', email, options: { emailRedirectTo: authCallbackUrl() } })
        : await db().auth.resetPasswordForEmail(email, { redirectTo: authCallbackUrl() });
    if (error) {
      setError(authErrorMessage(error));
      setStatus('idle');
    } else {
      setStatus('sent');
    }
  };

  return (
    <AuthLayout
      title="Check your email"
      intro={
        purpose === 'signup' ? (
          <>
            We sent a confirmation link to <strong>{email}</strong>. Open it to finish creating your account.
          </>
        ) : (
          <>
            If <strong>{email}</strong> has a Lodestar account, we sent it a link to choose a new password.
          </>
        )
      }
    >
      <div className="auth-form">
        <p className="footnote flush">
          The link expires in one hour. If you don’t see the email, check your spam folder.
        </p>
        {error && <Notice tone="err">{error}</Notice>}
        {status === 'sent' && <Notice tone="ok">We sent another email.</Notice>}
        <Button variant="secondary" block onClick={resend} busy={status === 'sending'} disabled={status === 'sent'}>
          {status === 'sending' ? 'Sending…' : 'Send it again'}
        </Button>
        <div className="auth-links">
          <Link to="/sign-in">Back to sign in</Link>
        </div>
      </div>
    </AuthLayout>
  );
}
