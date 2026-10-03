-- Phase 4 of the reports and dashboards plan: what the Month and Category
-- pages need to say whether a month or a category is going as usual. Three
-- read-only functions, all run as the caller, so row-level security on
-- transactions and budgets decides what they see; and category_month_totals
-- now counts spending with no category, as one row per month.
--
-- A typical month follows month_to_date: the 6 complete months before, each
-- cut at the same day of the month (or its last day, when it is shorter),
-- leaving out months with no income or expenses at all. "Today" comes from
-- the profile's time zone; p_today pins it for tests.

-- ---------------------------------------------------------------------------
-- category_month_totals, again: the same rows, plus one per month for
-- expenses with no category (category_id null). Income without a category
-- stays out, as before: it is not spending, and nothing reads it here.
-- ---------------------------------------------------------------------------
drop view public.category_month_totals;

create view public.category_month_totals with (security_invoker = true) as
  select t.user_id,
         t.category_id,
         coalesce(t.category_kind, 'expense'::public.category_kind) as kind,
         date_trunc('month', t.occurred_on)::date as month,
         sum(t.amount_minor)::bigint as total_minor,
         count(*)::bigint            as txn_count
    from public.transactions t
   where t.category_id is not null
      or t.kind = 'expense'
   group by t.user_id, t.category_id, coalesce(t.category_kind, 'expense'::public.category_kind), date_trunc('month', t.occurred_on)::date;

revoke all on public.category_month_totals from anon, authenticated, service_role;
grant select on public.category_month_totals to authenticated;

-- ---------------------------------------------------------------------------
-- Spending day by day through one month, and the running total, against a
-- typical month's running total on each day of the month. With a category,
-- only that category's spending.
--
-- Every day of the month has a row. after_today marks the days still to come
-- in the current month, which the chart leaves undrawn; a past month has
-- none. The running total on the last day is the month's money out.
-- ---------------------------------------------------------------------------
create function public.daily_spending(p_month date, p_category_id uuid default null, p_today date default null)
returns table (
  day                   date,
  day_of_month          integer,
  spent_minor           bigint,
  running_minor         bigint,
  typical_running_minor bigint,
  typical_months        integer,
  after_today           boolean)
language sql
stable
security invoker
set search_path = ''
as $$
  with base as (
    select pg_catalog.date_trunc('month', p_month)::date as m,
           coalesce(
             p_today,
             (select (pg_catalog.now() at time zone p.timezone)::date
                from public.profiles p
               where p.id = (select auth.uid())),
             (pg_catalog.now() at time zone 'UTC')::date) as t
  ),
  span as (
    select b.m, b.t, ((b.m + interval '1 month')::date - b.m) as dim
      from base b
  ),
  days as (
    select (s.m + k)::date as d, k + 1 as dom
      from span s, pg_catalog.generate_series(0, s.dim - 1) k
  ),
  spent as (
    select tx.occurred_on as d, sum(tx.amount_minor) as amt
      from public.transactions tx, span s
     where tx.kind = 'expense'
       and (p_category_id is null or tx.category_id = p_category_id)
       and tx.occurred_on >= s.m
       and tx.occurred_on <  (s.m + interval '1 month')::date
     group by tx.occurred_on
  ),
  -- The 6 months before with any income or expense.
  prev as (
    select (s.m - pg_catalog.make_interval(months => k))::date as pm
      from span s, pg_catalog.generate_series(1, 6) k
  ),
  active as (
    select p.pm
      from prev p
     where exists (
             select 1
               from public.transactions tx
              where tx.kind <> 'transfer'
                and tx.occurred_on >= p.pm
                and tx.occurred_on <  (p.pm + interval '1 month')::date)
  ),
  prev_daily as (
    select a.pm, (tx.occurred_on - a.pm) + 1 as dom, sum(tx.amount_minor) as amt
      from active a
      join public.transactions tx
        on tx.kind = 'expense'
       and (p_category_id is null or tx.category_id = p_category_id)
       and tx.occurred_on >= a.pm
       and tx.occurred_on <  (a.pm + interval '1 month')::date
     group by a.pm, tx.occurred_on
  ),
  -- Each earlier month's running total on every day of this month; past its
  -- own last day it simply holds its whole-month total.
  prev_running as (
    select a.pm,
           dy.dom,
           sum(coalesce(pd.amt, 0)) over (partition by a.pm order by dy.dom) as run
      from active a
     cross join days dy
      left join prev_daily pd on pd.pm = a.pm and pd.dom = dy.dom
  ),
  typical as (
    select pr.dom, round(avg(pr.run)) as run
      from prev_running pr
     group by pr.dom
  )
  select dy.d,
         dy.dom::integer,
         coalesce(sp.amt, 0)::bigint,
         (sum(coalesce(sp.amt, 0)) over (order by dy.dom))::bigint,
         coalesce(ty.run, 0)::bigint,
         (select count(*) from active)::integer,
         dy.d > s.t
    from days dy
    cross join span s
    left join spent sp on sp.d = dy.d
    left join typical ty on ty.dom = dy.dom
   order by dy.dom;
$$;

-- ---------------------------------------------------------------------------
-- Spending by category in one month so far, against a typical month cut at
-- the same day. category_id is null for spending with no category. A
-- category appears when it has spending this month or in a typical one.
-- ---------------------------------------------------------------------------
create function public.month_categories(p_month date, p_today date default null)
returns table (
  category_id    uuid,
  spent_minor    bigint,
  typical_minor  bigint,
  typical_months integer)
language sql
stable
security invoker
set search_path = ''
as $$
  with base as (
    select pg_catalog.date_trunc('month', p_month)::date as m,
           coalesce(
             p_today,
             (select (pg_catalog.now() at time zone p.timezone)::date
                from public.profiles p
               where p.id = (select auth.uid())),
             (pg_catalog.now() at time zone 'UTC')::date) as t
  ),
  span as (
    select b.m,
           case
             when b.t < b.m then 0
             when b.t >= (b.m + interval '1 month')::date then (b.m + interval '1 month')::date - b.m
             else b.t - b.m + 1
           end as d
      from base b
  ),
  prev as (
    select (s.m - pg_catalog.make_interval(months => k))::date as pm
      from span s, pg_catalog.generate_series(1, 6) k
  ),
  active as (
    select p.pm
      from prev p
     where exists (
             select 1
               from public.transactions tx
              where tx.kind <> 'transfer'
                and tx.occurred_on >= p.pm
                and tx.occurred_on <  (p.pm + interval '1 month')::date)
  ),
  n as (select count(*) as months from active),
  cur as (
    select tx.category_id, sum(tx.amount_minor) as amt
      from public.transactions tx, span s
     where tx.kind = 'expense'
       and tx.occurred_on >= s.m
       and tx.occurred_on <  s.m + s.d
     group by tx.category_id
  ),
  before as (
    select tx.category_id, sum(tx.amount_minor) as amt
      from active a
      cross join span s
      join public.transactions tx
        on tx.kind = 'expense'
       and tx.occurred_on >= a.pm
       and tx.occurred_on <  a.pm + least(s.d, (a.pm + interval '1 month')::date - a.pm)
     group by tx.category_id
  ),
  -- Every category seen in either, the one with no category included.
  ids as (
    select cur.category_id from cur
    union
    select before.category_id from before
  )
  select i.category_id,
         coalesce(c.amt, 0)::bigint,
         case when n.months > 0 then round(coalesce(b.amt, 0)::numeric / n.months) else 0 end::bigint,
         n.months::integer
    from ids i
    left join cur c    on c.category_id is not distinct from i.category_id
    left join before b on b.category_id is not distinct from i.category_id
   cross join n
   order by coalesce(c.amt, 0) desc, 3 desc;
$$;

-- ---------------------------------------------------------------------------
-- One category over the 12 complete months before p_month, for its page:
--   this_month_minor   p_month's total, the whole month
--   plan_minor         p_month's plan, or null
--   typical_minor      the average month since the category was first used in
--                      those 12 (quiet months after that count as zero); null
--                      when it was not used at all
--   low_minor, high_minor, months   the range over those same months
--   last3_minor, prev3_minor        the 3 complete months before p_month,
--                                   and the 3 before those
--   total_minor        the 12 months' total; kind_total_minor every category
--                      of the same kind over them (for the share)
--   rank, ranked       its place by total among the categories of its kind
--                      used in those months
--   planned_months, over_plan_months   months with a plan, and of those,
--                                      months spent above it
-- ---------------------------------------------------------------------------
create function public.category_stats(p_category_id uuid, p_month date)
returns table (
  this_month_minor bigint,
  plan_minor       bigint,
  typical_minor    bigint,
  low_minor        bigint,
  high_minor       bigint,
  months           integer,
  last3_minor      bigint,
  prev3_minor      bigint,
  total_minor      bigint,
  kind_total_minor bigint,
  rank             integer,
  ranked           integer,
  planned_months   integer,
  over_plan_months integer)
language sql
stable
security invoker
set search_path = ''
as $$
  with span as (
    select pg_catalog.date_trunc('month', p_month)::date as m
  ),
  cat as (
    select c.id, c.kind from public.categories c where c.id = p_category_id
  ),
  window_months as (
    select (s.m - pg_catalog.make_interval(months => k))::date as wm, k
      from span s, pg_catalog.generate_series(1, 12) k
  ),
  monthly as (
    select w.wm, w.k, coalesce(sum(tx.amount_minor), 0) as amt
      from window_months w
      left join public.transactions tx
        on tx.category_id = p_category_id
       and tx.occurred_on >= w.wm
       and tx.occurred_on <  (w.wm + interval '1 month')::date
     group by w.wm, w.k
  ),
  first_used as (
    select max(mo.k) as k from monthly mo where mo.amt > 0
  ),
  used as (
    select mo.* from monthly mo, first_used f where mo.k <= f.k
  ),
  -- Every category of the same kind over the 12 months, for share and rank.
  peers as (
    select tx.category_id, sum(tx.amount_minor) as amt
      from public.transactions tx
      cross join span s
      join cat on cat.kind = tx.category_kind
     where tx.category_id is not null
       and tx.occurred_on >= (s.m - interval '12 months')::date
       and tx.occurred_on <  s.m
     group by tx.category_id
  ),
  plans as (
    select b.month, b.amount_minor, coalesce(mo.amt, 0) as spent
      from public.budgets b
      join monthly mo on mo.wm = b.month
     where b.category_id = p_category_id
  )
  select
    (select coalesce(sum(tx.amount_minor), 0)
       from public.transactions tx, span s
      where tx.category_id = p_category_id
        and tx.occurred_on >= s.m
        and tx.occurred_on <  (s.m + interval '1 month')::date)::bigint,
    (select b.amount_minor from public.budgets b, span s
      where b.category_id = p_category_id and b.month = s.m),
    (select round(avg(u.amt)) from used u)::bigint,
    (select min(u.amt) from used u)::bigint,
    (select max(u.amt) from used u)::bigint,
    (select count(*) from used)::integer,
    (select coalesce(sum(mo.amt), 0) from monthly mo where mo.k between 1 and 3)::bigint,
    (select coalesce(sum(mo.amt), 0) from monthly mo where mo.k between 4 and 6)::bigint,
    (select coalesce(sum(mo.amt), 0) from monthly mo)::bigint,
    (select coalesce(sum(p.amt), 0) from peers p)::bigint,
    (select case when coalesce(sum(mo.amt), 0) = 0 then null
                 else (select count(*) + 1 from peers p where p.amt > (select sum(mo2.amt) from monthly mo2))
            end
       from monthly mo)::integer,
    (select count(*) from peers)::integer,
    (select count(*) from plans)::integer,
    (select count(*) from plans p where p.spent > p.amount_minor)::integer
  from cat;
$$;

revoke execute on function public.daily_spending(date, uuid, date) from public, anon, authenticated, service_role;
revoke execute on function public.month_categories(date, date)     from public, anon, authenticated, service_role;
revoke execute on function public.category_stats(uuid, date)        from public, anon, authenticated, service_role;
grant  execute on function public.daily_spending(date, uuid, date) to authenticated;
grant  execute on function public.month_categories(date, date)     to authenticated;
grant  execute on function public.category_stats(uuid, date)        to authenticated;
