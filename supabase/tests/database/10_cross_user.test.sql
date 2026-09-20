-- Phase 4: the cross-user matrix. Two synthetic people, A and B, and for every
-- user-owned table the five ways B might reach A's data: read it, change it,
-- delete it, create a row already owned by A, or hand its own row over to A.
-- Then the reference rules, the anon role, and the deletion cascade.
--
-- Synthetic data only: no real names, amounts or descriptions.
-- Run with: supabase test db   (needs `supabase start`)

begin;
create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public, pg_catalog;

select no_plan();

-- ---------------------------------------------------------------------------
-- Helpers: act as a given person, and report what happened.
-- ---------------------------------------------------------------------------
create schema tests;

create function tests.act_as(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(uid::text, ''), true);
  if uid is null then execute 'set local role anon'; else execute 'set local role authenticated'; end if;
end $$;

-- Rows of `tbl` matching `cond` that this person can see.
create function tests.visible(uid uuid, tbl text, cond text default 'true') returns int
language plpgsql as $$
declare n int;
begin
  perform tests.act_as(uid);
  execute format('select count(*) from public.%I where %s', tbl, cond) into n;
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', '', true);
  return n;
end $$;

-- Rows the statement actually touched. RLS silently matches nothing.
create function tests.affected(uid uuid, stmt text) returns int
language plpgsql as $$
declare n int;
begin
  perform tests.act_as(uid);
  execute stmt;
  get diagnostics n = row_count;
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', '', true);
  return n;
end $$;

-- SQLSTATE of a statement that is expected to be refused, or null if it ran.
create function tests.refused(uid uuid, stmt text) returns text
language plpgsql as $$
declare code text;
begin
  perform tests.act_as(uid);
  begin
    execute stmt;
    code := null;
  exception when others then
    code := sqlstate;
  end;
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', '', true);
  return code;
end $$;

-- ---------------------------------------------------------------------------
-- Synthetic fixtures, with fixed ids so the assertions below can be literal.
-- Inserted as the table owner, which bypasses RLS; every assertion then runs
-- as `authenticated` or `anon`, where RLS applies.
-- ---------------------------------------------------------------------------
\set A '''aaaaaaaa-0000-4000-8000-00000000000a'''
\set B '''bbbbbbbb-0000-4000-8000-00000000000b'''

insert into auth.users (id, email, raw_user_meta_data) values
  ('aaaaaaaa-0000-4000-8000-00000000000a', 'synthetic-a@example.test', '{"timezone":"UTC"}'),
  ('bbbbbbbb-0000-4000-8000-00000000000b', 'synthetic-b@example.test', '{"timezone":"UTC"}');

-- Accounts, groups and categories.
insert into public.accounts (id, user_id, name, type, opening_balance_minor) values
  ('a0000001-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-00000000000a', 'A checking', 'checking', 100000),
  ('a0000002-0000-4000-8000-000000000002', 'aaaaaaaa-0000-4000-8000-00000000000a', 'A fund', 'savings', 0),
  ('b0000001-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-00000000000b', 'B checking', 'checking', 5000),
  ('b0000002-0000-4000-8000-000000000002', 'bbbbbbbb-0000-4000-8000-00000000000b', 'B fund', 'savings', 0);

insert into public.category_groups (id, user_id, name) values
  ('a0000003-0000-4000-8000-000000000003', 'aaaaaaaa-0000-4000-8000-00000000000a', 'A group'),
  ('b0000003-0000-4000-8000-000000000003', 'bbbbbbbb-0000-4000-8000-00000000000b', 'B group');

insert into public.categories (id, user_id, group_id, name, kind) values
  ('a0000004-0000-4000-8000-000000000004', 'aaaaaaaa-0000-4000-8000-00000000000a',
   'a0000003-0000-4000-8000-000000000003', 'A groceries', 'expense'),
  ('b0000004-0000-4000-8000-000000000004', 'bbbbbbbb-0000-4000-8000-00000000000b',
   'b0000003-0000-4000-8000-000000000003', 'B groceries', 'expense');

insert into public.import_batches (id, user_id, source, filename, row_count) values
  ('a0000005-0000-4000-8000-000000000005', 'aaaaaaaa-0000-4000-8000-00000000000a', 'csv', 'synthetic-a.csv', 0),
  ('b0000005-0000-4000-8000-000000000005', 'bbbbbbbb-0000-4000-8000-00000000000b', 'csv', 'synthetic-b.csv', 0);

insert into public.recurring_items
  (id, user_id, name, label, kind, amount_minor, from_account_id, category_id, cadence_unit, anchor_on, next_due_on) values
  ('a0000006-0000-4000-8000-000000000006', 'aaaaaaaa-0000-4000-8000-00000000000a', 'A rent', 'bill', 'expense', 120000,
   'a0000001-0000-4000-8000-000000000001', 'a0000004-0000-4000-8000-000000000004', 'month',
   date_trunc('month', current_date)::date, date_trunc('month', current_date)::date),
  ('b0000006-0000-4000-8000-000000000006', 'bbbbbbbb-0000-4000-8000-00000000000b', 'B rent', 'bill', 'expense', 70000,
   'b0000001-0000-4000-8000-000000000001', 'b0000004-0000-4000-8000-000000000004', 'month',
   date_trunc('month', current_date)::date, date_trunc('month', current_date)::date);

insert into public.transactions (id, user_id, kind, occurred_on, amount_minor, from_account_id, category_id, description) values
  ('a0000007-0000-4000-8000-000000000007', 'aaaaaaaa-0000-4000-8000-00000000000a', 'expense', current_date, 4550,
   'a0000001-0000-4000-8000-000000000001', 'a0000004-0000-4000-8000-000000000004', 'A market'),
  ('b0000007-0000-4000-8000-000000000007', 'bbbbbbbb-0000-4000-8000-00000000000b', 'expense', current_date, 1200,
   'b0000001-0000-4000-8000-000000000001', 'b0000004-0000-4000-8000-000000000004', 'B market');

insert into public.budgets (id, user_id, category_id, month, amount_minor) values
  ('a0000008-0000-4000-8000-000000000008', 'aaaaaaaa-0000-4000-8000-00000000000a',
   'a0000004-0000-4000-8000-000000000004', date_trunc('month', current_date)::date, 20000),
  ('b0000008-0000-4000-8000-000000000008', 'bbbbbbbb-0000-4000-8000-00000000000b',
   'b0000004-0000-4000-8000-000000000004', date_trunc('month', current_date)::date, 9000);

insert into public.goals (id, user_id, account_id, name, target_minor) values
  ('a0000009-0000-4000-8000-000000000009', 'aaaaaaaa-0000-4000-8000-00000000000a',
   'a0000002-0000-4000-8000-000000000002', 'A emergency fund', 100000),
  ('b0000009-0000-4000-8000-000000000009', 'bbbbbbbb-0000-4000-8000-00000000000b',
   'b0000002-0000-4000-8000-000000000002', 'B emergency fund', 50000);

insert into public.audit_events (id, user_id, event, row_count) overriding system value values
  (901, 'aaaaaaaa-0000-4000-8000-00000000000a', 'export', 3),
  (902, 'bbbbbbbb-0000-4000-8000-00000000000b', 'export', 1);

-- The sign-up trigger already created both profiles.
select is(
  (select count(*)::int from public.profiles
    where id in ('aaaaaaaa-0000-4000-8000-00000000000a', 'bbbbbbbb-0000-4000-8000-00000000000b')),
  2, 'the sign-up trigger created a profile for each synthetic user');

-- ---------------------------------------------------------------------------
-- The matrix. One row per table: how A's row is addressed, a harmless change
-- B might try, an insert already owned by A, and B handing its row to A.
-- ---------------------------------------------------------------------------
create temporary table matrix (
  tbl        text primary key,
  owner_col  text not null,
  a_row      text not null,   -- ids are literal text: audit_events uses a bigint
  b_row      text not null,
  update_set text,            -- null when the table grants no UPDATE at all
  insert_sql text not null,
  writable   boolean not null default true
) on commit drop;

insert into matrix (tbl, owner_col, a_row, b_row, update_set, insert_sql, writable) values
  ('accounts', 'user_id', 'a0000001-0000-4000-8000-000000000001', 'b0000001-0000-4000-8000-000000000001',
   $$name = 'taken'$$,
   $$insert into public.accounts (user_id, name, type) values ('aaaaaaaa-0000-4000-8000-00000000000a', 'taken', 'cash')$$, true),
  ('category_groups', 'user_id', 'a0000003-0000-4000-8000-000000000003', 'b0000003-0000-4000-8000-000000000003',
   $$name = 'taken'$$,
   $$insert into public.category_groups (user_id, name) values ('aaaaaaaa-0000-4000-8000-00000000000a', 'taken')$$, true),
  ('categories', 'user_id', 'a0000004-0000-4000-8000-000000000004', 'b0000004-0000-4000-8000-000000000004',
   $$name = 'taken'$$,
   $$insert into public.categories (user_id, name, kind) values ('aaaaaaaa-0000-4000-8000-00000000000a', 'taken', 'expense')$$, true),
  ('transactions', 'user_id', 'a0000007-0000-4000-8000-000000000007', 'b0000007-0000-4000-8000-000000000007',
   $$description = 'taken'$$,
   $$insert into public.transactions (user_id, kind, occurred_on, amount_minor, from_account_id, description)
     values ('aaaaaaaa-0000-4000-8000-00000000000a', 'expense', current_date, 100,
             'b0000001-0000-4000-8000-000000000001', 'taken')$$, true),
  ('budgets', 'user_id', 'a0000008-0000-4000-8000-000000000008', 'b0000008-0000-4000-8000-000000000008',
   $$amount_minor = 1$$,
   $$insert into public.budgets (user_id, category_id, month, amount_minor)
     values ('aaaaaaaa-0000-4000-8000-00000000000a', 'b0000004-0000-4000-8000-000000000004',
             (date_trunc('month', current_date) + interval '1 month')::date, 1)$$, true),
  ('goals', 'user_id', 'a0000009-0000-4000-8000-000000000009', 'b0000009-0000-4000-8000-000000000009',
   $$name = 'taken'$$,
   $$insert into public.goals (user_id, account_id, name)
     values ('aaaaaaaa-0000-4000-8000-00000000000a', 'b0000001-0000-4000-8000-000000000001', 'taken')$$, true),
  ('recurring_items', 'user_id', 'a0000006-0000-4000-8000-000000000006', 'b0000006-0000-4000-8000-000000000006',
   $$name = 'taken'$$,
   $$insert into public.recurring_items
       (user_id, name, label, kind, amount_minor, from_account_id, cadence_unit, anchor_on, next_due_on)
     values ('aaaaaaaa-0000-4000-8000-00000000000a', 'taken', 'bill', 'expense', 1,
             'b0000001-0000-4000-8000-000000000001', 'month', current_date, current_date)$$, true),
  ('import_batches', 'user_id', 'a0000005-0000-4000-8000-000000000005', 'b0000005-0000-4000-8000-000000000005',
   $$status = 'reconciled'$$,
   $$insert into public.import_batches (user_id, source, row_count) values ('aaaaaaaa-0000-4000-8000-00000000000a', 'csv', 0)$$, true),
  ('audit_events', 'user_id', '901', '902',
   null,
   $$insert into public.audit_events (user_id, event) values ('aaaaaaaa-0000-4000-8000-00000000000a', 'export')$$, false),
  ('profiles', 'id', 'aaaaaaaa-0000-4000-8000-00000000000a', 'bbbbbbbb-0000-4000-8000-00000000000b',
   $$display_name = 'taken'$$,
   $$insert into public.profiles (id) values ('aaaaaaaa-0000-4000-8000-00000000000a')$$, false);

-- 1. B cannot read a single row of A's, in any table.
select is(
    tests.visible('bbbbbbbb-0000-4000-8000-00000000000b', tbl,
                  format('%I = %L', owner_col, 'aaaaaaaa-0000-4000-8000-00000000000a')),
    0, tbl || ': B cannot read A''s rows')
  from matrix;

-- ...while still seeing its own.
select cmp_ok(
    tests.visible('bbbbbbbb-0000-4000-8000-00000000000b', tbl,
                  format('%I = %L', owner_col, 'bbbbbbbb-0000-4000-8000-00000000000b')),
    '>', 0, tbl || ': B can read its own rows')
  from matrix;

-- 2. An update aimed at A's row matches nothing (or is refused outright).
select is(
    tests.affected('bbbbbbbb-0000-4000-8000-00000000000b',
                   format('update public.%I set %s where id = %L', tbl, update_set, a_row)),
    0, tbl || ': B cannot update A''s row')
  from matrix where update_set is not null;

select is(
    tests.refused('bbbbbbbb-0000-4000-8000-00000000000b',
                  format('update public.%I set row_count = 1 where id = %L', tbl, a_row)),
    '42501', tbl || ': the update grant itself is withheld')
  from matrix where update_set is null and tbl = 'audit_events';

-- 3. Nor can B delete it.
select is(
    tests.affected('bbbbbbbb-0000-4000-8000-00000000000b',
                   format('delete from public.%I where id = %L', tbl, a_row)),
    0, tbl || ': B cannot delete A''s row')
  from matrix where writable;

select is(
    tests.refused('bbbbbbbb-0000-4000-8000-00000000000b',
                  format('delete from public.%I where id = %L', tbl, a_row)),
    '42501', tbl || ': the delete grant itself is withheld')
  from matrix where not writable;

-- 4. B cannot create a row that is already A's: user_id carries no grant.
select is(
    tests.refused('bbbbbbbb-0000-4000-8000-00000000000b', insert_sql),
    '42501', tbl || ': B cannot insert a row owned by A')
  from matrix;

-- 5. Nor hand its own row to A. Column grant first, then the trigger, which
--    holds even for the table owner.
select is(
    tests.refused('bbbbbbbb-0000-4000-8000-00000000000b',
                  format('update public.%I set %I = %L where id = %L', tbl, owner_col,
                         'aaaaaaaa-0000-4000-8000-00000000000a', b_row)),
    '42501', tbl || ': B cannot hand its row to A')
  from matrix;

-- 6. And after all of that, A's rows are untouched.
select is(
    (select count(*)::int from public.accounts where id = 'a0000001-0000-4000-8000-000000000001' and name = 'A checking'),
    1, 'A''s row survived every attempt unchanged');

select * from finish();
rollback;
