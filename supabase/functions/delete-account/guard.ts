// The decisions delete-account has to get right, kept apart from the HTTP and
// Deno plumbing so the rest of the suite can test them.
//
// This file imports nothing on purpose: Deno reads it through a relative
// import from index.ts, and Vitest reads the same source.

// Deleting an account cannot be undone, so a token minted hours ago is not
// enough on its own: the person must have proved their password just now.
// GoTrue records each authentication in the amr claim, and a silent token
// refresh does not touch it, so a refreshed session cannot pass this.
export const RECENT_AUTH_SECONDS = 300;

// A clock a few seconds ahead of ours is ordinary. A token stamped further
// into the future than this is not evidence of anything.
const CLOCK_SKEW_SECONDS = 60;

export type Claims = Record<string, unknown>;

export function bearerToken(header: string | null | undefined): string | null {
  if (!header) return null;
  const [scheme, ...rest] = header.trim().split(/\s+/);
  if (!scheme || scheme.toLowerCase() !== 'bearer') return null;
  const token = rest.join(' ').trim();
  return token === '' ? null : token;
}

// Reads the payload of a token Auth has already verified. Identity never
// comes from here — it comes from the user Auth returns — only the timestamps.
export function decodeClaims(token: string): Claims | null {
  const payload = token.split('.')[1];
  if (!payload) return null;
  try {
    const claims: unknown = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    return typeof claims === 'object' && claims !== null && !Array.isArray(claims) ? (claims as Claims) : null;
  } catch {
    return null;
  }
}

// The most recent authentication the token can vouch for. amr entries are
// what GoTrue writes when a factor is actually used; iat is the fallback for
// a token that carries none, and it is only ever more generous.
export function authenticatedAt(claims: Claims): number | null {
  const amr = claims.amr;
  if (Array.isArray(amr)) {
    const stamps = amr
      .map((entry) =>
        typeof entry === 'object' && entry !== null ? (entry as { timestamp?: unknown }).timestamp : undefined,
      )
      .filter((stamp): stamp is number => typeof stamp === 'number' && Number.isFinite(stamp));
    if (stamps.length > 0) return Math.max(...stamps);
  }
  return typeof claims.iat === 'number' && Number.isFinite(claims.iat) ? claims.iat : null;
}

export function isRecentAuth(claims: Claims, nowSeconds: number): boolean {
  const at = authenticatedAt(claims);
  if (at === null) return false;
  if (at > nowSeconds + CLOCK_SKEW_SECONDS) return false;
  return nowSeconds - at <= RECENT_AUTH_SECONDS;
}

// The Authorization header, not CORS, is what protects this endpoint: it
// takes a bearer token and reads no cookies, so a page on another origin
// gains nothing by calling it. APP_ORIGINS narrows it anyway where it is set.
// Returns the origin to echo back, or null to refuse the request.
export function allowedOrigin(origin: string | null | undefined, configured: string | null | undefined): string | null {
  const list = (configured ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (list.length === 0) return origin ?? '*';
  if (!origin) return null;
  return list.includes(origin) ? origin : null;
}
