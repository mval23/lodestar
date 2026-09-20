// The only Edge Function in Lodestar (CLAUDE.md). Deleting an account needs
// the service role, because no one can delete their own auth user with an
// ordinary token, and the service-role key exists only in this function's
// secrets — never in Vercel, never in the browser.
//
// In order:
//   1. Auth verifies the caller's token, which is where the user id comes from.
//   2. The token must prove a password within the last few minutes, so an
//      unattended signed-in browser cannot delete anything.
//   3. The request is recorded in the caller's own audit log.
//   4. The auth user is hard-deleted, and every row they own cascades with it
//      (proved by supabase/tests/database/20_references_anon_cascade.test.sql).
//
// The typed confirmation and the warning live in the app; this is the part
// that must hold even if someone calls the endpoint directly.
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { allowedOrigin, bearerToken, decodeClaims, isRecentAuth } from './guard.ts';

declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Promise<Response> | Response): void;
};

Deno.serve(async (request: Request) => {
  const origin = allowedOrigin(request.headers.get('origin'), Deno.env.get('APP_ORIGINS'));
  if (origin === null) return new Response(null, { status: 403 });

  const cors: Record<string, string> = {
    'access-control-allow-origin': origin,
    'access-control-allow-headers': 'authorization, content-type, apikey, x-client-info',
    'access-control-allow-methods': 'POST, OPTIONS',
    vary: 'origin',
  };
  const reply = (body: unknown, status: number) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type': 'application/json' } });

  // verify_jwt is off for this function (supabase/config.toml) so the browser's
  // preflight is answered rather than refused; the token is checked below.
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'POST') return reply({ error: 'method_not_allowed' }, 405);

  const token = bearerToken(request.headers.get('authorization'));
  if (!token) return reply({ error: 'unauthenticated' }, 401);

  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !anonKey || !serviceKey) {
    console.error('delete-account is missing its configuration.');
    return reply({ error: 'not_configured' }, 500);
  }

  // Acts as the caller: Auth checks the signature and expiry, and RLS applies
  // to everything this client touches.
  const caller = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await caller.auth.getUser();
  if (error || !data.user) return reply({ error: 'unauthenticated' }, 401);

  const claims = decodeClaims(token);
  if (!claims || !isRecentAuth(claims, Math.floor(Date.now() / 1000))) {
    return reply({ error: 'reauth_required' }, 401);
  }

  // Through the same RPC the app uses: an event name and nothing else, so no
  // amount or description can be recorded. The row goes with them a moment
  // later; what stays is the write in the database's own log.
  const logged = await caller.rpc('log_event', { p_event: 'account_delete_requested' });
  if (logged.error) {
    console.error('delete-account could not record the request', logged.error.message);
    return reply({ error: 'delete_failed' }, 500);
  }

  // Hard delete. The default is not a soft delete, and a soft-deleted user
  // would leave every row in place, which is the opposite of what was asked.
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const removed = await admin.auth.admin.deleteUser(data.user.id);
  if (removed.error) {
    // The id is the caller's own, and there is nothing else to log.
    console.error('delete-account failed for', data.user.id, removed.error.message);
    return reply({ error: 'delete_failed' }, 500);
  }

  return reply({ ok: true }, 200);
});
