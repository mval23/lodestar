-- The Phase 5 reports: report_category_months, report_category_totals,
-- budget_month_results, budget_month_summary and the goal_month_flow view.
-- All run as the caller, so B must get only B's own spending and plans,
-- even when B names A's accounts, and anon must be refused outright. The
-- figures are checked by hand in supabase/tests/check-schema.mjs.
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
-- Fixtures, inserted as the table owner, all in the current month.
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

insert into public.budgets (user_id, category_id, month, amount_minor) values
  ('aaaaaaaa-0000-4000-8000-00000000000a', 'a0000004-0000-4000-8000-000000000004',
   date_trunc('month', current_date)::date, 30000),
  ('bbbbbbbb-0000-4000-8000-00000000000b', 'b0000004-0000-4000-8000-000000000004',
   date_trunc('month', current_date)::date, 2000);

insert into public.recurring_items
  (id, user_id, name, label, kind, amount_minor, from_account_id, category_id, cadence_unit, anchor_on, next_due_on) values
  ('a0000006-0000-4000-8000-000000000006', 'aaaaaaaa-0000-4000-8000-00000000000a', 'A bill', 'bill', 'expense', 4550,
   'a0000001-0000-4000-8000-000000000001', 'a0000004-0000-4000-8000-000000000004', 'month',
   date_trunc('month', current_date)::date, date_trunc('month', current_date)::date);

insert into public.transactions
  (id, user_id, kind, occurred_on, amount_minor, from_account_id, to_account_id, category_id, description) values
  ('a0000007-0000-4000-8000-000000000007', 'aaaaaaaa-0000-4000-8000-00000000000a', 'expense',
   date_trunc('month', current_date)::date, 4550,
   'a0000001-0000-4000-8000-000000000001', null, 'a0000004-0000-4000-8000-000000000004', 'A market'),
  ('a000000a-0000-4000-8000-00000000000a', 'aaaaaaaa-0000-4000-8000-00000000000a', 'transfer',
   date_trunc('month', current_date)::date, 20000,
   'a0000001-0000-4000-8000-000000000001', 'a0000002-0000-4000-8000-000000000002', null, 'A to fund'),
  ('b0000007-0000-4000-8000-000000000007', 'bbbbbbbb-0000-4000-8000-00000000000b', 'expense',
   date_trunc('month', current_date)::date, 1200,
   'b0000001-0000-4000-8000-000000000001', null, 'b0000004-0000-4000-8000-000000000004', 'B market');

-- A sees its own figures, so the results below are about isolation.
select is(tests.count_as('aaaaaaaa-0000-4000-8000-00000000000a',
            $$select * from public.report_category_totals(date_trunc('month', current_date)::date, (date_trunc('month', current_date) + interval '1 month')::date, (date_trunc('month', current_date) - interval '1 month')::date)
               where category_id = 'a0000004-0000-4000-8000-000000000004' and total_minor = 4550$$),
          1, 'A sees its own category in report_category_totals');

select is(tests.count_as('aaaaaaaa-0000-4000-8000-00000000000a',
            $$select * from public.budget_month_results(date_trunc('month', current_date)::date, (date_trunc('month', current_date) + interval '1 month')::date)
               where planned_minor = 30000 and spent_minor = 4550 and within_plan$$),
          1, 'A sees its own plan in budget_month_results');

-- B gets B's figures only.
select is(tests.count_as('bbbbbbbb-0000-4000-8000-00000000000b',
            $$select * from public.report_category_months(date_trunc('month', current_date)::date, (date_trunc('month', current_date) + interval '1 month')::date)
               where category_id is distinct from 'b0000004-0000-4000-8000-000000000004'$$),
          0, 'B''s category months hold none of A''s categories');

select is(tests.count_as('bbbbbbbb-0000-4000-8000-00000000000b',
            $$select * from public.report_category_totals(date_trunc('month', current_date)::date, (date_trunc('month', current_date) + interval '1 month')::date, (date_trunc('month', current_date) - interval '1 month')::date,
                array['a0000001-0000-4000-8000-000000000001']::uuid[])$$),
          0, 'B naming A''s account gets nothing of it');

select is(tests.count_as('bbbbbbbb-0000-4000-8000-00000000000b',
            $$select * from public.budget_month_results(date_trunc('month', current_date)::date, (date_trunc('month', current_date) + interval '1 month')::date)
               where planned_minor = 2000 and spent_minor = 1200$$),
          1, 'B sees its own plan, and only its own spending against it');

select is(tests.count_as('bbbbbbbb-0000-4000-8000-00000000000b',
            $$select * from public.budget_month_summary(date_trunc('month', current_date)::date)
               where planned_minor = 2000 and spent_planned_minor = 1200 and lines = 1$$),
          1, 'B''s month summary is B''s own');

select is(tests.count_as('bbbbbbbb-0000-4000-8000-00000000000b', $$select * from public.goal_month_flow$$),
          0, 'B sees none of A''s goal months');

select is(tests.count_as('aaaaaaaa-0000-4000-8000-00000000000a',
            $$select * from public.goal_month_flow where month = date_trunc('month', current_date)::date and put_in_minor = 20000$$),
          1, 'A sees its own goal month');

-- anon is refused, not merely shown nothing.
select is(tests.refused(null, $$select * from public.report_category_months(current_date, current_date + 31)$$),
          '42501', 'anon cannot call report_category_months');
select is(tests.refused(null, $$select * from public.report_category_totals(current_date, current_date + 31, current_date - 31)$$),
          '42501', 'anon cannot call report_category_totals');
select is(tests.refused(null, $$select * from public.budget_month_results(current_date, current_date + 31)$$),
          '42501', 'anon cannot call budget_month_results');
select is(tests.refused(null, $$select * from public.budget_month_summary(current_date)$$),
          '42501', 'anon cannot call budget_month_summary');
select is(tests.refused(null, $$select * from public.goal_month_flow$$),
          '42501', 'anon cannot read goal_month_flow');

select * from finish();
rollback;
