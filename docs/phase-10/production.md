# Phase 10: production deployment

**Goal:** hardened production.
**Deliverables (roadmap):** production on Supabase Pro with backups, a domain, headers, monitoring, a restore drill.
**Accepted when:** a restore from backup succeeds, and the headers score A.

Written 21 Sep 2026.

## Where it stands

| | Status |
|---|---|
| Headers score A | **Met: A+** on securityheaders.com (21 Sep): all six graded headers present, and no `unsafe-inline`. `Cross-Origin-Resource-Policy` added since. |
| Monitoring | **Built:** a health check from the outside, every three hours, on staging and production. |
| Production can't fall behind | **Built:** every merge now queues a production migration that waits for your approval. |
| Restore drill | **Ready to run** once production is on Pro. The fingerprint that proves it is built and tested. |
| Supabase Pro | **Yours to do** (step 4). |
| Domain | **Waiting on trademark and domain clearance** (brand §10). |

## What the first check found

Before this phase, production migrated only when someone remembered to run
**Migrate production** by hand. Nobody had since 20 Sep, and the app kept
deploying:

- **Five views missing:** `account_ledger`, `account_month_flow`,
  `category_month_totals`, `month_summary` and `recurring_item_months`. Every
  detail page added in #20–#25 fails in production.
- **`delete-account` not deployed.** No one can delete their account in
  production. The manual workflow never deployed it.
- **The `production` environment has no required reviewer.** `setup.md` asked
  for one; it was never added, so the only guard was typing a phrase.

The steps below fix all three, without touching production by hand.

## How production changes now

```
merge to main ──▶ App, Database, Browser ──▶ staging migrates, deploys the function
                                              │
                                              ▼
                             Production (waits for approval)
                               1. refuses unless production requires a reviewer
                               2. waits for you to approve
                               3. migrations, then delete-account
                               4. checks production from the outside
```

**Migrate production** can still be run by hand to retry. It runs the same
steps, gate included.

Vercel deploys the app the moment `main` changes, before you approve the
database. So:

- **Approve promptly.** Until you do, anything that needs the new migration
  fails in production.
- **Add before you remove.** A migration that drops something the running app
  still uses must ship after the app stops using it, never with it. Adding
  things is always safe in this order.

## Monitoring

`.github/workflows/health.yml` runs `scripts/health/cli.mjs` against staging
and production every three hours. It needs **no secrets**: it looks from the
outside, signed in as no one, which is exactly what it verifies.

| It checks | A failure means |
|---|---|
| The site loads, and a deep link reaches the app | Vercel or the SPA rewrite is broken |
| Every header matches `vercel.json`, and the CSP has no `unsafe-*` | Headers drifted or disappeared |
| The bundle holds only the publishable key | **Incident:** a secret reached the browser |
| Auth is up | Supabase Auth is down, or the project paused |
| Every table and view the migrations create **exists** | The database is behind the app. Approve the pending production run. |
| …and **refuses** a signed-out request | **Incident:** anyone can read it |
| `delete-account` is deployed, answers the preflight, and refuses a request with no token | Account deletion is broken, or open |

Incidents print `!!`, everything else `✗`. GitHub emails a failed scheduled
run to whoever last changed the schedule. Run it yourself any time:

```bash
node scripts/health/cli.mjs https://lodestar-mari-s-org.vercel.app
```

GitHub turns schedules off in a public repository after 60 days without a
commit. If the emails stop, check that **Actions → Health** is still enabled.

## The restore drill

A backup is only a backup once it has been restored. On Pro:

1. Pick a quiet moment. Make no changes in production between the backup you
   restore and step 3, or the drill will rightly report a difference.
2. **Database → Backups**, choose the latest, **Restore to a new project**.
   Never restore over production.
3. When the new project is up, run the fingerprint on both, from this folder:

   ```bash
   psql "<production connection string>" -f supabase/checks/fingerprint.sql > production.txt
   psql "<restored connection string>"   -f supabase/checks/fingerprint.sql > restored.txt
   diff production.txt restored.txt
   ```

   **Silence means the restore is identical.** Each line is a table's row
   count, an md5 over every row, and when the table last changed. No amount,
   description or name appears, so the files are safe to keep. A difference
   names the table, and `last_changed` says whether production simply moved
   on after the backup.

4. Run the isolation gate on the restore too. It must print nothing:

   ```bash
   psql "<restored connection string>" -f supabase/checks/rls_gate.sql
   ```

5. Record the date and result at the bottom of this file. Then **pause and
   delete the restored project**: it is a second copy of real data.

The fingerprint runs in the schema check and, through `psql`, against the
real Supabase stack in CI, so it will work on the day it's needed.

## Your steps, in order

1. **Require a reviewer on production.** GitHub → Settings → Environments →
   **production** → tick **Required reviewers**, add yourself, **Save**.
   Leave **Prevent self-review** unticked, or you can't approve your own runs.
2. **Give the production token deploy rights.** The `production` environment
   has its own `SUPABASE_ACCESS_TOKEN`. Like staging's, it needs **Edge
   Functions: Read-write**. Make a new token if needed, and replace the
   secret in the **production** environment.
3. **Merge this phase's PR, then approve the production run** (Actions → the
   run → **Review deployments** → approve). That applies the two missing
   migrations, deploys `delete-account`, and ends with the health check,
   which should print `healthy`.
4. **Move production to Pro.** Then, in production's Authentication
   settings, turn on **Prevent use of leaked passwords** (Phase 9, finding 4).
   Pro keeps daily backups; the first one appears the day after upgrading.
5. **Run the restore drill** above, once a backup exists.
6. **Clear your real data out of staging** (Phase 9, finding 2): sign in
   there and use Settings → Delete your Lodestar account. Notion still has
   all of it.
7. **The domain, once cleared** (brand §10). Then, in one sitting:
   - Vercel → Domains: add it to production.
   - Supabase production → Authentication → URL Configuration: the new
     **Site URL**, and `https://<domain>/auth/confirm` as a redirect URL.
   - Resend: verify the domain, turn click tracking **off**, and point
     production's custom SMTP at it.
   - GitHub → Settings → Variables: set `PRODUCTION_SITE_URL` to the new
     address, so the health check follows it.
   - Optionally, set `APP_ORIGINS` on the function
     (docs/phase-9/account-deletion.md).

## Drill log

| Date | Backup | Result |
|---|---|---|
| — | — | Not run yet: production is not on Pro. |
