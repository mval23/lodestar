import { allowedOrigin, authenticatedAt, bearerToken, decodeClaims, isRecentAuth, RECENT_AUTH_SECONDS } from './guard';

const NOW = 1_800_000_000;

function token(payload: object): string {
  const encode = (value: object) =>
    btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode(payload)}.signature`;
}

describe('bearerToken', () => {
  it('reads the token, however the header is spaced or cased', () => {
    expect(bearerToken('Bearer abc.def.ghi')).toBe('abc.def.ghi');
    expect(bearerToken('bearer   abc.def.ghi  ')).toBe('abc.def.ghi');
  });

  it('refuses anything that is not a bearer token', () => {
    expect(bearerToken(null)).toBeNull();
    expect(bearerToken('')).toBeNull();
    expect(bearerToken('Bearer')).toBeNull();
    expect(bearerToken('Bearer ')).toBeNull();
    expect(bearerToken('Basic abc')).toBeNull();
    expect(bearerToken('abc.def.ghi')).toBeNull();
  });
});

describe('decodeClaims', () => {
  it('reads the payload of a well-formed token', () => {
    expect(decodeClaims(token({ sub: 'u1', iat: NOW }))).toEqual({ sub: 'u1', iat: NOW });
  });

  it('returns null rather than throwing on rubbish', () => {
    expect(decodeClaims('')).toBeNull();
    expect(decodeClaims('one-part')).toBeNull();
    expect(decodeClaims('a.!!!not-base64!!!.c')).toBeNull();
    expect(decodeClaims(`a.${btoa('[1,2,3]')}.c`)).toBeNull();
    expect(decodeClaims(`a.${btoa('null')}.c`)).toBeNull();
  });
});

describe('authenticatedAt', () => {
  it('prefers amr, which records the authentication itself', () => {
    const claims = { iat: NOW, amr: [{ method: 'password', timestamp: NOW - 40 }] };
    expect(authenticatedAt(claims)).toBe(NOW - 40);
  });

  it('takes the most recent factor when there are several', () => {
    const claims = {
      iat: NOW,
      amr: [
        { method: 'password', timestamp: NOW - 900 },
        { method: 'totp', timestamp: NOW - 30 },
      ],
    };
    expect(authenticatedAt(claims)).toBe(NOW - 30);
  });

  it('falls back to iat when the token carries no amr', () => {
    expect(authenticatedAt({ iat: NOW - 10 })).toBe(NOW - 10);
    expect(authenticatedAt({ iat: NOW - 10, amr: [] })).toBe(NOW - 10);
    expect(authenticatedAt({ iat: NOW - 10, amr: [{ method: 'password' }] })).toBe(NOW - 10);
  });

  it('has nothing to say about a token with neither', () => {
    expect(authenticatedAt({})).toBeNull();
    expect(authenticatedAt({ iat: 'recently' })).toBeNull();
  });
});

describe('isRecentAuth', () => {
  it('accepts a password proved a moment ago', () => {
    expect(isRecentAuth({ amr: [{ method: 'password', timestamp: NOW - 5 }] }, NOW)).toBe(true);
  });

  it('refuses a session that has merely been kept alive', () => {
    // A refresh mints a new token — new iat — but never a new amr timestamp.
    const refreshed = { iat: NOW - 2, amr: [{ method: 'password', timestamp: NOW - 7200 }] };
    expect(isRecentAuth(refreshed, NOW)).toBe(false);
  });

  it('draws the line at five minutes', () => {
    expect(isRecentAuth({ iat: NOW - RECENT_AUTH_SECONDS }, NOW)).toBe(true);
    expect(isRecentAuth({ iat: NOW - RECENT_AUTH_SECONDS - 1 }, NOW)).toBe(false);
  });

  it('allows for a clock slightly ahead, but not for a token from the future', () => {
    expect(isRecentAuth({ iat: NOW + 30 }, NOW)).toBe(true);
    expect(isRecentAuth({ iat: NOW + 3600 }, NOW)).toBe(false);
  });

  it('refuses a token that proves no authentication at all', () => {
    expect(isRecentAuth({}, NOW)).toBe(false);
  });
});

describe('allowedOrigin', () => {
  it('echoes the origin when no allow list is configured', () => {
    expect(allowedOrigin('https://lodestar.app', undefined)).toBe('https://lodestar.app');
    expect(allowedOrigin(null, '')).toBe('*');
  });

  it('honours the allow list when there is one', () => {
    const list = 'https://lodestar.app, https://staging.lodestar.app';
    expect(allowedOrigin('https://staging.lodestar.app', list)).toBe('https://staging.lodestar.app');
    expect(allowedOrigin('https://phishing.example', list)).toBeNull();
    expect(allowedOrigin(null, list)).toBeNull();
  });
});
