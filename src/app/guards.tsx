import { Navigate, Outlet, useLocation } from 'react-router';
import { safeNextPath } from '../lib/redirect';
import { useAuth } from './AuthProvider';

function Loading() {
  return (
    <div className="spinner-page" role="status">
      Loading…
    </div>
  );
}

// Signed-in routes. Sends everyone else to sign in and brings them back after.
export function RequireAuth() {
  const auth = useAuth();
  const location = useLocation();
  if (auth.status === 'loading') return <Loading />;
  if (auth.status === 'signed-out') {
    const next = location.pathname + location.search;
    const to = next === '/' ? '/sign-in' : `/sign-in?next=${encodeURIComponent(next)}`;
    return <Navigate to={to} replace />;
  }
  return <Outlet />;
}

// Sign-in, sign-up and forgot-password make no sense while signed in.
export function RedirectIfSignedIn() {
  const auth = useAuth();
  const location = useLocation();
  if (auth.status === 'loading') return <Loading />;
  if (auth.status === 'signed-in') {
    const next = safeNextPath(new URLSearchParams(location.search).get('next'));
    return <Navigate to={next} replace />;
  }
  return <Outlet />;
}

// If a redirect URL isn't on the Supabase allow list, Auth falls back to the
// bare Site URL, so an emailed link can arrive at "/?token_hash=…". Forward
// it to the real handler instead of losing the token.
export const CONFIRM_PATH = '/auth/confirm';

export function ForwardStrayAuthLink() {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  // Never forward the handler to itself: that loops until the router gives
  // up and renders nothing, which is what a real emailed link would hit.
  if (location.pathname !== CONFIRM_PATH && params.has('token_hash') && params.has('type')) {
    return <Navigate to={`${CONFIRM_PATH}${location.search}`} replace />;
  }
  return <Outlet />;
}
