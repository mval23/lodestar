import {
  expectedRelations,
  judgeFunction,
  judgeHeaders,
  judgeRelation,
  readBundle,
  siteHeaders,
  summarize,
} from './checks.mjs';

describe('expectedRelations', () => {
  it('lists every table and view the migrations create', () => {
    const sql = `
      create table public.accounts (id uuid);
      create view public.account_balances with (security_invoker = true) as select 1;
      create or replace view public.month_summary as select 1;
      create table if not exists public.goals (id uuid);`;
    expect(expectedRelations([sql])).toEqual(['account_balances', 'accounts', 'goals', 'month_summary']);
  });

  it('forgets what a later migration drops', () => {
    expect(
      expectedRelations(['create table public.a (id int); create view public.b as select 1;', 'drop view public.b;']),
    ).toEqual(['a']);
  });

  it('keeps a view that is dropped and rebuilt in the same migration', () => {
    const rebuild = 'drop view public.account_balances;\ncreate view public.account_balances as select 2;';
    expect(expectedRelations(['create view public.account_balances as select 1;', rebuild])).toEqual([
      'account_balances',
    ]);
  });

  it('ignores anything in a comment', () => {
    const sql = '-- create table public.ghost (id int);\n/* drop table public.real; */\ncreate table public.real (id int);';
    expect(expectedRelations([sql])).toEqual(['real']);
  });

  it('ignores other schemas', () => {
    expect(expectedRelations(['create schema tests; create table tests.helper (id int);'])).toEqual([]);
  });
});

describe('judgeRelation', () => {
  it('is content when the relation exists and refuses the signed out', () => {
    expect(judgeRelation('transactions', 401, { code: '42501' }).ok).toBe(true);
  });

  it('says the database is behind when the relation is missing', () => {
    const result = judgeRelation('month_summary', 404, { code: 'PGRST205' });
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/behind the app/);
  });

  it('treats rows handed to the signed out as an incident', () => {
    const result = judgeRelation('transactions', 200, []);
    expect(result).toMatchObject({ ok: false, level: 'critical' });
  });

  it('does not guess about anything else', () => {
    expect(judgeRelation('transactions', 503, null)).toMatchObject({ ok: false, level: 'fail' });
  });
});

describe('judgeHeaders', () => {
  const expected = [
    { key: 'Content-Security-Policy', value: "default-src 'self'" },
    { key: 'X-Frame-Options', value: 'DENY' },
  ];

  it('passes headers that match vercel.json, whatever their case', () => {
    const results = judgeHeaders(expected, { 'content-security-policy': "default-src 'self'", 'x-frame-options': 'DENY' });
    expect(results.every((result) => result.ok)).toBe(true);
  });

  it('names a header that is missing, and one that drifted', () => {
    const results = judgeHeaders(expected, { 'content-security-policy': "default-src *" });
    expect(results.filter((result) => !result.ok).map((result) => result.message)).toEqual([
      'Content-Security-Policy differs from vercel.json',
      'X-Frame-Options is missing',
    ]);
  });

  it('never accepts an unsafe CSP, even one that matches', () => {
    const unsafe = [{ key: 'Content-Security-Policy', value: "script-src 'self' 'unsafe-inline'" }];
    const results = judgeHeaders(unsafe, { 'content-security-policy': "script-src 'self' 'unsafe-inline'" });
    expect(results.some((result) => !result.ok && /unsafe/.test(result.message))).toBe(true);
  });

  it('reads the page headers out of vercel.json, not the asset ones', () => {
    const vercel = {
      headers: [
        { source: '/(.*)', headers: [{ key: 'X-Frame-Options', value: 'DENY' }] },
        { source: '/assets/(.*)', headers: [{ key: 'Cache-Control', value: 'immutable' }] },
      ],
    };
    expect(siteHeaders(vercel)).toEqual([{ key: 'X-Frame-Options', value: 'DENY' }]);
  });
});

describe('readBundle', () => {
  const url = 'https://abcdefghijklmnopqrst.supabase.co';

  it('finds the project and the publishable key', () => {
    expect(readBundle(`const a="${url}",b="sb_publishable_abc123XYZ";`)).toEqual({
      url,
      key: 'sb_publishable_abc123XYZ',
      secret: false,
    });
  });

  it('notices a secret key', () => {
    expect(readBundle(`k="sb_secret_abcdefghijkl"`).secret).toBe(true);
  });

  it('notices a service-role JWT, but not an ordinary one', () => {
    const jwt = (payload) =>
      `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.signature`;
    expect(readBundle(`k="${jwt({ role: 'service_role', iss: 'supabase' })}"`).secret).toBe(true);
    expect(readBundle(`k="${jwt({ role: 'anon', iss: 'supabase' })}"`).secret).toBe(false);
  });
});

describe('judgeFunction', () => {
  it('is content when the function is deployed and refuses the anonymous', () => {
    expect(judgeFunction(204, 401, { error: 'unauthenticated' }).every((result) => result.ok)).toBe(true);
  });

  it('says so plainly when it is not deployed', () => {
    const results = judgeFunction(404, 404, null);
    expect(results).toHaveLength(1);
    expect(results[0].message).toMatch(/not deployed/);
  });

  it('flags a refused preflight, which breaks the browser', () => {
    expect(judgeFunction(401, 401, { error: 'unauthenticated' })[0].ok).toBe(false);
  });

  it('treats success without a token as an incident', () => {
    expect(judgeFunction(204, 200, { ok: true })[1]).toMatchObject({ ok: false, level: 'critical' });
  });
});

describe('summarize', () => {
  it('reads healthy when nothing failed', () => {
    const report = summarize('https://example.test', [{ ok: true, level: 'ok', message: 'fine' }]);
    expect(report.healthy).toBe(true);
    expect(report.text).toMatch(/^https:\/\/example\.test: healthy/);
  });

  it('counts the problems, and marks an incident apart from a failure', () => {
    const report = summarize('site', [
      { ok: false, level: 'fail', message: 'behind' },
      { ok: false, level: 'critical', message: 'open' },
    ]);
    expect(report.healthy).toBe(false);
    expect(report.text).toContain('site: 2 problems');
    expect(report.text).toContain('  !!  open');
    expect(report.text).toContain('  ✗   behind');
  });
});
