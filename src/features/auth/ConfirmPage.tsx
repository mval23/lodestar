import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import type { EmailOtpType } from '@supabase/supabase-js';
import { db } from '../../lib/supabase';
import { Notice } from '../../ui/Notice';
import { AuthLayout } from './AuthLayout';
import { authErrorMessage } from './errors';

const TYPES: readonly EmailOtpType[] = ['signup', 'email', 'recovery', 'email_change'];

function isOtpType(v: string | null | undefined): v is EmailOtpType {
  return typeof v === 'string' && (TYPES as readonly string[]).includes(v);
}

export type LinkParams = {
  tokenHash: string | null;
  type: string | null;
  code: string | null;
  errorCode: string | null;
};

// Supabase puts failures in the query string, and the older implicit flow
// puts them in the fragment. Read both, and prefer the query string.
export function readLinkParams(search: string, hash: string): LinkParams {
  const query = new URLSearchParams(search.replace(/^\?/, ''));
  const frag = new URLSearchParams(hash.replace(/^#/, ''));
  const pick = (key: string) => query.get(key) ?? frag.get(key);
  return {
    tokenHash: pick('token_hash'),
    type: pick('type'),
    code: pick('code'),
    errorCode: pick('error_code') ?? pick('error'),
  };
}

const INCOMPLETE = 'This link is incomplete. Open it again from the email, or request a new one.';
const TIMED_OUT = 'This link could not be confirmed. Request a new one, or sign in.';

// Landing page for every emailed link.
//
// Lodestar's own templates (supabase/templates/) send
// {{ .RedirectTo }}?token_hash=…&type=…, which is exchanged here in the
// browser, so a link works on any device. A project still using Supabase's
// default templates sends people through Supabase's verify endpoint, which
// redirects back here with ?code=… that the client exchanges by itself; that
// only works in the browser that asked for the link. Both are handled, as are
// the ?error=… redirects Supabase sends when a link has expired.
export function ConfirmPage() {
  const navigate = useNavigate();
  const [link] = useState(() => readLinkParams(window.location.search, window.location.hash));
  const [asyncError, setAsyncError] = useState<string | null>(null);
  const started = useRef(false);

  const { tokenHash, type, code, errorCode } = link;
  const usable = (tokenHash && isOtpType(type)) || code;
  // What the URL itself already says, before anything is exchanged.
  const error = errorCode ? authErrorMessage({ code: errorCode }) : usable ? asyncError : INCOMPLETE;

  useEffect(() => {
    if (errorCode || !usable) return;
    const supabase = db();
    const done = (recovery: boolean) =>
      recovery
        ? navigate('/reset-password', { replace: true })
        : navigate('/', { replace: true, state: { notice: 'Your email is confirmed. Welcome to Lodestar.' } });

    if (tokenHash && isOtpType(type)) {
      // A token is single use, so StrictMode's second run must not spend it again.
      if (started.current) return;
      started.current = true;
      void supabase.auth.verifyOtp({ token_hash: tokenHash, type }).then(({ error }) => {
        if (error) setAsyncError(authErrorMessage(error));
        else done(type === 'recovery');
      });
      return;
    }

    // The client exchanges ?code= on its own (detectSessionInUrl), so wait for
    // the session it produces rather than spending the code a second time.
    let settled = false;
    const finish = (recovery: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      subscription.unsubscribe();
      done(recovery);
    };
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      subscription.unsubscribe();
      setAsyncError(TIMED_OUT);
    }, 10_000);
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (session) finish(event === 'PASSWORD_RECOVERY' || type === 'recovery');
    });
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) finish(type === 'recovery');
    });

    return () => {
      clearTimeout(timer);
      subscription.unsubscribe();
    };
  }, [navigate, tokenHash, type, code, errorCode, usable]);

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
