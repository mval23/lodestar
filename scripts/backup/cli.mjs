#!/usr/bin/env node
// Your own backups, because the free tier takes none:
//
//   npm run backup                     writes backups/lodestar-<when>.json
//   npm run backup verify <file>       checks a file against a live account
//   npm run restore <file>             puts a backup into an EMPTY account
//
// It signs in with your own email and password and reads and writes through
// Row Level Security, exactly as the app does: no service-role key, no third
// party. The file stays on your machine. backups/ is ignored by git, because
// the file holds real financial data.
//
// Point it at a project with the two variables the app uses:
//
//   VITE_SUPABASE_URL=https://<project>.supabase.co \
//   VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_… \
//   npm run backup
//
// See docs/phase-10/production.md.

import { createClient } from '@supabase/supabase-js';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import path from 'node:path';
import { readBackup } from './plan.mjs';
import { createBackup, restoreBackup, verifyBackup } from './runner.mjs';

const DIR = path.resolve(process.cwd(), 'backups');

const [command = 'backup', file] = process.argv.slice(2);
if (!['backup', 'restore', 'verify'].includes(command)) {
  console.error('Usage: node scripts/backup/cli.mjs [backup | verify <file> | restore <file>]');
  process.exit(2);
}

function env(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing ${name}. See docs/phase-10/production.md.`);
    process.exit(1);
  }
  return value;
}

// The same prompt the Notion tooling uses: a typed password never reaches the
// screen, or a screen recording.
function ask(question, { silent = false } = {}) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    let hide = false;
    rl._writeToOutput = (chunk) => {
      if (!hide) rl.output.write(chunk);
    };
    rl.question(question, (answer) => {
      rl.close();
      if (silent) process.stdout.write('\n');
      resolve(String(answer).trim());
    });
    hide = silent;
  });
}

async function connect() {
  const url = env('VITE_SUPABASE_URL');
  const key = env('VITE_SUPABASE_PUBLISHABLE_KEY');
  const project = new URL(url).host;
  console.log(`Project: ${project}`);
  const email = await ask('Email: ');
  const password = await ask('Password: ', { silent: true });
  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    console.error(`Could not sign in: ${error.message}`);
    process.exit(1);
  }
  return { supabase, userId: data.user.id, project };
}

const show = (table, count) => console.log(`  ${String(count).padStart(6)}  ${table}`);
const total = (counts) => Object.values(counts).reduce((sum, count) => sum + count, 0);

function report(problems, whenWhole) {
  if (problems.length === 0) {
    console.log(`\n${whenWhole}`);
    return;
  }
  console.log('\nDifferences:');
  for (const problem of problems) console.log(`  ${problem}`);
  process.exitCode = 1;
}

function needFile() {
  if (file) return path.resolve(file);
  console.error(`Which file? node scripts/backup/cli.mjs ${command} backups/<file>.json`);
  process.exit(2);
}

async function backup() {
  const { supabase, userId, project } = await connect();
  console.log('Reading…');
  const out = await createBackup(supabase, { project, userId, onProgress: show });

  await mkdir(DIR, { recursive: true });
  const name = `lodestar-${out.taken_at.slice(0, 19).replace(/[:T]/g, '-')}.json`;
  await writeFile(path.join(DIR, name), JSON.stringify(out, null, 2));
  console.log(`\nSaved ${total(out.counts)} rows to backups/${name}`);
  console.log('It holds your real finances: keep it somewhere you trust, and out of the repository.');
}

async function verify() {
  const target = needFile();
  const wanted = readBackup(await readFile(target, 'utf8'));
  const { supabase } = await connect();
  console.log('Reading…');
  report(await verifyBackup(supabase, wanted), `The account matches ${path.basename(target)} exactly, row for row.`);
}

async function restore() {
  const target = needFile();
  const wanted = readBackup(await readFile(target, 'utf8'));
  const { supabase, userId, project } = await connect();

  console.log(`\nAbout to restore into ${project}.`);
  console.log(`  Taken ${wanted.taken_at} from ${wanted.project}.`);
  console.log(`  ${total(wanted.counts)} rows.`);
  if (wanted.user_id !== userId) console.log('  Taken from a different account than the one you just signed in to.');

  if ((await ask('\nType "restore" to go ahead: ')) !== 'restore') {
    console.log('Nothing was written.');
    return;
  }

  const problems = await restoreBackup(supabase, wanted, { userId, onProgress: show });
  report(problems, 'Restored. Every row matches the backup.');
}

try {
  if (command === 'backup') await backup();
  else if (command === 'verify') await verify();
  else await restore();
} catch (cause) {
  console.error(`\n${cause?.message ?? cause}`);
  process.exit(1);
}
