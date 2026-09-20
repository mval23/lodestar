# Account deletion

Closes finding 1 of the [Phase 9 review](review.md): `CLAUDE.md` puts "delete
account" in the MVP and names `delete-account` as the only Edge Function, and
neither existed. Written 20 Sep 2026.

## What someone sees

**Settings → Delete your Lodestar account.** The panel says what goes, in
words, and that there is no undo. It asks for two things:

1. **Their password**, because a signed-in browser left unattended should not
   be enough to erase someone's records.
2. **The phrase, typed out** — "Delete account and its 318 transactions" — so
   it cannot happen by a stray click. The number is counted, not guessed, and
   the phrase has to match; spare spaces and capitals are forgiven, nothing
   else is.

Then the account and every row in it are gone, and they land on a page that
says so.

## What happens

```
browser                      delete-account                 Postgres
  │  sign in again (password)
  │───────────────────────────────────────────────────────────▶ Auth
  │  POST /functions/v1/delete-account
  │──────────────▶ 1. Auth verifies the token → user id
                   2. the token must prove a password within 5 minutes
                   3. log_event('account_delete_requested') as the caller
                   4. admin.deleteUser(id) ──────────────────▶ cascade
  │◀────────────── { ok: true }
  │  navigate to /account-deleted, then clear the session
```

**Why an Edge Function at all.** Nobody can delete their own auth user with an
ordinary token; it takes the service role. The service-role key lives only in
this function's secrets — never in Vercel, never in the browser — which is why
this is the one exception to "no custom backend".

**Why the function checks the password again.** The app asks for it, but the
app is not the security boundary: anyone can call the endpoint directly. The
function reads the token's `amr` claim, which is what GoTrue writes when a
factor is actually used, and refuses anything older than five minutes. A
silent token refresh mints a new token but never a new `amr` timestamp, so a
session merely kept alive cannot pass. Tokens without `amr` fall back to
`iat`, which is only ever more generous.

**Why the rows go quietly.** Every user-owned table references
`auth.users on delete cascade`, so deleting the auth user removes all of it in
one database transaction. That is already proved against a real Postgres by
`supabase/tests/database/20_references_anon_cascade.test.sql`, which asserts
the rows of another person are untouched. There is no delete script to keep in
step with the schema, which is the point.

**What is left.** An audit event is written just before the delete, through the
same `log_event` RPC the app uses: an event name, no amounts, no descriptions.
It cascades away a moment later with everything else; what remains is the
write in the database's own log. Backups age out within the provider's
retention window, which the panel and the sign-off page both say plainly.

## What is tested

| Where | What |
|---|---|
| `supabase/functions/delete-account/guard.test.ts` | the token rules: bearer parsing, claim decoding, and that a refreshed-but-old session is refused while a fresh password passes |
| `src/features/settings/deletion.test.ts` | the phrase and how forgiving the match is, and that a failure says nothing was removed |
| `src/features/settings/DeleteAccountPanel.test.tsx` | wrong password deletes nothing; a near-miss phrase deletes nothing; the order of sign-out and navigation |
| `e2e/flows.spec.ts` | the whole path in a real browser, and that a wrong password never reaches the function |
| `e2e/accessibility.spec.ts` | axe over the panel with its fields showing, and over the sign-off page |

The guard is the one piece of Edge Function code with real decisions in it, so
it is a plain module with no imports: Deno reads it from `index.ts`, and the
test suite reads the same source.

## Deploying it

CI deploys the function to staging on every merge to `main`, in the same job
that pushes migrations, so it cannot drift behind the schema. By hand:

```bash
supabase functions deploy delete-account --no-verify-jwt --project-ref <ref>
```

Configuration, per project:

- `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are
  injected by the platform. Nothing to set.
- `APP_ORIGINS` (optional) narrows CORS to a comma-separated list, for example
  `https://lodestar.app,https://staging.lodestar.app`. Unset, the function
  answers any origin: the bearer token is what protects it, and it reads no
  cookies, so a page on another origin gains nothing by calling it.

`verify_jwt` is off for this function — in `supabase/config.toml` for local
work, and as `--no-verify-jwt` on deploy — so the browser's CORS preflight is
answered rather than refused for carrying no token. The function verifies the
token itself, on every request, before doing anything. Leaving platform
verification on would break deletion from the browser.

Locally, `supabase start` now runs the edge runtime, so the function is
servable with `supabase functions serve delete-account`.

## Checking it on staging

- [ ] Delete a **synthetic** account with a few transactions. The phrase names
      the right number.
- [ ] A wrong password is refused, and nothing is deleted.
- [ ] Typing the phrase with different capitals still works; typing a
      different number does not.
- [ ] Afterwards, signing in with that address fails, and
      `select count(*) from public.transactions` in the dashboard shows the
      rows are gone.
- [ ] Call the endpoint directly with an ordinary session token — one from a
      browser signed in a while ago, not re-authenticated just now — and it
      answers `401 reauth_required` without deleting anything. The app never
      hits this path, because it signs in again immediately beforehand; it is
      there for everyone who does not go through the app.
