#!/usr/bin/env node
// The one-time Notion migration, in four steps you run yourself:
//
//   node scripts/notion/cli.mjs extract     reads Notion, writes notion-extract.json
//   node scripts/notion/cli.mjs plan        turns the extract into a plan and a report
//   node scripts/notion/cli.mjs import      applies the plan to Lodestar, as you
//   node scripts/notion/cli.mjs verify      checks the result matches Notion, to the cent
//   node scripts/notion/cli.mjs undo        deletes the import batches again
//
// Nothing here writes to Notion, ever. The working files hold real financial
// data and are kept out of the repository by .gitignore.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import path from 'node:path';
import { extract } from './extract.mjs';
import { planMigration } from './transform.mjs';
import {
  balancesFromPlan,
  compareBalances,
  compareMonthlyTotals,
  monthlyTotalsFromPlan,
  reconciliationReport,
} from './reconcile.mjs';
import { applyPlan, readBalances, readMonthlyTotals, signIn, undo } from './import.mjs';

const DIR = path.resolve(process.cwd(), 'migration');
const EXTRACT_FILE = path.join(DIR, 'notion-extract.json');
const PLAN_FILE = path.join(DIR, 'plan.json');
const REPORT_FILE = path.join(DIR, 'reconciliation.md');
const BATCHES_FILE = path.join(DIR, 'batches.json');

const need = (name) => {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing ${name}. See docs/phase-8/migration.md.`);
    process.exit(1);
  }
  return value;
};

function ask(question, { silent = false } = {}) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    let hide = false;
    // Keeps a typed password off the screen, and out of any screen recording.
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

const readJson = async (file) => JSON.parse(await readFile(file, 'utf8'));

// The working folder is created on demand: it is gitignored, so a fresh clone
// never has one, and losing an extract to a missing folder after reading
// 1,688 rows would be a poor joke.
async function writeOut(file, contents) {
  await mkdir(DIR, { recursive: true });
  await writeFile(file, contents, 'utf8');
}

const writeJson = (file, value) => writeOut(file, `${JSON.stringify(value, null, 2)}\n`);

async function main() {
  const command = process.argv[2];

  if (command === 'extract') {
    const data = await extract({
      token: need('NOTION_TOKEN'),
      accountsDb: need('NOTION_ACCOUNTS_DB'),
      categoriesDb: need('NOTION_CATEGORIES_DB'),
      transactionsDb: need('NOTION_TRANSACTIONS_DB'),
    });
    await writeJson(EXTRACT_FILE, data);
    console.log(
      `Read ${data.transactions.length} transactions, ${data.accounts.length} accounts and ${data.categories.length} categories.`,
    );
    console.log(`Written to ${EXTRACT_FILE}. Notion was not modified.`);
    return;
  }

  if (command === 'plan') {
    const data = await readJson(EXTRACT_FILE);
    const savings = (process.env.NOTION_SAVINGS_CATEGORIES ?? '')
      .split(',')
      .map((name) => name.trim())
      .filter(Boolean);
    if (savings.length === 0) {
      console.warn('No NOTION_SAVINGS_CATEGORIES set: no savings category will become a goal.');
    }

    const plan = planMigration({ ...data, savingsCategoryNames: savings });
    const balances = balancesFromPlan(plan);
    const report = reconciliationReport({
      plan,
      balances: compareBalances(
        balances.map((account) => ({ name: account.name, balance_minor: account.balance_minor })),
        balances,
      ),
      monthly: compareMonthlyTotals(monthlyTotalsFromPlan(plan), monthlyTotalsFromPlan(plan)),
    });

    await writeJson(PLAN_FILE, plan);
    await writeOut(REPORT_FILE, report);
    console.log(`${plan.transactions.length} transactions ready, ${plan.review.length} need a decision.`);
    console.log(`Plan: ${PLAN_FILE}`);
    console.log(`Read ${REPORT_FILE} before importing.`);
    return;
  }

  if (command === 'import') {
    const plan = await readJson(PLAN_FILE);
    console.log(
      `About to import ${plan.transactions.length} transactions, ${plan.accounts.length} accounts and ${plan.categories.length} categories.`,
    );
    const confirm = await ask('Type "import" to continue: ');
    if (confirm !== 'import') {
      console.log('Nothing was imported.');
      return;
    }

    const email = await ask('Your Lodestar email: ');
    const password = await ask('Password: ', { silent: true });
    const { supabase } = await signIn({
      url: need('VITE_SUPABASE_URL'),
      publishableKey: need('VITE_SUPABASE_PUBLISHABLE_KEY'),
      email,
      password,
    });

    const result = await applyPlan(supabase, plan, { onProgress: (message) => console.log(message) });
    await writeJson(BATCHES_FILE, result.batches.map((batch) => batch.batch_id));
    console.log(`Imported ${result.inserted} transactions; ${result.duplicates} were already there.`);
    console.log(`Batch ids written to ${BATCHES_FILE}. Run "verify" next.`);
    return;
  }

  if (command === 'verify') {
    const plan = await readJson(PLAN_FILE);
    const email = await ask('Your Lodestar email: ');
    const password = await ask('Password: ', { silent: true });
    const { supabase } = await signIn({
      url: need('VITE_SUPABASE_URL'),
      publishableKey: need('VITE_SUPABASE_PUBLISHABLE_KEY'),
      email,
      password,
    });

    const balances = compareBalances(
      balancesFromPlan(plan).map((account) => ({ name: account.name, balance_minor: account.balance_minor })),
      await readBalances(supabase),
    );
    const monthly = compareMonthlyTotals(monthlyTotalsFromPlan(plan), await readMonthlyTotals(supabase));
    const report = reconciliationReport({ plan, balances, monthly });
    await writeOut(REPORT_FILE, report);

    console.log(report.split('\n').slice(0, 12).join('\n'));
    console.log(`\nFull report: ${REPORT_FILE}`);
    if (balances.ok && monthly.ok) {
      console.log('\nEvery account and every month matches to the cent.');
    } else {
      console.error('\nSomething does not match. Do not cut over; read the report.');
      process.exitCode = 1;
    }
    return;
  }

  if (command === 'undo') {
    const batchIds = await readJson(BATCHES_FILE);
    const confirm = await ask(`Type "undo" to delete ${batchIds.length} import batches and their rows: `);
    if (confirm !== 'undo') {
      console.log('Nothing was deleted.');
      return;
    }
    const email = await ask('Your Lodestar email: ');
    const password = await ask('Password: ', { silent: true });
    const { supabase } = await signIn({
      url: need('VITE_SUPABASE_URL'),
      publishableKey: need('VITE_SUPABASE_PUBLISHABLE_KEY'),
      email,
      password,
    });
    await undo(supabase, batchIds);
    console.log('The import batches and every transaction in them are gone.');
    console.log('Accounts, categories and goals were created separately; remove them in the app if you want a clean slate.');
    return;
  }

  console.log(`Usage: node scripts/notion/cli.mjs <extract|plan|import|verify|undo>

  extract   read the Notion hub into migration/notion-extract.json
  plan      turn the extract into migration/plan.json and a reconciliation report
  import    apply the plan to Lodestar, signing in as you
  verify    compare Lodestar with Notion, to the cent
  undo      delete the import batches again

See docs/phase-8/migration.md.`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
