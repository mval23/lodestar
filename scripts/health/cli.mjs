#!/usr/bin/env node
// Is a deployed Lodestar healthy? Checks one site from the outside, as a
// stranger would see it, and exits non-zero on any problem:
//
//   node scripts/health/cli.mjs https://lodestar-mari-s-org.vercel.app
//
// It needs no secrets and signs in as no one, so it can read nothing
// private — which is exactly what it verifies. See docs/phase-10/production.md.

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  expectedRelations,
  fail,
  judgeFunction,
  judgeHeaders,
  judgeRelation,
  ok,
  readBundle,
  siteHeaders,
  summarize,
} from './checks.mjs';

const site = process.argv[2]?.replace(/\/+$/, '');
if (!site || !/^https:\/\//.test(site)) {
  console.error('Usage: node scripts/health/cli.mjs https://<site>');
  process.exit(2);
}

const ROOT = process.cwd();
const TIMEOUT_MS = 15_000;

async function get(url, init = {}) {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS), redirect: 'manual' });
  const text = await response.text();
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    // Not JSON; the text is still there for the caller.
  }
  return { status: response.status, headers: Object.fromEntries(response.headers), text, body };
}

async function checkSite() {
  const results = [];
  const vercel = JSON.parse(await readFile(path.join(ROOT, 'vercel.json'), 'utf8'));

  const home = await get(site);
  results.push(home.status === 200 ? ok(`${site} loads`) : fail(`${site} answered ${home.status}`));
  results.push(...judgeHeaders(siteHeaders(vercel), home.headers));

  // A signed-in page, opened directly, must reach the app rather than a 404.
  const deep = await get(`${site}/settings`);
  results.push(deep.status === 200 ? ok('a deep link reaches the app') : fail(`a deep link answered ${deep.status}`));

  const script = home.text.match(/\/assets\/index-[A-Za-z0-9_-]+\.js/)?.[0];
  if (!script) return { results: [...results, fail('the page names no app bundle')], bundle: null };
  const bundle = readBundle((await get(`${site}${script}`)).text);
  results.push(bundle.secret ? fail('the browser bundle contains a secret key', 'critical') : ok('the bundle holds only the publishable key'));
  if (!bundle.url || !bundle.key) results.push(fail('the bundle names no Supabase project'));
  return { results, bundle };
}

async function checkDatabase({ url, key }) {
  const results = [];
  const headers = { apikey: key };

  const auth = await get(`${url}/auth/v1/health`, { headers });
  results.push(auth.status === 200 ? ok('Auth is up') : fail(`Auth answered ${auth.status}`));

  const dir = path.join(ROOT, 'supabase', 'migrations');
  const files = (await readdir(dir)).filter((file) => file.endsWith('.sql')).sort();
  const relations = expectedRelations(await Promise.all(files.map((file) => readFile(path.join(dir, file), 'utf8'))));
  for (const name of relations) {
    const answer = await get(`${url}/rest/v1/${name}?select=*&limit=1`, { headers });
    results.push(judgeRelation(name, answer.status, answer.body));
  }

  const fn = `${url}/functions/v1/delete-account`;
  const preflight = await get(fn, {
    method: 'OPTIONS',
    headers: { origin: site, 'access-control-request-method': 'POST', 'access-control-request-headers': 'authorization' },
  });
  const post = await get(fn, { method: 'POST' });
  results.push(...judgeFunction(preflight.status, post.status, post.body));
  return results;
}

let report;
try {
  const { results, bundle } = await checkSite();
  if (bundle?.url && bundle?.key) results.push(...(await checkDatabase(bundle)));
  report = summarize(site, results);
} catch (cause) {
  report = summarize(site, [fail(`could not finish: ${cause?.message ?? cause}`)]);
}

console.log(report.text);
process.exit(report.healthy ? 0 : 1);
