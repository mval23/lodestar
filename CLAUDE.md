# Lodestar

Private personal-finance web app for individuals. Each person has their own private account, with no shared or household access: accounts, manual transactions, categories, transfers, budgets, goals, bills and subscriptions, cash-flow and net-worth reports, and CSV import/export. Bank sync comes later.

Lodestar replaces the owner's Notion finance system. The approved research and implementation proposal (Sep 19, 2026) is at https://claude.ai/artifact/6Px7mnvRd3nX34Q982daMv. This file carries its binding decisions.

## Guiding principle: store facts, compute everything else

Many columns, formulas, views and pages in the Notion system exist only because of Notion's limitations. Migrate the **data** and the **intent**, never the **mechanics**. If a Notion structure only exists to compute, display or navigate, it does not become a table, column or screen. Do not recreate:
- Direction signaled by empty relations. Use an explicit `kind`.
- Savings flagged by category names. Savings are transfers into a goal's account.
- Stored balances, rollups, "This Month"/"Last month"/"Year" flags, Spent/Left/Usage columns. These are queries.
- Rounding to hide float noise. Money is integers.
- "Left" clamped at zero. Show "Over plan by".
- A Summary table, per-account views, templates stored as data, a Seldom flag, a tag field, or an Errors view. Use constraints so invalid rows can't be saved.

## Scope

- **Every record belongs to exactly one user.** There are no workspaces, households, memberships, invitations, roles or sharing. Don't add them.
- **MVP:** register, log in, reset password, profile; accounts (checking, savings, credit card, cash, investment balance, loan, other asset such as money owed to me); manual income and expenses; transfers; categories with groups; search, filter, sort; monthly budgets; goals; bills and subscriptions with "Mark as paid"; Overview; cash-flow and net-worth reports; CSV import (with review) and export; export all data; delete account; one-time Notion import.
- **Soon after launch:** optional TOTP MFA, Year in review, statement reconciliation, budget rollover.
- **Excluded:** bank sync (MVP), currency conversion, mixing currencies in one user's data, collaboration of any kind, migrating legacy Notion systems.

## Stack

- Vite + React + TypeScript, deployed on Vercel (Hobby; Lodestar will not charge users). React Router, TanStack Query, React Hook Form + Zod, Radix UI primitives, Lucide icons (1.75 px), visx for charts, Papa Parse for CSV, date-fns + @date-fns/tz.
- Supabase: Auth, Postgres and the Data API. Row Level Security is the only authorization layer.
- **No custom backend.** Business rules live in Postgres (constraints, views with `security_invoker = true`, `SECURITY INVOKER` RPCs with `set search_path = ''`). The only Edge Function is `delete-account`. Storage is not used in the MVP.
- Environments: local (Supabase CLI, synthetic seed), staging (synthetic data only, used by Vercel previews), production. Schema changes only through SQL migrations in git, applied by CI. Never edit production by hand.
- Use custom SMTP for auth email. Supabase's built-in email is only for testing.
- Move production to Supabase Pro (backups, no pausing) before anyone other than the owner stores real data.

## Money, currency and dates

- Each user chooses **USD or COP** at first run, stored on `profiles.currency`. Every account and amount uses it, and nothing is converted. It can be changed only while the user has no transactions.
- Amounts are `bigint` minor units: USD in cents, COP in whole pesos (exponent 0). Never use floats for money. Sums run in SQL; the browser only parses and formats.
- Display with `Intl.NumberFormat('en-US')`: `$1,234.50` for USD and `COP 1,200,000` for pesos. Negatives use a true minus sign (U+2212).
- Transactions store `occurred_on date` (no time). "Today" and "this month" come from the profile's IANA time zone.
- CSV import must ask for the date order (DD/MM vs MM/DD).

## Data model

Tables, all user-owned except `currencies`: `profiles`, `accounts`, `category_groups`, `categories`, `transactions`, `budgets`, `goals`, `recurring_items`, `import_batches`, `audit_events`, plus the read-only `currencies` reference (USD, COP).

- **transactions:** one row per event, with `kind` (expense | income | transfer), `amount_minor > 0`, `from_account_id` and `to_account_id`. Direction check: expense has from only, income has to only, transfer has both and they differ. Transfers never carry a category. `notes`, `status` (cleared | pending), `recurring_item_id`, `import_batch_id`, and `source_ref` (unique per user, so imports are idempotent).
- **accounts:** `opening_balance_minor` (liabilities negative). The balance is a view: opening + money in − money out. Archive accounts that have history; hard delete only when there are none.
- **categories:** `kind` is expense or income only. There are no savings categories. Archive or merge instead of deleting used ones. Pickers are ordered by recent use.
- **budgets:** one row per category per month (`month` is the first of the month). Spent counts expenses only. Left may go negative. `copy_budgets(from, to)` starts a new month.
- **goals:** exactly one fund account each (`account_id` unique), with optional `target_minor`, `target_date` and `monthly_plan_minor`. Contributions are transfers into that account.
- **recurring_items (bills and subscriptions):** the schedule is a cadence unit (week, month or year), an interval of 1–12, and `next_due_on` (month-end dates clamp). `mark_bill_paid` inserts the transaction and advances the due date in one database transaction.
- Every table has `created_at` and `updated_at`.

## Security and privacy (non-negotiable)

- Every user-owned table: `user_id uuid not null default auth.uid() references auth.users on delete cascade`, RLS enabled, four policies for `authenticated` keyed to `user_id = (select auth.uid())`. No grants to `anon`.
- References between a user's rows use composite foreign keys `(user_id, id)`, so no row can point at another user's data.
- `user_id` is never updatable: use column-level UPDATE grants plus a trigger.
- The only `SECURITY DEFINER` functions are the sign-up profile trigger and `log_event` (fixed event names, caller's own id).
- The service-role key lives only in Edge Function secrets, never in Vercel or the browser. The browser holds only the public key.
- Every new table needs pgTAP cross-user tests (select, insert as another user, reassign, delete, foreign reference). CI fails if any `public` table lacks RLS or its four policies.
- Strict CSP, no third-party scripts, HSTS. Re-authenticate for export and account deletion. Audit export, import and bulk delete without recording amounts or descriptions.
- Account deletion is immediate after typed confirmation ("Delete account and its 318 transactions"), cascades all rows, and discloses that backups age out.
- Never put real financial data in fixtures, seeds, logs, screenshots or tests. Use synthetic data.

## Notion migration (one time)

- Source is the active "Finances" hub only (Transactions, Accounts, Category). Ignore the inactive copy, "Finances Old", "Personal Finance Tracker" and Maki Hub. Notion is read-only: never write to it.
- Extract with a read-only integration keyed by Notion page ids, on the owner's machine. Import as the owner (their JWT, never the service role) through the same import RPC as CSV. The token is never committed and is revoked after cutover.
- Amounts are USD. Map kind from Source/Destination. Drop categories from transfers; savings transfers become contributions to the destination account's goal. Each of the three Notion savings categories becomes goals, one per destination fund account. The Sinking Funds budget is split across its fund goals by each fund's share of the last 6 months of contributions. Tags are appended to `notes`. The money-owed fund becomes an `other_asset` account.
- Parity rules come from the owner's formulas: Current Balance = Starting Balance + In − Out. Reconcile every account balance and every monthly total by kind to the cent before cutover. Lodestar shows real overages where Notion's Left showed 0.
- Rollback: delete the import batch and unlock Notion. Keep Notion locked read-only for at least 90 days.

## Brand and design: read before any UI, copy or asset work

The full spec is in @brand/BRAND.md. Tokens are in `brand/tokens.css` and `brand/tokens.json`, logo files in `brand/logo/`, and the visual guide is in `brand/lodestar-identity.html`.

Non-negotiables:
- **Name** Lodestar · **tagline** "Know where you stand." · **English only** (no Spanish or other localization).
- **Style:** Apple-style interface: system font (`-apple-system, BlinkMacSystemFont, "Inter", ...`), large bold titles with tight tracking, grouped white lists on a Stone background, glass only on navigation, capsule buttons, and springy but unbouncy motion.
- **Color:** mostly monochrome in Stone greys (`#F5F4F1` background, `#1C1A17` ink). **Electric blue `#1F4BFF`** (dark mode `#6F8BFF`) is the only accent. Use it only for interactive elements, the logo fix, the "now" marker, and the one key-figure bracket per screen. Always use the tokens; never hard-code hex values in product code.
- **Logo:** Axes & Fix: `<path d="M2 2H5V11H14V14H2Z"/>` plus `<rect x="8" y="5" width="3" height="3"/>` on a 16-unit grid. Ink axes and a blue fix. Keep it sharp: never rotate, round, restyle or redraw it.
- **Numbers:** `tabular-nums` on every amount, a true minus sign (U+2212), right-aligned amount columns.
- **Charts:** money in is ink and money out is grey; blue marks only "now." Never show gains and losses as red versus green.
- **Voice:** calm, specific, never shaming. No "financial freedom," "guaranteed," "get rich," "bank-grade security," or "workspace."
- **Navigation:** desktop sidebar (Overview, Activity, Accounts, Budgets, Bills, Goals, Reports; Import & export and Settings at the bottom). Mobile tab bar (Overview, Activity, Budgets, Goals); Bills sits under Budgets, and Reports is reached from Overview.
- Rejected directions (don't bring them back): spruce/brass palette, vivid multi-color palettes, the name Constella.
