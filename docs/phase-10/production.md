# Phase 10: production deployment

**Goal:** hardened production.
**Deliverables (roadmap):** production on Supabase Pro with backups, a domain, headers, monitoring, a restore drill.
**Accepted when:** a restore from backup succeeds, and the headers score A.

**Amended 22 Sep 2026:** the owner decided not to buy Pro. Production stays
on the free tier, which takes no backups, so Lodestar takes its own
(`npm run backup`), and the drill proves those instead. Everything else in
the phase stands, and "a restore from backup succeeds" is still the bar.

Written 21 Sep 2026.

## Where it stands

| | Status |
|---|---|
| Headers score A | **Met: A+** on securityheaders.com (21 Sep): all six graded headers present, and no `unsafe-inline`. `Cross-Origin-Resource-Policy` added since. |
| Monitoring | **Built:** a health check from the outside, every three hours, on staging and production. |
| Production can't fall behind | **Built:** every merge now queues a production migration that waits for your approval. |
| Restore drill | **Ready to run:** back up production, restore into an emptied staging, and the restore checks itself row for row. |
| Backups | **Built:** `npm run backup`, yours, on your machine. The free tier takes none. |
| Supabase Pro | **Declined** (22 Sep 2026). See the limits below. |
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

## Backups, on the free tier

**Supabase takes no backups on the free tier.** The owner decided on 22 Sep
2026 not to move production to Pro, so the only backup is the one you take.

```bash
VITE_SUPABASE_URL=https://<project>.supabase.co \
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_… \
npm run backup
```

It asks for your email and password, signs in as you, and writes every row
you own to `backups/lodestar-<when>.json`. It reads through Row Level
Security exactly as the app does: no service-role key, no third party,
nothing leaves your machine. `backups/` is ignored by git, because the file
holds your real finances — keep it where you would keep a bank statement.

**Take one before anything that changes a lot:** a migration that removes a
column, the Notion import, a bulk delete. Otherwise once a month is a fair
rhythm for a ledger that grows a few rows a day.

What a backup holds: accounts, categories and their groups, transactions,
budgets, goals, bills and subscriptions, import batches, and your profile
settings. Ids are kept, so a restore rebuilds exactly what you had. The audit
log is left out: nobody may write to it, and it says nothing about money.

What it cannot do: bring back an account whose login is gone. The file holds
your rows, not your Supabase account. If the project itself were deleted, you
would make a new one, sign up, and restore into it.

## The restore drill

A backup is only a backup once it has been restored. Free gives us no
provider backup to restore, so the drill proves the one you take:

1. **Back up production**, as above.
2. **Empty the staging account.** Sign in to staging, use Settings → Delete
   your Lodestar account, then sign up again with the same address. A restore
   refuses an account that already holds anything, so nothing can collide.
3. **Restore into staging**, pointing the variables at the staging project:

   ```bash
   VITE_SUPABASE_URL=https://<staging>.supabase.co \
   VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_… \
   npm run restore backups/lodestar-<when>.json
   ```

   It says what it is about to do, asks you to type `restore`, writes the
   tables in dependency order, then reads everything back and compares. **"Every
   row matches the backup" is the drill passing.** Anything else names the
   table and how many rows differ.

4. **Check it in the app.** Open staging: the balances, budgets and goals
   should read exactly as production does.
5. **Record the date and result** at the bottom of this file, then delete the
   staging account again (Phase 9, finding 2 — staging should not sit on real
   data).

You can also check a backup against the account it came from at any time,
without writing anything:

```bash
npm run backup verify backups/lodestar-<when>.json
```

`supabase/checks/fingerprint.sql` remains the way to compare two databases
directly with `psql`, if you ever have one to compare against.

## Your steps, in order

Done on 21–22 Sep: production requires a reviewer, its token can deploy the
function, and the run that applied the missing migrations ended `healthy`.
What is left:

1. **Take your first backup** (`npm run backup`), and keep it somewhere you
   would keep a bank statement.
2. **Run the restore drill** above. That is what accepts this phase.
3. **Clear your real data out of staging** (Phase 9, finding 2). The drill
   does this anyway: it empties staging before restoring, and you delete the
   account again afterwards.
4. **Approve production runs when they queue.** One waits after every merge,
   and a waiting run holds up the next one.
5. **The domain, once cleared** (brand §10). Then, in one sitting:
   - Vercel → Domains: add it to production.
   - Supabase production → Authentication → URL Configuration: the new
     **Site URL**, and `https://<domain>/auth/confirm` as a redirect URL.
   - Resend: verify the domain, turn click tracking **off**, and point
     production's custom SMTP at it.
   - GitHub → Settings → Variables: set `PRODUCTION_SITE_URL` to the new
     address, so the health check follows it.
   - Optionally, set `APP_ORIGINS` on the function
     (docs/phase-9/account-deletion.md).

## What the free tier costs, knowingly

Recorded so nobody has to rediscover it:

- **No provider backups, and no point-in-time recovery.** Your own backups
  are the whole of it, and they are only as recent as the last one you took.
- **The project pauses when idle.** The health check pings it every three
  hours, which should keep it awake.
- **No leaked-password protection** (Phase 9, finding 4). It stays off.
- **`CLAUDE.md` still says Pro before anyone else stores real data.** That
  promise holds while Lodestar is the owner's alone. The day someone else
  keeps their finances here, this decision has to be made again.

## Drill log

| Date | Backup | Result |
|---|---|---|
| — | — | Not run yet: production is not on Pro. |
