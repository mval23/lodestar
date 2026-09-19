import { parseEnv } from './env';

const url = 'https://abcdefghijklmnop.supabase.co';

function jwt(payload: object): string {
  const b64 = (o: object) => btoa(JSON.stringify(o)).replace(/=+$/, '');
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(payload)}.signature-signature`;
}

describe('parseEnv', () => {
  it('accepts a URL and a publishable key', () => {
    const result = parseEnv({ VITE_SUPABASE_URL: url, VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_abcdefghijklmnop' });
    expect(result.ok).toBe(true);
  });

  it('accepts a legacy anon JWT', () => {
    const result = parseEnv({ VITE_SUPABASE_URL: url, VITE_SUPABASE_PUBLISHABLE_KEY: jwt({ role: 'anon' }) });
    expect(result.ok).toBe(true);
  });

  it('refuses a secret key', () => {
    const result = parseEnv({ VITE_SUPABASE_URL: url, VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_abcdefghijklmnopqrstu' });
    expect(result.ok).toBe(false);
  });

  it('refuses a service-role JWT', () => {
    const result = parseEnv({ VITE_SUPABASE_URL: url, VITE_SUPABASE_PUBLISHABLE_KEY: jwt({ role: 'service_role' }) });
    expect(result.ok).toBe(false);
  });

  it('reports missing values by name only', () => {
    const result = parseEnv({});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.problems.join('\n')).toContain('VITE_SUPABASE_URL');
      expect(result.problems.join('\n')).toContain('VITE_SUPABASE_PUBLISHABLE_KEY');
    }
  });

  it('refuses a non-http URL', () => {
    const result = parseEnv({ VITE_SUPABASE_URL: 'ftp://x.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_abcdefghijklmnop' });
    expect(result.ok).toBe(false);
  });
});
