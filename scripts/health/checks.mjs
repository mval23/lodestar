// The rules the production health check applies, kept apart from the fetching
// so every one of them can be tested without a network.
//
// It needs no secrets. Everything it looks at is public by design: the site,
// its headers, the publishable key inside the bundle, and how the Data API
// answers someone who is not signed in.

// Relations the migrations create and have not since dropped, in the order
// the migrations run. This is what the app deployed from the same commit
// expects to find.
export function expectedRelations(migrations) {
  const live = new Set();
  const create = /create\s+(?:or\s+replace\s+)?(?:table|view)\s+(?:if\s+not\s+exists\s+)?public\.([a-z_][a-z0-9_]*)/gi;
  const drop = /drop\s+(?:table|view)\s+(?:if\s+exists\s+)?public\.([a-z_][a-z0-9_]*)/gi;
  for (const sql of migrations) {
    const text = stripComments(sql);
    // Within one file, a drop followed by a create (a view rebuilt with new
    // columns) must leave it live, so apply statements in the order written.
    const events = [
      ...[...text.matchAll(create)].map((m) => ({ at: m.index, name: m[1].toLowerCase(), live: true })),
      ...[...text.matchAll(drop)].map((m) => ({ at: m.index, name: m[1].toLowerCase(), live: false })),
    ].sort((a, b) => a.at - b.at);
    for (const event of events) {
      if (event.live) live.add(event.name);
      else live.delete(event.name);
    }
  }
  return [...live].sort();
}

function stripComments(sql) {
  return sql.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
}

// What the Data API tells someone signed out about one relation. anon holds
// no privilege on anything (CLAUDE.md), so "exists but refused" is healthy,
// "not found" means the database is behind the app, and any rows at all mean
// isolation has failed.
export function judgeRelation(name, status, body) {
  const code = typeof body?.code === 'string' ? body.code : undefined;
  if (code === '42501') return ok(`${name} exists, and is closed to the signed out`);
  if (code === 'PGRST205' || code === '42P01') {
    return fail(`${name} is missing: the database is behind the app. Run "Migrate production".`);
  }
  if (status >= 200 && status < 300) {
    return fail(`${name} answered a signed-out request with ${status}. Anyone can read it. Treat this as an incident.`, 'critical');
  }
  return fail(`${name} answered ${status}${code ? ` (${code})` : ''}, which this check does not expect.`);
}

// Header names compared case-insensitively, values exactly: a header that
// drifts from vercel.json is as much a finding as one that disappears.
export function judgeHeaders(expected, actual) {
  const results = [];
  const have = new Map(Object.entries(actual).map(([key, value]) => [key.toLowerCase(), value]));
  for (const { key, value } of expected) {
    const got = have.get(key.toLowerCase());
    if (got === undefined) results.push(fail(`${key} is missing`));
    else if (got !== value) results.push(fail(`${key} differs from vercel.json`));
    else results.push(ok(`${key}`));
  }
  const csp = have.get('content-security-policy') ?? '';
  if (/'unsafe-(inline|eval)'/.test(csp)) results.push(fail('The CSP allows unsafe-inline or unsafe-eval'));
  return results;
}

// The headers vercel.json sends on every page.
export function siteHeaders(vercel) {
  return vercel.headers.find((rule) => rule.source === '/(.*)')?.headers ?? [];
}

// The browser bundle holds the project URL and the publishable key, and must
// never hold anything secret.
export function readBundle(source) {
  const url = source.match(/https:\/\/[a-z0-9]{20}\.supabase\.co/)?.[0] ?? null;
  const key = source.match(/sb_publishable_[A-Za-z0-9_-]+/)?.[0] ?? null;
  const secret = /sb_secret_[A-Za-z0-9_-]{8,}/.test(source) || containsServiceRoleJwt(source);
  return { url, key, secret };
}

function containsServiceRoleJwt(source) {
  for (const [token] of source.matchAll(/eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+/g)) {
    try {
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
      if (payload?.role === 'service_role') return true;
    } catch {
      // Not a token after all.
    }
  }
  return false;
}

// delete-account, called by nobody: it must be deployed, and it must refuse.
export function judgeFunction(preflightStatus, postStatus, postBody) {
  const results = [];
  if (preflightStatus === 404 || postStatus === 404) {
    results.push(fail('delete-account is not deployed, so no one can delete their account'));
    return results;
  }
  results.push(
    preflightStatus === 204 || preflightStatus === 200
      ? ok('delete-account answers the browser’s preflight')
      : fail(`delete-account refused the preflight with ${preflightStatus}; the browser cannot call it`),
  );
  results.push(
    postStatus === 401 && postBody?.error === 'unauthenticated'
      ? ok('delete-account refuses a request with no token')
      : fail(`delete-account answered a request with no token with ${postStatus}`, postStatus < 300 ? 'critical' : 'fail'),
  );
  return results;
}

export function ok(message) {
  return { ok: true, level: 'ok', message };
}

export function fail(message, level = 'fail') {
  return { ok: false, level, message };
}

export function summarize(name, results) {
  const failed = results.filter((result) => !result.ok);
  const lines = results.map((result) => `${result.ok ? '  ok  ' : result.level === 'critical' ? '  !!  ' : '  ✗   '}${result.message}`);
  const head = failed.length === 0 ? `${name}: healthy` : `${name}: ${failed.length} problem${failed.length === 1 ? '' : 's'}`;
  return { healthy: failed.length === 0, text: [head, ...lines].join('\n') };
}
