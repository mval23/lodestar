-- =============================================================================
-- Fingerprint: proves two databases hold the same data without showing any of
-- it. Used by the restore drill (docs/phase-10/production.md):
--
--   psql "$PRODUCTION_URL" -f supabase/checks/fingerprint.sql > production.txt
--   psql "$RESTORED_URL"   -f supabase/checks/fingerprint.sql > restored.txt
--   diff production.txt restored.txt        # silent means identical
--
-- One line per table: the row count, an md5 over every row, and when the
-- table last changed. A hash reveals no amount, description or name, so the
-- output is safe to keep in a drill log. Any edit to any row changes it.
--
-- Read-only throughout. Every table in public is included automatically, so a
-- table added later is never left out of a drill.
-- =============================================================================
\set ON_ERROR_STOP on
\pset footer off
begin transaction read only;
set local timezone = 'UTC';

-- Builds one query over every table, then runs it (\gexec).
select string_agg(
         format(
           $q$select %L as relation, count(*) as row_count,
                     md5(coalesce(string_agg(r::text, E'\n' order by r::text), '')) as rows_md5,
                     max(r.updated_at) as last_changed
                from public.%I r$q$,
           'public.' || c.relname, c.relname),
         E'\nunion all\n' order by c.relname)
       -- Accounts themselves, by id only: signing in changes the other
       -- columns, which is not a difference a restore should be judged on.
       || $q$
union all
select 'auth.users', count(*), md5(coalesce(string_agg(id::text, E'\n' order by id), '')), null::timestamptz
  from auth.users
order by relation$q$ as query
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind in ('r', 'p')
\gexec

commit;
