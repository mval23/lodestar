# Phase 3: project foundation and authentication

**Goal:** a deployable skeleton with working auth.
**Accepted when:** a new user can register, confirm their email, reset a password and edit their profile **on staging**.

The code for this phase is in the repository. What remains is provisioning: a few accounts and settings that only the owner can create. This guide lists them in order.

## What's in the code

| Area | Where |
|---|---|
| Vite + React + TypeScript app | `index.html`, `src/`, `vite.config.ts` |
| Supabase client (PKCE, publishable key only) | `src/lib/supabase.ts`, `src/lib/env.ts` |
| Sign up, sign in, check email, forgot password, email link handler, reset password | `src/features/auth/` |
| Profile: name, currency (locked after the first transaction), time zone, week start; change password with re-authentication; sign out, and sign out everywhere | `src/features/settings/` |
| Shell: desktop sidebar, mobile tab bar, placeholder screens for later phases | `src/app/` |
| Security headers (CSP, HSTS, frame-ancestors none, no referrer) and SPA rewrites | `vercel.json` |
| Build-time CSP that narrows `connect-src` to this build's Supabase origin | `vite.config.ts` |
| Local Supabase config: Auth settings, email templates | `supabase/config.toml`, `supabase/templates/` |
| CI: typecheck, lint, unit tests, PGlite schema check, build, real Supabase stack + RLS gate + generated-types check, migrations to staging on merge | `.github/workflows/ci.yml` |
| Production migrations: manual, approval-gated | `.github/workflows/migrate-production.yml` |

### How email links work

Every Auth email links to `<RedirectTo>?token_hash=…&type=…`, where `RedirectTo` is `<app origin>/auth/confirm`. The page exchanges the token in the browser with `verifyOtp`, so a link opened on another device still works. Recovery links then go to `/reset-password`. If the app's origin isn't on the project's redirect allow list, Supabase falls back to the bare Site URL. The app forwards `/?token_hash=…` to `/auth/confirm`, so the link still works, but add every origin to the allow list anyway.

## Local development

Local development needs Docker (Docker Desktop on Windows) and the [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started).

```bash
npm install
supabase start
```

Copy `.env.example` to `.env.local`, and fill it in with the API URL and publishable key that `supabase start` prints. Then:

```bash
npm run dev
```

Sign up at http://localhost:5173/sign-up. The confirmation email arrives in Inbucket at http://127.0.0.1:54324. Use a synthetic address such as `sam@example.com`.

Useful scripts: `npm test`, `npm run lint`, `npm run typecheck`, `npm run schema:check` (no Docker needed), `npm run db:reset`, `npm run db:gate` (needs `psql`), and `npm run db:types`, which replaces the hand-written `src/lib/database.types.ts` with generated types. Commit the generated file.

`npm run build && npm run preview` serves the production build with the production security headers, so CSP problems show up locally.

## Provisioning (owner)

Do these once, in order. None of them involve committing a secret.

### 1. Supabase projects

Create two projects in the same organization. Choose a region close to you, and **Postgres 17**.

| | Staging | Production |
|---|---|---|
| Name | `lodestar-staging` | `lodestar-prod` |
| Data | Synthetic only | Real (owner only until Pro) |
| Plan | Free | Free for now; **Pro before anyone else stores real data** (backups, no pausing) |

For each project, save the database password in your password manager. You'll need the **project ref** (the id in the dashboard URL) and the **publishable key** (Settings → API Keys). Never copy the secret or service-role key anywhere except Edge Function secrets, which come later in the `delete-account` phase.

### 2. Auth settings (each project)

Under **Authentication → Sign In / Providers → Email**:
- Enable email sign-up. Turn on **Confirm email**.
- Turn off **Secure password change**. The app re-authenticates with the current password itself.
- Set the minimum password length to **10**. Leave the password character requirements empty.

Under **Authentication → Providers**, leave everything else off, including anonymous sign-ins.

Under **Authentication → Sessions / JWT**:
- JWT expiry: **3600** seconds.
- Refresh token rotation: **on**, with a reuse interval of 10 seconds.

Under **Authentication → URL Configuration**:

| | Staging | Production |
|---|---|---|
| Site URL | The staging Vercel URL (see step 4) | `https://<production domain>` |
| Redirect URLs | `https://<staging url>/auth/confirm`, `https://*-<vercel-team-slug>.vercel.app/auth/confirm` (previews) | `https://<production domain>/auth/confirm` only |

Under **Authentication → Emails → Templates**, paste the three templates from `supabase/templates/` (Confirm signup, Reset password, Change email address), using the subjects in `supabase/config.toml`.

### 3. Custom SMTP (each project)

Supabase's built-in email is for testing only. Use a transactional provider such as Resend (free tier):
1. Add and verify a sending domain, and publish the provider's **SPF and DKIM** records (DMARC recommended).
2. Create an SMTP credential for that domain.
3. In Supabase, go to **Authentication → Emails → SMTP Settings**, turn on custom SMTP, and enter the host, port, user and password. Set the sender name to `Lodestar` and use an address like `no-reply@<domain>`.
4. Raise the Auth email rate limit (Authentication → Rate Limits) from the built-in default to something like 30 per hour.

Until a domain is ready, staging can use the provider's shared test sender. It can only mail your own address.

### 4. Vercel

1. Import the GitHub repository into Vercel (Hobby). Vercel picks up `vercel.json`: framework Vite, `npm run build`, output `dist`.
2. Under **Settings → Environment Variables**:

   | Variable | Preview | Production |
   |---|---|---|
   | `VITE_SUPABASE_URL` | staging URL | production URL |
   | `VITE_SUPABASE_PUBLISHABLE_KEY` | staging publishable key | production publishable key |

   Only these two. They are public by design, and RLS is what protects data.
3. Set the production branch to `main`. Previews (branches and pull requests) build against staging.
4. If Supabase ever moves to a custom domain, update `connect-src` in `vercel.json`, which allows `*.supabase.co`.

### 5. GitHub

1. **Settings → Environments:** create `staging` and `production`. Give `production` a required reviewer (you).
2. In each environment, add:
   - Secrets: `SUPABASE_ACCESS_TOKEN` (a personal access token from supabase.com/dashboard/account/tokens) and `SUPABASE_DB_PASSWORD` (that project's database password).
   - Variable: `SUPABASE_PROJECT_REF`.
3. Protect `main`: require a pull request and the `App` and `Database` checks.

Once this is in place, merging to `main` applies migrations to staging. Production migrations run only from **Actions → Migrate production**, after approval. The initial schema migration reaches staging on the first merge after the secrets exist. Run the production workflow once to create the production schema.

## Acceptance checklist (on staging)

Use a synthetic email address that you control, and no real financial data.

- [ ] CI is green on the pull request: App and Database jobs.
- [ ] After merge, "Apply migrations to staging" succeeded. In the dashboard, **Advisors → Security** reports no RLS warnings.
- [ ] The preview URL loads, and the browser console shows no CSP violations.
- [ ] Response headers include `Content-Security-Policy`, `Strict-Transport-Security` and `X-Frame-Options: DENY` (check with `curl -I`).
- [ ] **Register:** sign up, and the confirmation email arrives from your custom sender (not Supabase's).
- [ ] **Confirm:** the link opens `/auth/confirm` and lands on Overview. Opening the same link again shows "expired or already used".
- [ ] **Cross-device:** a confirmation link opened in a different browser also works.
- [ ] **Sign in / out:** wrong password shows calm copy. Sign out returns to sign in, and a protected URL goes back to sign in with `?next=`.
- [ ] **Reset password:** "Forgot password?" sends mail, the link leads to "Choose a new password", and the new password works while the old one doesn't.
- [ ] **Profile:** change name, time zone and week start, then reload and see them persisted. Currency switches USD ↔ COP while there are no transactions.
- [ ] **Change password** in Settings asks for the current password, and rejects a wrong one.
- [ ] **Isolation smoke:** with two synthetic users, user B's profile never appears for user A. The formal matrix is Phase 4.

## Known gaps and follow-ups

- **Not run against a real Supabase stack yet.** This machine has no Docker or Supabase CLI. The app was built, unit-tested, and checked in a browser under the production CSP, but real auth round-trips happen for the first time in CI's `database` job and on staging.
- **`supabase/config.toml` keys** follow the Supabase CLI v2 format. If `supabase start` warns about an unknown key, remove that key.
- **Bundle size:** the initial JavaScript is about 212 KB gzipped, against a 200 KB budget. Most of it is `@supabase/supabase-js`, which bundles storage and realtime clients the app doesn't use, plus zod and react-dom. Options: use `@supabase/auth-js` and `@supabase/postgrest-js` directly, or `zod/mini`. Revisit before Phase 9.
- **Strict `style-src 'self'`:** libraries that inject `<style>` tags (for example the scroll lock in Radix Dialog) will log CSP violations. Check this when sheets arrive in Phase 5.
- **Generated types:** `src/lib/database.types.ts` is a hand-written subset until someone runs `npm run db:types`. CI already type-checks against the generated file.
- **Schema review questions** (docs/phase-2/schema-review.md) are still open. None of them block this phase. Question 2 (a wider currency lock) would change the Settings copy.
