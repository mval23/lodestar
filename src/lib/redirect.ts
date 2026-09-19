const AUTH_PAGES = new Set(['/sign-in', '/sign-up', '/forgot-password', '/reset-password', '/check-email']);
const BASE = 'https://lodestar.invalid';

// Only same-origin app paths are allowed as a post-sign-in destination.
// Rejects absolute URLs, protocol-relative "//host", backslash tricks,
// control characters and auth pages (which would loop).
export function safeNextPath(raw: string | null | undefined, fallback = '/'): string {
  if (!raw) return fallback;
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\')) return fallback;
  for (const ch of raw) {
    if (ch.charCodeAt(0) < 0x20 || ch.charCodeAt(0) === 0x7f) return fallback;
  }
  let url: URL;
  try {
    url = new URL(raw, BASE);
  } catch {
    return fallback;
  }
  if (url.origin !== BASE) return fallback;
  if (url.pathname.startsWith('/auth/') || AUTH_PAGES.has(url.pathname)) return fallback;
  return url.pathname + url.search + url.hash;
}

// Where an emailed link should land. Must be in the Supabase redirect allow list.
export function authCallbackUrl(): string {
  return `${window.location.origin}/auth/confirm`;
}
