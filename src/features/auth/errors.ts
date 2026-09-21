// Calm, specific copy for Supabase Auth and Data API errors. Raw server
// messages are never shown: they can be vague or leak details.

// Callers pass whatever a rejected promise gave them, so this takes unknown
// and reads the few fields Supabase and PostgREST actually set.
type ErrorShape = { code?: unknown; status?: unknown; name?: unknown; message?: unknown };
type ErrorLike = unknown;

function fields(error: ErrorLike): ErrorShape {
  return typeof error === 'object' && error !== null ? (error as ErrorShape) : {};
}

const BY_CODE: Record<string, string> = {
  invalid_credentials: 'That email and password don’t match an account.',
  email_not_confirmed: 'Confirm your email address first. The link is in the email we sent you.',
  weak_password: 'Choose a stronger password: longer, and not one you use elsewhere.',
  same_password: 'Choose a password that’s different from your current one.',
  over_email_send_rate_limit: 'Too many emails were sent to this address. Wait a few minutes, then try again.',
  over_request_rate_limit: 'Too many attempts. Wait a few minutes, then try again.',
  otp_expired: 'This link has expired or was already used. Request a new one.',
  access_denied: 'This link has expired or was already used. Request a new one.',
  flow_state_expired: 'This link has expired. Request a new one.',
  flow_state_not_found: 'This link has expired. Request a new one.',
  bad_code_verifier: 'Open the link in the same browser you used to request it, or request a new one.',
  session_not_found: 'You were signed out. Sign in again to continue.',
  refresh_token_not_found: 'You were signed out. Sign in again to continue.',
  signup_disabled: 'New accounts can’t be created right now.',
  email_address_invalid: 'Enter a valid email address, like name@example.com.',
  user_banned: 'This account can’t sign in right now.',
  reauthentication_needed: 'Enter your current password to continue.',
};

export const NETWORK_MESSAGE = 'Lodestar can’t be reached. Check your connection and try again.';
export const GENERIC_MESSAGE = 'Something went wrong. Try again in a moment.';
export const BEHIND_MESSAGE =
  'This part of Lodestar is newer than the database it is talking to. Apply the latest migrations, then reload.';

// PostgREST cannot find the view or function (PGRST2xx), or Postgres itself
// says the relation or function does not exist. Every one of them means the
// same thing: the migrations have not been applied here yet.
const BEHIND_CODES = new Set(['PGRST202', 'PGRST205', '42P01', '42883']);

export function authErrorMessage(raw: ErrorLike): string {
  if (!raw) return GENERIC_MESSAGE;
  const error = fields(raw);
  const code = typeof error.code === 'string' ? error.code : undefined;
  if (code && BY_CODE[code]) return BY_CODE[code];
  // auth-js labels every 5xx an AuthRetryableFetchError too, so only a
  // request that got no response at all (status 0) is a connection problem.
  const noResponse = error.status === 0 || error.status === undefined;
  if (error.name === 'TypeError' || error.status === 0 || (error.name === 'AuthRetryableFetchError' && noResponse)) {
    return NETWORK_MESSAGE;
  }
  if (error.status === 429) return BY_CODE.over_request_rate_limit!;
  return GENERIC_MESSAGE;
}

// Postgres errors raised by our own triggers and RPCs carry messages written
// for people (see the migration). Constraint violations share those codes but
// have technical messages ("new row ... violates check constraint"), so they
// get the generic copy like everything else.
const TRIGGER_CODES = new Set(['23514', '22023']);

export function dataErrorMessage(raw: ErrorLike): string {
  if (!raw) return GENERIC_MESSAGE;
  const error = fields(raw);
  const code = typeof error.code === 'string' ? error.code : undefined;
  const message = typeof error.message === 'string' ? error.message : '';
  if (code && TRIGGER_CODES.has(code) && message.length < 200 && !message.includes('violates')) {
    return message;
  }
  if (code && BEHIND_CODES.has(code)) return BEHIND_MESSAGE;
  if (error.name === 'TypeError' || error.status === 0) return NETWORK_MESSAGE;
  return GENERIC_MESSAGE;
}
