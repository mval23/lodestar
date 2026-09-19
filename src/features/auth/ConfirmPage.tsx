import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import type { EmailOtpType } from '@supabase/supabase-js';
import { db } from '../../lib/supabase';
import { Notice } from '../../ui/Notice';
import { AuthLayout } from './AuthLayout';
import { authErrorMessage } from './errors';

const TYPES: readonly EmailOtpType[] = ['signup', 'email', 'recovery', 'email_change'];

function isOtpType(v: string | null): v is EmailOtpType {
  return v !== null && (TYPES as readonly string[]).includes(v);
}

// Landing page for every emailed link. The email templates in
// supabase/templates/ send {{ .RedirectTo }}?token_hash=…&type=…, and the
// token is exchanged here, in the browser, so the link works on any device.
export function ConfirmPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const started = useRef(false);

  const tokenHash = params.get('token_hash');
  const type = params.get('type');
  const complete = Boolean(tokenHash) && isOtpType(type);
  const error = complete
    ? verifyError
    : 'This link is incomplete. Open it again from the email, or request a new one.';

  useEffect(() => {
    // Tokens are single use; StrictMode's double effect must not spend it twice.
    if (started.current || !tokenHash || !isOtpType(type)) return;
    started.current = true;

    db()
      .auth.verifyOtp({ token_hash: tokenHash, type })
      .then(({ error }) => {
        if (error) {
          setVerifyError(authErrorMessage(error));
          return;
        }
        if (type === 'recovery') {
          navigate('/reset-password', { replace: true });
        } else {
          navigate('/', { replace: true, state: { notice: 'Your email is confirmed. Welcome to Lodestar.' } });
        }
      });
  }, [tokenHash, type, navigate]);

  if (error) {
    return (
      <AuthLayout title="This link didn’t work">
        <div className="auth-form">
          <Notice tone="err">{error}</Notice>
          <div className="auth-links">
            <Link to="/sign-in">Sign in</Link>
            <Link to="/forgot-password">Request a new reset link</Link>
          </div>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="One moment">
      <p className="secondary flush" role="status">
        Checking your link…
      </p>
    </AuthLayout>
  );
}
