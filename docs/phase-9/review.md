# Phase 9: testing, accessibility and security review

**Goal:** release confidence.
**Accepted when:** no open high-severity findings, and WCAG 2.2 AA checks pass.

Reviewed 20 Sep 2026, against `main` plus the Phase 9 branch.

## What is tested now

| Suite | What it covers | Count |
|---|---|---|
| Unit and component (`npm test`) | money, dates, CSV rules, auth copy, the Notion transform, every feature's logic and forms | 212 |
| Database (`supabase test db`) | RLS, the cross-user matrix for all ten tables, composite keys, `anon`, the cascade | 112 |
| Schema smoke (`npm run schema:check`) | the migration applied to PGlite, constraints, views, RPCs | 140 |
| End to end (`npm run e2e`) | real browser, production build, production headers, desktop and phone | 72 |

The end-to-end suite stubs Supabase at the network boundary. That is deliberate: the database's own behaviour is covered against a **real** Postgres by pgTAP, where it can be tested honestly, and the browser tests then cover what the app does with the answers. What neither covers is the seam between them on a live project — see finding 5.

## What the end-to-end suite found

Two faults that every other check had missed:

1. **Choosing an account closed the whole sheet.** A picker is a `<dialog>` inside the sheet's `<dialog>`, and React carries the inner `close` event to the outer handler. Unit tests missed it because jsdom's dialog is a shim; manual checks missed it because nobody had picked an option *inside* a sheet in a real browser. Each dialog now answers only for itself.
2. **`aria-sort` sat on the sort button** rather than the column header — a critical axe violation, and wrong for anyone reading the table with a screen reader.

## Accessibility

`@axe-core/playwright` runs WCAG 2.0/2.1/2.2 A and AA rules over every screen, signed out and in, in both themes, at desktop and phone width, with a sheet open and with a picker open. **No violations.**

Checked by hand as well, because automation catches roughly half of what matters:

- **Keyboard only:** a picker opens with Enter, moves with the arrows, chooses with Enter, closes with Escape leaving the choice alone. Escape closes a sheet without saving. Both are tested.
- **Amounts are spoken in words.** Every amount renders twice: the printed form, hidden from screen readers, and a spoken form, so `−$310.00` is read as "minus $310.00" rather than as a stray dash.
- **Meaning never rests on colour.** Over-plan budgets are hatched *and* say "Over plan by". Charts separate money in and out by lightness and label both.
- **Focus is always visible**, as a blue halo, from the token.

### Still to do by hand

- A pass with a real screen reader (VoiceOver or NVDA) through sign-up, adding a transaction, and reading the ledger.
- 200% browser zoom and a 320 px viewport.
- Reduce Motion and Reduce Transparency, both honoured in CSS but not yet observed.

## Security review

### Holding up well

- **Authorization is RLS, and only RLS.** Every user-owned table has four policies keyed to `auth.uid()`, proven by the cross-user matrix, and CI fails if a table ever ships without them.
- **The browser is given only the publishable key.** `lib/env.ts` refuses to start with a `sb_secret_` key or a service-role JWT, and a scan of the built bundle finds no secret — the one `service_role` string in it is that guard.
- **References carry `user_id`**, so a row cannot point at another person's data even if an id leaks.
- **Headers** verified live on staging: CSP without `unsafe-inline`, HSTS with preload, `frame-ancestors 'none'`, `nosniff`, `no-referrer`, a Permissions-Policy. The strict CSP is why the app has no third-party scripts, why the pickers are hand-built, and why Papa Parse runs without its blob worker.
- **Sessions:** PKCE, one-hour tokens, rotating refresh tokens, and re-authentication before export or a password change.
- **The audit log cannot hold money.** `audit_events` has no free-text column: an event name, a subject id and a row count.
- **Dependencies:** `npm audit` reports **0 vulnerabilities**, with and without dev dependencies.
- **No real financial data in tests, fixtures or seeds.** The migration's working files are gitignored.

### Findings

| # | Severity | Finding |
|---|---|---|
| 1 | **High** | **Account deletion is not built.** `CLAUDE.md` puts "delete account" in the MVP and names `delete-account` as the only Edge Function; there is no `supabase/functions` directory. A person cannot delete their own account or their data. This must ship before anyone's real data lives in production. |
| 2 | **High** | **Staging now holds real financial data.** The Phase 8 trial imported the owner's actual ledger into a Free-tier project with no backups, and preview deployments are unprotected. Either delete that data from staging, or treat staging as production-grade. |
| 3 | Medium | **Production is on the Free tier**: no backups, and the project pauses when idle. Phase 10 moves it to Pro; nothing real should be stored until then. |
| 4 | Medium | **Leaked-password protection is off** (a Pro feature) and **MFA is not enabled** (planned for Phase 12). Both are defences a finance app should want. |
| 5 | Medium | **No end-to-end test runs against a live Supabase**, so the seam between app and database — PostgREST behaviour around column grants, RPC argument shapes — is only covered by types and by hand. Two bugs have already come from exactly this seam. |
| 6 | Low | **Export and bulk-delete auditing depends on the client** calling `log_event`, because both are ordinary reads and deletes. Only import is audited by the database itself. Known since the Phase 2 review. |
| 7 | Low | **The privacy copy has not been through legal**, and the brand file still marks it as needing approval. It must not appear in the product until it has. |
| 8 | Low | **Initial JavaScript is ~212 KB gzipped** against a 200 KB budget. Not a security issue; noted so it is not forgotten. |

Findings 1 and 2 are the two that block launch.

## Privacy copy, for approval

Not in the product yet. Proposed wording, which needs legal sign-off before it appears anywhere:

> **Your data is yours.** Lodestar keeps your finances private to your account. We don't sell your data, and we don't use it for advertising.
>
> **What we store.** Your email address, and whatever you record: accounts, transactions, categories, budgets, goals and bills. We never see your bank credentials, because Lodestar doesn't connect to banks.
>
> **Who can see it.** Only you. Your rows are isolated in the database by your account, on every table, and that isolation is tested on every change.
>
> **Leaving.** You can export everything as CSV at any time, and delete your account whenever you like. Deleting removes your rows immediately. Backups age out within the provider's retention window, which is the one delay we can't avoid.

## Before launch

- [ ] Build account deletion, with the `delete-account` Edge Function (finding 1).
- [ ] Clear the owner's real data out of staging, or accept staging as production-grade (finding 2).
- [ ] Move production to Supabase Pro, and run a restore drill (finding 3, and Phase 10).
- [ ] Turn on leaked-password protection once on Pro (finding 4).
- [ ] Manual screen-reader pass, 200% zoom, 320 px reflow.
- [ ] Legal sign-off on the privacy copy (finding 7).
