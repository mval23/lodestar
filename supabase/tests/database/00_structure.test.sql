-- Phase 4: structural guarantees. Every rule here is one a future table could
-- silently break, so each is expressed as "find me a counter-example", and the
-- failure message names the offending object.
--
-- Run with: supabase test db   (needs `supabase start`)

begin;
create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public, pg_catalog;

select plan(14);

-- Tables that belong to a person. `currencies` is shared reference data.
create temporary table owned_tables (name text primary key) on commit drop;
insert into owned_tables values
  ('profiles'), ('accounts'), ('category_groups'), ('categories'), ('transactions'),
  ('budgets'), ('goals'), ('recurring_items'), ('import_batches'), ('audit_events');

-- 1. RLS is enabled everywhere in public.
select is_empty(
  $$ select c.relname from pg_catalog.pg_class c
       join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity $$,
  'every table in public has row level security enabled');

-- 2. Exactly one policy per command for authenticated, and no FOR ALL policies.
--    A command a table does not allow still carries an explicit false policy,
--    which is how currencies and audit_events pass without an allowlist.
select is_empty(
  $$ select c.relname || ' is missing a policy for ' || cmd
       from pg_catalog.pg_class c
       join pg_catalog.pg_namespace n on n.oid = c.relnamespace
       cross join unnest(array['r', 'a', 'w', 'd']) as cmd
      where n.nspname = 'public' and c.relkind in ('r', 'p')
        and not exists (
          select 1 from pg_catalog.pg_policy p
           where p.polrelid = c.oid and p.polcmd = cmd
             and 'authenticated' = any (select rolname from pg_catalog.pg_roles where oid = any (p.polroles))) $$,
  'every table has a policy for each of select, insert, update and delete');

select is_empty(
  $$ select p.polname from pg_catalog.pg_policy p
       join pg_catalog.pg_class c on c.oid = p.polrelid
       join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and p.polcmd = '*' $$,
  'no table uses a FOR ALL policy');

-- 3. Nothing is addressed to anon or to PUBLIC.
select is_empty(
  $$ select p.polname from pg_catalog.pg_policy p
       join pg_catalog.pg_class c on c.oid = p.polrelid
       join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and (p.polroles = '{0}'::oid[]
             or exists (select 1 from pg_catalog.pg_roles r
                         where r.oid = any (p.polroles) and r.rolname = 'anon')) $$,
  'no policy applies to anon or to PUBLIC');

-- 4. anon holds no privilege at all in public.
select is_empty(
  $$ select table_name || '.' || privilege_type from information_schema.table_privileges
      where table_schema = 'public' and grantee = 'anon' $$,
  'anon has no privilege on any table or view');

select is_empty(
  $$ select p.oid::regprocedure::text from pg_catalog.pg_proc p
       join pg_catalog.pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and has_function_privilege('anon', p.oid, 'execute') $$,
  'anon cannot execute any function in public');

-- 5. Views run as the caller, so RLS follows through them.
select is_empty(
  $$ select c.relname from pg_catalog.pg_class c
       join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'v'
        and coalesce((select option_value from pg_catalog.pg_options_to_table(c.reloptions)
                       where option_name = 'security_invoker'), 'false') <> 'true' $$,
  'every view in public is security_invoker');

-- 6. The privileged surface stays exactly two functions.
select is_empty(
  $$ select p.oid::regprocedure::text from pg_catalog.pg_proc p
       join pg_catalog.pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.prosecdef
        and p.proname not in ('handle_new_user', 'log_event') $$,
  'handle_new_user and log_event are the only SECURITY DEFINER functions');

-- 7. Ownership column: uuid, not null, defaulted from the JWT, cascading.
select is_empty(
  $$ select t.name from owned_tables t
       join information_schema.columns c
         on c.table_schema = 'public' and c.table_name = t.name
        and c.column_name = case when t.name = 'profiles' then 'id' else 'user_id' end
      where c.data_type <> 'uuid' or c.is_nullable <> 'NO' $$,
  'every user-owned table has a non-null uuid owner column');

select is_empty(
  $$ select t.name from owned_tables t
       join information_schema.columns c
         on c.table_schema = 'public' and c.table_name = t.name and c.column_name = 'user_id'
      where c.column_default is distinct from 'auth.uid()' $$,
  'user_id defaults to auth.uid()');

select is_empty(
  $$ select t.name from owned_tables t
      where not exists (
        select 1 from pg_catalog.pg_constraint k
         where k.conrelid = ('public.' || t.name)::regclass and k.contype = 'f'
           and k.confrelid = 'auth.users'::regclass and k.confdeltype = 'c') $$,
  'every user-owned table cascades when the auth user is deleted');

-- 8. Clients can never write the owner column.
select is_empty(
  $$ select table_name || '.' || column_name from information_schema.column_privileges
      where table_schema = 'public' and grantee = 'authenticated'
        and column_name = 'user_id' and privilege_type in ('INSERT', 'UPDATE') $$,
  'authenticated holds no insert or update grant on user_id');

-- 9. Composite keys exist, so references can carry the owner.
select is_empty(
  $$ select t.name from owned_tables t
      where t.name <> 'profiles'
        and not exists (
          select 1 from pg_catalog.pg_constraint k
           where k.conrelid = ('public.' || t.name)::regclass
             and k.contype = 'u'
             and (select array_agg(a.attname::text order by a.attname)
                    from unnest(k.conkey) as key(attnum)
                    join pg_catalog.pg_attribute a
                      on a.attrelid = k.conrelid and a.attnum = key.attnum) = array['id', 'user_id']) $$,
  'every user-owned table has a unique (user_id, id)');

-- 10. And every reference between two user-owned tables uses it, so a row can
--     never point at another person's data.
select is_empty(
  $$ select k.conrelid::regclass::text || '.' || k.conname
       from pg_catalog.pg_constraint k
       join pg_catalog.pg_class c on c.oid = k.conrelid
       join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and k.contype = 'f'
        and k.confrelid in (select ('public.' || name)::regclass from owned_tables where name <> 'profiles')
        and not exists (
          select 1 from unnest(k.conkey) as key(attnum)
          join pg_catalog.pg_attribute a on a.attrelid = k.conrelid and a.attnum = key.attnum
         where a.attname = 'user_id') $$,
  'every reference between user-owned tables includes user_id');

select * from finish();
rollback;
