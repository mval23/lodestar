# Phase 4: user-level data isolation

**Goal:** prove isolation before anything real is stored.
**Accepted when:** every table passes the cross-user matrix, and the Supabase advisor reports no RLS warnings.

| | |
|---|---|
| Suite | `supabase/tests/database/*.test.sql` (pgTAP) |
| Command | `supabase test db` (needs `supabase start`) |
| Gate | `supabase/checks/rls_gate.sql`, run by CI before the suite |
| Fast check, no Docker | `npm run schema:check` (PGlite, 140 checks) |
| Result | **112 tests, all passing** against Supabase Postgres 17 in CI |

## What the suite asserts

### `00_structure.test.sql` — 14 checks

Every rule is written as a search for counter-examples, so a table added later cannot quietly opt out. There is no allowlist to forget to update.

- RLS enabled on every table in `public`.
- One policy per command for `authenticated`, and no `FOR ALL` policies. A command a table does not allow still carries an explicit `false` policy, which is how `currencies` (read-only) and `audit_events` (append-only) pass the same gate.
- No policy addressed to `anon` or to `PUBLIC`.
- `anon` holds no privilege on any table or view, and can execute no function in `public`.
- Every view is `security_invoker`, so RLS follows through it.
- `handle_new_user` and `log_event` are the only `SECURITY DEFINER` functions.
- Every user-owned table has a non-null `uuid` owner column, `user_id` defaults to `auth.uid()`, and the row cascades when the auth user is deleted.
- `authenticated` holds no INSERT or UPDATE grant on `user_id`.
- Every user-owned table has a unique `(user_id, id)`, and **every reference between user-owned tables includes `user_id`**.

### `10_cross_user.test.sql` — the matrix

Two synthetic people, A and B. For each of the ten user-owned tables — `profiles`, `accounts`, `category_groups`, `categories`, `transactions`, `budgets`, `goals`, `recurring_items`, `import_batches`, `audit_events` — B attempts to:

1. read A's rows (sees none, while still seeing its own);
2. update A's row (matches nothing, or the grant itself is withheld);
3. delete A's row (same);
4. insert a row already owned by A (refused: no grant on `user_id`);
5. hand its own row to A (refused).

### `20_references_anon_cascade.test.sql`

- Eight ways B might reference A's data — a transaction drawn on A's account, filed under A's category, tied to A's bill or import batch; a budget for A's category; a goal backed by A's account; a category inside A's group; a bill drawn on A's account — each refused with a foreign-key violation, because the composite keys carry `user_id`.
- B cannot reach A's bill through `mark_bill_paid` either.
- `anon` is refused on every table and view in `public`, on writes, and on every RPC.
- Deleting an auth user removes all of that person's rows across all ten tables, and leaves B's untouched.

## The suite is known to fail

A passing suite that has never failed proves nothing. A temporary migration added one permissive policy:

```sql
create policy accounts_select_everyone on public.accounts for select to authenticated using (true);
```

CI failed as it should: pgTAP reported `not ok 2 - accounts: B cannot read A's rows`, and the PGlite harness failed alongside it. The mutation was then reverted; it was never merged.

## What this does not cover

- **The Supabase advisor.** Run **Advisors → Security** on staging and production after every migration. Its checks overlap but are not identical, and it sees the hosted configuration.
- **The Data API layer.** These tests speak SQL. PostgREST adds its own behavior around column grants and `select=*` on returning clauses; that needs an end-to-end check in Phase 5, when the app starts writing rows.
- **Concurrency.** No parallel sessions, so lock behavior in `mark_bill_paid` and overlapping imports stay unexercised.
- **Performance.** No `EXPLAIN` at realistic volume.
- **The Edge Function.** `delete-account` does not exist yet; it arrives with account deletion.

## Adding a table later

The gate and `00_structure` cover new tables automatically. What they cannot generate is the matrix, so when a table is added:

1. Add it to `owned_tables` in `00_structure.test.sql`.
2. Add a row to the `matrix` table in `10_cross_user.test.sql`: its owner column, a synthetic row for A and for B, a harmless update, and an insert that carries A's `user_id`.
3. If it references another user-owned table, add the reference case to `20_references_anon_cascade.test.sql`.
