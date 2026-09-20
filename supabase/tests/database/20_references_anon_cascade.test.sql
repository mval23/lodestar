-- Phase 4, continued: the three rules that surround the matrix.
--   * A row cannot reference another person's row, even though B owns the row
--     doing the pointing. The composite foreign keys enforce this.
--   * anon reaches nothing at all.
--   * Deleting an auth user removes that person's rows and only theirs.
--
-- Synthetic data only. Run with: supabase test db

begin;
create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public, pg_catalog;

select no_plan();

create schema tests;

create function tests.act_as(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(uid::text, ''), true);
  if uid is null then execute 'set local role anon'; else execute 'set local role authenticated'; end if;
end $$;

create function tests.refused(uid uuid, stmt text) returns text language plpgsql as $$
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

insert into auth.users (id, email, raw_user_meta_data) values
  ('aaaaaaaa-0000-4000-8000-00000000000a', 'synthetic-a@example.test', '{"timezone":"UTC"}'),
  ('bbbbbbbb-0000-4000-8000-00000000000b', 'synthetic-b@example.test', '{"timezone":"UTC"}');

insert into public.accounts (id, user_id, name, type, opening_balance_minor) values
  ('a0000001-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-00000000000a', 'A checking', 'checking', 100000),
  ('a0000002-0000-4000-8000-000000000002', 'aaaaaaaa-0000-4000-8000-00000000000a', 'A fund', 'savings', 0),
  ('b0000001-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-00000000000b', 'B checking', 'checking', 5000);

insert into public.category_groups (id, user_id, name) values
  ('a0000003-0000-4000-8000-000000000003', 'aaaaaaaa-0000-4000-8000-00000000000a', 'A group');

insert into public.categories (id, user_id, name, kind) values
  ('a0000004-0000-4000-8000-000000000004', 'aaaaaaaa-0000-4000-8000-00000000000a', 'A groceries', 'expense'),
  ('b0000004-0000-4000-8000-000000000004', 'bbbbbbbb-0000-4000-8000-00000000000b', 'B groceries', 'expense');

insert into public.import_batches (id, user_id, source, row_count) values
  ('a0000005-0000-4000-8000-000000000005', 'aaaaaaaa-0000-4000-8000-00000000000a', 'csv', 0);

insert into public.recurring_items
  (id, user_id, name, label, kind, amount_minor, from_account_id, category_id, cadence_unit, anchor_on, next_due_on) values
  ('a0000006-0000-4000-8000-000000000006', 'aaaaaaaa-0000-4000-8000-00000000000a', 'A rent', 'bill', 'expense', 120000,
   'a0000001-0000-4000-8000-000000000001', 'a0000004-0000-4000-8000-000000000004', 'month',
   date_trunc('month', current_date)::date, date_trunc('month', current_date)::date);

insert into public.transactions (id, user_id, kind, occurred_on, amount_minor, from_account_id, category_id, description) values
  ('a0000007-0000-4000-8000-000000000007', 'aaaaaaaa-0000-4000-8000-00000000000a', 'expense', current_date, 4550,
   'a0000001-0000-4000-8000-000000000001', 'a0000004-0000-4000-8000-000000000004', 'A market'),
  ('b0000007-0000-4000-8000-000000000007', 'bbbbbbbb-0000-4000-8000-00000000000b', 'expense', current_date, 1200,
   'b0000001-0000-4000-8000-000000000001', 'b0000004-0000-4000-8000-000000000004', 'B market');

insert into public.budgets (id, user_id, category_id, month, amount_minor) values
  ('a0000008-0000-4000-8000-000000000008', 'aaaaaaaa-0000-4000-8000-00000000000a',
   'a0000004-0000-4000-8000-000000000004', date_trunc('month', current_date)::date, 20000);

insert into public.goals (id, user_id, account_id, name) values
  ('a0000009-0000-4000-8000-000000000009', 'aaaaaaaa-0000-4000-8000-00000000000a',
   'a0000002-0000-4000-8000-000000000002', 'A emergency fund');

insert into public.audit_events (id, user_id, event, row_count) overriding system value values
  (901, 'aaaaaaaa-0000-4000-8000-00000000000a', 'export', 3);

-- ---------------------------------------------------------------------------
-- References: B's own row may not point at anything of A's. A composite
-- foreign key carries user_id, so the target simply does not exist for B.
-- ---------------------------------------------------------------------------
create temporary table refs (what text primary key, stmt text not null) on commit drop;
insert into refs values
  ('a transaction drawn on A''s account',
   $$insert into public.transactions (kind, occurred_on, amount_minor, from_account_id, description)
     values ('expense', current_date, 100, 'a0000001-0000-4000-8000-000000000001', 'x')$$),
  ('a transaction filed under A''s category',
   $$insert into public.transactions (kind, occurred_on, amount_minor, from_account_id, category_id, description)
     values ('expense', current_date, 100, 'b0000001-0000-4000-8000-000000000001',
             'a0000004-0000-4000-8000-000000000004', 'x')$$),
  ('a transaction tied to A''s bill',
   $$insert into public.transactions (kind, occurred_on, amount_minor, from_account_id, description, recurring_item_id)
     values ('expense', current_date, 100, 'b0000001-0000-4000-8000-000000000001', 'x',
             'a0000006-0000-4000-8000-000000000006')$$),
  ('a transaction tied to A''s import batch',
   $$insert into public.transactions (kind, occurred_on, amount_minor, from_account_id, description, import_batch_id)
     values ('expense', current_date, 100, 'b0000001-0000-4000-8000-000000000001', 'x',
             'a0000005-0000-4000-8000-000000000005')$$),
  ('a budget for A''s category',
   $$insert into public.budgets (category_id, month, amount_minor)
     values ('a0000004-0000-4000-8000-000000000004', date_trunc('month', current_date)::date, 1)$$),
  ('a goal backed by A''s account',
   $$insert into public.goals (account_id, name) values ('a0000002-0000-4000-8000-000000000002', 'x')$$),
  ('a category inside A''s group',
   $$insert into public.categories (group_id, name, kind)
     values ('a0000003-0000-4000-8000-000000000003', 'x', 'expense')$$),
  ('a bill drawn on A''s account',
   $$insert into public.recurring_items (name, label, kind, amount_minor, from_account_id, cadence_unit, anchor_on, next_due_on)
     values ('x', 'bill', 'expense', 1, 'a0000001-0000-4000-8000-000000000001', 'month', current_date, current_date)$$);

select is(tests.refused('bbbbbbbb-0000-4000-8000-00000000000b', stmt), '23503',
          'B cannot create ' || what)
  from refs;

-- B cannot reach A's bill through the RPC either.
select is(tests.refused('bbbbbbbb-0000-4000-8000-00000000000b',
                        $$select public.mark_bill_paid('a0000006-0000-4000-8000-000000000006')$$),
          'P0002', 'B cannot mark A''s bill as paid');

-- ---------------------------------------------------------------------------
-- anon: no table, no view, no function.
-- ---------------------------------------------------------------------------
select is(tests.refused(null, format('select count(*) from public.%I', relname)), '42501',
          'anon cannot read ' || relname)
  from (select c.relname from pg_catalog.pg_class c
          join pg_catalog.pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public' and c.relkind in ('r', 'v')) rels;

select is(tests.refused(null,
            $$insert into public.accounts (name, type) values ('x', 'cash')$$),
          '42501', 'anon cannot write');

select is(tests.refused(null, stmt), '42501', 'anon cannot call ' || split_part(stmt, '(', 1))
  from (values
    ($$select public.copy_budgets(date_trunc('month', current_date)::date,
                                  (date_trunc('month', current_date) + interval '1 month')::date)$$),
    ($$select public.mark_bill_paid('a0000006-0000-4000-8000-000000000006')$$),
    ($$select public.import_transactions('{}'::jsonb, '[]'::jsonb)$$),
    ($$select public.merge_categories('a0000004-0000-4000-8000-000000000004',
                                      'b0000004-0000-4000-8000-000000000004')$$),
    ($$select public.log_event('export')$$)
  ) as calls(stmt);

-- ---------------------------------------------------------------------------
-- Deleting a person removes their rows, and only theirs.
-- ---------------------------------------------------------------------------
create temporary table before_delete as
  select 'transactions' as tbl, count(*) as n from public.transactions where user_id = 'bbbbbbbb-0000-4000-8000-00000000000b';

delete from auth.users where id = 'aaaaaaaa-0000-4000-8000-00000000000a';

select is((select count(*)::int from public.profiles where id = 'aaaaaaaa-0000-4000-8000-00000000000a'),
          0, 'deleting the auth user removed their profile');

select is((select sum(n)::int from (
             select count(*) as n from public.accounts        where user_id = 'aaaaaaaa-0000-4000-8000-00000000000a'
             union all select count(*) from public.categories where user_id = 'aaaaaaaa-0000-4000-8000-00000000000a'
             union all select count(*) from public.category_groups where user_id = 'aaaaaaaa-0000-4000-8000-00000000000a'
             union all select count(*) from public.transactions  where user_id = 'aaaaaaaa-0000-4000-8000-00000000000a'
             union all select count(*) from public.budgets       where user_id = 'aaaaaaaa-0000-4000-8000-00000000000a'
             union all select count(*) from public.goals         where user_id = 'aaaaaaaa-0000-4000-8000-00000000000a'
             union all select count(*) from public.recurring_items where user_id = 'aaaaaaaa-0000-4000-8000-00000000000a'
             union all select count(*) from public.import_batches  where user_id = 'aaaaaaaa-0000-4000-8000-00000000000a'
             union all select count(*) from public.audit_events    where user_id = 'aaaaaaaa-0000-4000-8000-00000000000a'
           ) counts), 0, 'every one of their rows went with them');

select is((select count(*)::int from public.transactions where user_id = 'bbbbbbbb-0000-4000-8000-00000000000b'),
          (select n::int from before_delete where tbl = 'transactions'),
          'B''s rows were untouched');

select * from finish();
rollback;
