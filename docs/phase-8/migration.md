# Phase 8: the Notion migration

**Goal:** a repeatable, idempotent import from Notion.
**Accepted when:** a trial on staging reconciles every account balance and every monthly total to the cent.

This runs on your machine, once. Notion is only ever read.

| | |
|---|---|
| Tooling | `scripts/notion/` (`extract`, `plan`, `import`, `verify`, `undo`) |
| Working files | `migration/` — **gitignored**, because it holds real financial data |
| Rules under test | `scripts/notion/transform.test.mjs` — 22 tests, synthetic data only |
| Source | the active **Finances** hub: Transactions, Accounts, Category |

## What it migrates, and what it deliberately leaves behind

| Notion | Lodestar |
|---|---|
| Source / Destination relations | an explicit `kind`: expense, income or transfer |
| Amount (a positive number) | `amount_minor`, integer cents; direction comes from the kind, never a sign |
| Account, Account Type, Starting Balance | an account with `opening_balance_minor` |
| A savings category on a transfer | a **goal** on the destination account; the transfer keeps no category |
| The Sinking Funds budget | split across those goals by each fund's share of the last 6 months of contributions |
| `tag` | appended to `notes`, since Lodestar has no tag field |
| The money-owed fund | an `other_asset` account |
| Current Balance, Spent, Left, This Month, rollups | **not migrated** — they are queries in Lodestar |
| Summary, templates, per-account views, the Errors view | **not migrated** — they were workarounds for Notion |

The inactive copy, *Finances Old*, *Personal Finance Tracker* and Maki Hub are out of scope and are never read.

Every row is keyed by its Notion page id (`source_ref = notion:<page id>`), so **running the import twice inserts nothing the second time**.

## Before you start

1. In Notion, create an **internal integration** with **read** capability only. No insert, no update.
2. Share the three databases with it: Transactions, Accounts, Category.
3. Copy the integration token and the three database ids.
4. Decide which category names mean saving — in the hub there are three.

Set these in your shell. **The token is never committed, and you revoke it after cutover.**

```bash
export NOTION_TOKEN="ntn_…"
export NOTION_ACCOUNTS_DB="…"
export NOTION_CATEGORIES_DB="…"
export NOTION_TRANSACTIONS_DB="…"
export NOTION_SAVINGS_CATEGORIES="Sinking Funds,Emergency,Travel"
export VITE_SUPABASE_URL="https://<staging ref>.supabase.co"
export VITE_SUPABASE_PUBLISHABLE_KEY="sb_publishable_…"
```

Point at **staging** for the trial. Only change these to production at cutover.

## The four steps

### 1. Extract

```bash
node scripts/notion/cli.mjs extract
```

Reads the three databases and writes `migration/notion-extract.json`. Notion is not modified, and this is the only step that needs the token.

### 2. Plan

```bash
node scripts/notion/cli.mjs plan
```

Turns the extract into `migration/plan.json` and writes **`migration/reconciliation.md`**, which is the file to actually read. It tells you:

- how many transactions, accounts, categories and goals are ready;
- what each account balance will be, computed as *Starting Balance + In − Out*, your own formula;
- every month's totals by kind;
- **every row that needs a decision** — no direction, no date, no amount, a negative amount, a transfer to itself, or a reference to something missing — with its Notion page id;
- **possible duplicates**: same date, amount and description. These are still imported, because two identical purchases in one day are ordinary and only you can tell.

Fix anything you want to fix in Notion, then run `extract` and `plan` again. Nothing has been written to Lodestar yet.

### 3. Import

```bash
node scripts/notion/cli.mjs import
```

Asks you to type `import`, then for your Lodestar email and password. It signs in as you and uses that session, so **every insert passes through Row Level Security exactly as it would from the app**. The service-role key is never used, and the script does not have it.

Transactions go through the `import_transactions` function in batches of 500: one database transaction each, duplicates skipped by `source_ref`, and the audit event written by the function itself with a row count and no amounts. The batch ids are saved to `migration/batches.json`.

### 4. Verify

```bash
node scripts/notion/cli.mjs verify
```

Reads back what Lodestar now reports and compares it with the plan, account by account and month by month. It rewrites `migration/reconciliation.md` with both columns side by side, and **exits non-zero if anything differs by so much as a cent**.

## If something is wrong

```bash
node scripts/notion/cli.mjs undo
```

Deletes the import batches; every transaction they created goes with them, by cascade. Accounts, categories and goals were created as ordinary rows, so remove those in the app if you want a completely clean slate.

## Cutover

Do the trial on staging first, and only then:

1. Stop entering transactions in Notion. Lock the databases read-only.
2. Point `VITE_SUPABASE_URL` and the key at **production**.
3. `extract` → `plan` → read the report → `import` → `verify`.
4. Sign off only when verify says every account and every month matches.
5. **Revoke the Notion integration token.**
6. Keep Notion locked and read-only for **at least 90 days** before archiving it.

If anything was entered in Notion during the freeze, extract and import again: the `source_ref` keys mean only the new rows land.

## Known limits

- **Budgets have no history in Notion.** Each category holds a single current budget, so it becomes *this month's* plan. Earlier months get no budget, because Notion never stored one.
- **Lodestar shows real overages** where Notion's Left clamped at zero. A category you went over will read "Over plan by", which is the point.
- **Income categories don't exist in the hub**, so every migrated category is an expense category.
- The extract reads the property names of the current hub. If a property was renamed, pass the new names through `properties` in `extract.mjs` rather than letting it migrate nothing.
