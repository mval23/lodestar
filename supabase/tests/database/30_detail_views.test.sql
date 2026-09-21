-- Detail pages: the five views and one function added for them. Each runs as
-- the caller, so B must see nothing of A's through any of them, a direct
-- filter on A's ids must come back empty rather than refused, and anon must
-- be refused outright.
--
-- Synthetic data only: no real names, amounts or descriptions.
-- Run with: supabase test db   (needs `supabase start`)

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

create function tests.count_as(uid uuid, stmt text) returns int
language plpgsql as $$
declare n int;
begin
  perform tests.act_as(uid);
  execute format('select count(*) from (%s) q', stmt) into n;
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', '', true);
  return n;
end $$;

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
-- Fixtures, inserted as the table owner. Every assertion runs as
-- `authenticated` or `anon`, where RLS applies.
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data) values
  ('aaaaaaaa-0000-4000-8000-00000000000a', 'synthetic-a@example.test', '{"timezone":"UTC"}'),
  ('bbbbbbbb-0000-4000-8000-00000000000b', 'synthetic-b@example.test', '{"timezone":"UTC"}');

insert into public.accounts (id, user_id, name, type, opening_balance_minor) values
  ('a0000001-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-00000000000a', 'A checking', 'checking', 100000),
  ('a0000002-0000-4000-8000-000000000002', 'aaaaaaaa-0000-4000-8000-00000000000a', 'A fund', 'savings', 0),
  ('b0000001-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-00000000000b', 'B checking', 'checking', 5000);

insert into public.categories (id, user_id, name, kind) values
  ('a0000004-0000-4000-8000-000000000004', 'aaaaaaaa-0000-4000-8000-00000000000a', 'A groceries', 'expense'),
  ('b0000004-0000-4000-8000-000000000004', 'bbbbbbbb-0000-4000-8000-00000000000b', 'B groceries', 'expense');

insert into public.goals (id, user_id, account_id, name) values
  ('a0000009-0000-4000-8000-000000000009', 'aaaaaaaa-0000-4000-8000-00000000000a',
   'a0000002-0000-4000-8000-000000000002', 'A fund goal');

insert into public.recurring_items
  (id, user_id, name, label, kind, amount_minor, from_account_id, category_id, cadence_unit, anchor_on, next_due_on) values
  ('a0000006-0000-4000-8000-000000000006', 'aaaaaaaa-0000-4000-8000-00000000000a', 'A bill', 'bill', 'expense', 4550,
   'a0000001-0000-4000-8000-000000000001', 'a0000004-0000-4000-8000-000000000004', 'month',
   date_trunc('month', current_date)::date, date_trunc('month', current_date)::date);

insert into public.transactions
  (id, user_id, kind, occurred_on, amount_minor, from_account_id, to_account_id, category_id, recurring_item_id, description) values
  ('a0000007-0000-4000-8000-000000000007', 'aaaaaaaa-0000-4000-8000-00000000000a', 'expense', current_date, 4550,
   'a0000001-0000-4000-8000-000000000001', null, 'a0000004-0000-4000-8000-000000000004',
   'a0000006-0000-4000-8000-000000000006', 'A market'),
  ('a000000a-0000-4000-8000-00000000000a', 'aaaaaaaa-0000-4000-8000-00000000000a', 'transfer', current_date, 20000,
   'a0000001-0000-4000-8000-000000000001', 'a0000002-0000-4000-8000-000000000002', null, null, 'A to fund'),
  ('b0000007-0000-4000-8000-000000000007', 'bbbbbbbb-0000-4000-8000-00000000000b', 'expense', current_date, 1200,
   'b0000001-0000-4000-8000-000000000001', null, 'b0000004-0000-4000-8000-000000000004', null, 'B market');

-- A sees its own rows through every view, so the empty results below are
-- about isolation, not about an empty fixture.
select ok(tests.count_as('aaaaaaaa-0000-4000-8000-00000000000a', 'select * from public.' || v) > 0,
          'A sees its own rows in ' || v)
  from unnest(array['account_month_flow', 'account_ledger', 'category_month_totals', 'month_summary', 'recurring_item_months']) v;

select ok(tests.count_as('aaaaaaaa-0000-4000-8000-00000000000a',
            $$select * from public.category_top_descriptions('a0000004-0000-4000-8000-000000000004',
                current_date - 31, current_date + 1)$$) = 1,
          'A sees its own category through category_top_descriptions');

-- B, filtering on A's ids directly, gets nothing: RLS matches no rows.
select is(tests.count_as('bbbbbbbb-0000-4000-8000-00000000000b',
            format('select * from public.%I where user_id = %L', v, 'aaaaaaaa-0000-4000-8000-00000000000a')),
          0, 'B sees none of A''s rows in ' || v)
  from unnest(array['account_month_flow', 'account_ledger', 'category_month_totals', 'month_summary', 'recurring_item_months']) v;

select is(tests.count_as('bbbbbbbb-0000-4000-8000-00000000000b',
            $$select * from public.account_month_flow where account_id = 'a0000001-0000-4000-8000-000000000001'$$),
          0, 'B cannot read A''s account history by id');

select is(tests.count_as('bbbbbbbb-0000-4000-8000-00000000000b',
            $$select * from public.recurring_item_months where recurring_item_id = 'a0000006-0000-4000-8000-000000000006'$$),
          0, 'B cannot read A''s bill history by id');

select is(tests.count_as('bbbbbbbb-0000-4000-8000-00000000000b',
            $$select * from public.category_top_descriptions('a0000004-0000-4000-8000-000000000004',
                current_date - 31, current_date + 1)$$),
          0, 'B gets nothing for A''s category through category_top_descriptions');

-- B's own figures never include A's money moved into A's goal.
select is(tests.count_as('bbbbbbbb-0000-4000-8000-00000000000b',
            $$select * from public.month_summary where to_goals_minor <> 0$$),
          0, 'B''s month_summary carries no goal money of A''s');

-- anon is refused, not merely shown nothing.
select is(tests.refused(null, 'select count(*) from public.' || v), '42501', 'anon cannot read ' || v)
  from unnest(array['account_month_flow', 'account_ledger', 'category_month_totals', 'month_summary', 'recurring_item_months']) v;

select is(tests.refused(null,
            $$select * from public.category_top_descriptions(gen_random_uuid(), current_date, current_date + 1)$$),
          '42501', 'anon cannot call category_top_descriptions');

select * from finish();
rollback;
