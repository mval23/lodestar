-- =============================================================================
-- RLS gate. Run in CI after migrations (as the migration role):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls_gate.sql
-- Raises (non-zero exit) listing every violation. Silent on success.
--
-- Rules, for every table and view in schema public:
--   1. Every table has RLS enabled.
--   2. Every table has at least one policy per command (SELECT, INSERT,
--      UPDATE, DELETE) for `authenticated`, and no FOR ALL policies.
--      A command a table does not allow still has an explicit policy that is
--      `using (false)` / `with check (false)`. This is how currencies
--      (reference data) and audit_events (append-only) pass the same gate
--      without an allowlist.
--   3. No policy applies to anon or PUBLIC.
--   4. anon holds no privilege on any table, view or sequence, and cannot
--      execute any function.
--   5. Every view is security_invoker.
--   6. The only SECURITY DEFINER functions are handle_new_user and log_event.
-- =============================================================================
do $gate$
declare
  v_problems text;
begin
  with
  tables as (
    select c.oid, c.relname, c.relrowsecurity
      from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('r', 'p')
  ),
  commands(cmd, label) as (
    values ('r', 'SELECT'), ('a', 'INSERT'), ('w', 'UPDATE'), ('d', 'DELETE')
  ),
  problems as (
    -- 1. RLS enabled
    select t.relname || ': row level security is disabled' as problem
      from tables t where not t.relrowsecurity
    union all
    -- 2. one policy per command for authenticated
    select t.relname || ': no ' || c.label || ' policy for authenticated'
      from tables t cross join commands c
     where not exists (
       select 1 from pg_catalog.pg_policy p
        where p.polrelid = t.oid
          and p.polcmd = c.cmd
          and 'authenticated'::regrole = any (p.polroles))
    union all
    select t.relname || ': FOR ALL policy ' || p.polname || ' (write one policy per command)'
      from tables t join pg_catalog.pg_policy p on p.polrelid = t.oid
     where p.polcmd = '*'
    union all
    -- 3. no policies for anon or PUBLIC (oid 0)
    select t.relname || ': policy ' || p.polname || ' applies to anon or PUBLIC'
      from tables t join pg_catalog.pg_policy p on p.polrelid = t.oid
     where 0::oid = any (p.polroles) or 'anon'::regrole = any (p.polroles)
    union all
    -- 4. anon privileges on relations
    select c.relname || ': anon has privileges'
      from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relkind in ('r', 'p', 'v', 'm', 'S', 'f')
       and (pg_catalog.has_table_privilege('anon', c.oid, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
            or (c.relkind <> 'S' and pg_catalog.has_any_column_privilege('anon', c.oid, 'SELECT, INSERT, UPDATE, REFERENCES')))
    union all
    -- 4. anon execute on functions
    select 'function ' || p.oid::regprocedure::text || ': anon can execute'
      from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE')
    union all
    -- 5. views are security_invoker
    select c.relname || ': view is not security_invoker'
      from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'v'
       and not coalesce('security_invoker=true' = any (c.reloptions)
                     or 'security_invoker=on'   = any (c.reloptions), false)
    union all
    -- 6. SECURITY DEFINER allowlist
    select 'function ' || p.oid::regprocedure::text || ': SECURITY DEFINER is not allowed'
      from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prosecdef
       and p.proname not in ('handle_new_user', 'log_event')
  )
  select string_agg(problem, E'\n' order by problem) into v_problems from problems;

  if v_problems is not null then
    raise exception E'RLS gate failed:\n%', v_problems;
  end if;
end;
$gate$;
