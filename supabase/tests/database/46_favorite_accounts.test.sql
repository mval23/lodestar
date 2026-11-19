-- Favorite accounts: a person can star their own accounts and no one else's,
-- account_balances carries the star, and starring moves no figure.
-- Synthetic data only: no real names, amounts or descriptions.
-- Run with: supabase test db   (needs `supabase start`)
--
-- Every assertion runs as the test owner: changes are made as a person with
-- tests.act_as and a plain `reset role` after, and reads as a person go
-- through tests.count_as, which switches and resets inside itself.

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

insert into auth.users (id, email, raw_user_meta_data) values
  ('aaaaaaaa-0000-4000-8000-00000000000a', 'synthetic-a@example.test', '{"timezone":"UTC"}'),
  ('bbbbbbbb-0000-4000-8000-00000000000b', 'synthetic-b@example.test', '{"timezone":"UTC"}');

insert into public.accounts (id, user_id, name, type, opening_balance_minor) values
  ('a0000001-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-00000000000a', 'A checking', 'checking', 100000);

select has_column('public', 'accounts', 'is_favorite', 'accounts has is_favorite');
select col_not_null('public', 'accounts', 'is_favorite', 'is_favorite is not null');
select col_default_is('public', 'accounts', 'is_favorite', 'false', 'is_favorite defaults to false');
select has_column('public', 'account_balances', 'is_favorite', 'account_balances carries is_favorite');
select ok(has_column_privilege('authenticated', 'public.accounts', 'is_favorite', 'UPDATE'), 'a person may set it');
select ok(not has_column_privilege('anon', 'public.accounts', 'is_favorite', 'UPDATE'), 'anon may not');

-- B tries to star A's account: nothing changes.
select tests.act_as('bbbbbbbb-0000-4000-8000-00000000000b');
update public.accounts set is_favorite = true where id = 'a0000001-0000-4000-8000-000000000001';
reset role;
select is((select is_favorite from public.accounts where id = 'a0000001-0000-4000-8000-000000000001'), false,
          'B cannot star A''s account');

-- A stars it; the balance stays what it was.
select tests.act_as('aaaaaaaa-0000-4000-8000-00000000000a');
update public.accounts set is_favorite = true where id = 'a0000001-0000-4000-8000-000000000001';
reset role;
select is((select is_favorite from public.account_balances where account_id = 'a0000001-0000-4000-8000-000000000001'), true,
          'A stars their own account');
select is((select balance_minor from public.account_balances where account_id = 'a0000001-0000-4000-8000-000000000001'), 100000::bigint,
          'starring moves no balance');

-- A sees the star; B sees none of it.
select is(tests.count_as('aaaaaaaa-0000-4000-8000-00000000000a',
            $$select 1 from public.account_balances where is_favorite$$),
          1, 'A sees their star in account_balances');
select is(tests.count_as('bbbbbbbb-0000-4000-8000-00000000000b',
            $$select 1 from public.account_balances where is_favorite$$),
          0, 'B sees no one else''s stars');

select * from finish();
rollback;
