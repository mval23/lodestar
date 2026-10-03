-- Phase 5 of the reports and dashboards plan: Spending by category, Budget
-- vs actual, and Savings rate and goals. Everything here runs as the caller,
-- so row-level security decides what it sees; every sum and average happens
-- here, and the browser only formats.
--
-- Periods are [p_from, p_to): p_to is the first day after the period, as in
-- report_cash_flow. With p_account_ids, spending counts only when it left
-- one of those accounts.

-- ---------------------------------------------------------------------------
-- Spending per category per month, for the stacked bars. category_id is null
-- for expenses with no category. Months with no spending have no rows.
-- ---------------------------------------------------------------------------
create function public.report_category_months(p_from date, p_to date, p_account_ids uuid[] default null)
returns table (
  category_id uuid,
  month       date,
  total_minor bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select t.category_id,
         pg_catalog.date_trunc('month', t.occurred_on)::date,
         sum(t.amount_minor)::bigint
    from public.transactions t
   where t.kind = 'expense'
     and t.occurred_on >= p_from
     and t.occurred_on <  p_to
     and (p_account_ids is null or t.from_account_id = any (p_account_ids))
   group by t.category_id, pg_catalog.date_trunc('month', t.occurred_on)::date
   order by 2, 3 desc;
$$;

-- ---------------------------------------------------------------------------
-- Spending per category over the period and over a comparison period of the
-- same length starting at p_compare_from, for the ranked table. A category
-- appears when it has spending in either. Largest first.
-- ---------------------------------------------------------------------------
create function public.report_category_totals(
  p_from date, p_to date, p_compare_from date, p_account_ids uuid[] default null)
returns table (
  category_id    uuid,
  total_minor    bigint,
  txn_count      integer,
  compare_minor  bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  with span as (
    select p_from as f, p_to as t, p_compare_from as cf,
           ((extract(year from p_to)::integer * 12 + extract(month from p_to)::integer)
          - (extract(year from p_from)::integer * 12 + extract(month from p_from)::integer)) as n
  ),
  scoped as (
    select t.category_id, t.amount_minor, t.occurred_on
      from public.transactions t
     where t.kind = 'expense'
       and (p_account_ids is null or t.from_account_id = any (p_account_ids))
  ),
  cur as (
    select s.category_id, sum(s.amount_minor) as amt, count(*) as n
      from scoped s, span sp
     where s.occurred_on >= sp.f and s.occurred_on < sp.t
     group by s.category_id
  ),
  cmp as (
    select s.category_id, sum(s.amount_minor) as amt
      from scoped s, span sp
     where s.occurred_on >= sp.cf
       and s.occurred_on <  (sp.cf + pg_catalog.make_interval(months => sp.n))::date
     group by s.category_id
  ),
  ids as (
    select cur.category_id from cur
    union
    select cmp.category_id from cmp
  )
  select i.category_id,
         coalesce(c.amt, 0)::bigint,
         coalesce(c.n, 0)::integer,
         coalesce(p.amt, 0)::bigint
    from ids i
    left join cur c on c.category_id is not distinct from i.category_id
    left join cmp p on p.category_id is not distinct from i.category_id
   order by 2 desc, 4 desc;
$$;

-- ---------------------------------------------------------------------------
-- Each month of [p_from, p_to): every category with a plan or with spending,
-- its plan (null when it has none), what was spent, and whether that stayed
-- within the plan (null without a plan). Spent counts expenses only, as
-- budget_progress does, and agrees with it to the cent. Expenses with no
-- category are one row with category_id null and no plan.
-- ---------------------------------------------------------------------------
create function public.budget_month_results(p_from date, p_to date)
returns table (
  category_id   uuid,
  month         date,
  planned_minor bigint,
  spent_minor   bigint,
  within_plan   boolean)
language sql
stable
security invoker
set search_path = ''
as $$
  with spent as (
    select t.category_id, pg_catalog.date_trunc('month', t.occurred_on)::date as m, sum(t.amount_minor) as amt
      from public.transactions t
     where t.kind = 'expense'
       and t.occurred_on >= pg_catalog.date_trunc('month', p_from)::date
       and t.occurred_on <  p_to
     group by t.category_id, pg_catalog.date_trunc('month', t.occurred_on)::date
  ),
  plans as (
    select b.category_id, b.month as m, b.amount_minor as amt
      from public.budgets b
     where b.month >= pg_catalog.date_trunc('month', p_from)::date
       and b.month <  p_to
  ),
  keys as (
    select s.category_id, s.m from spent s
    union
    select p.category_id, p.m from plans p
  )
  select k.category_id,
         k.m,
         p.amt::bigint,
         coalesce(s.amt, 0)::bigint,
         case when p.amt is null then null else coalesce(s.amt, 0) <= p.amt end
    from keys k
    left join plans p on p.category_id = k.category_id and p.m = k.m
    left join spent s on s.category_id is not distinct from k.category_id and s.m = k.m
   order by k.m, p.amt desc nulls last, coalesce(s.amt, 0) desc;
$$;

-- ---------------------------------------------------------------------------
-- One month's plan in a line, and how well plans have held over the 12
-- months ending with it:
--   planned_minor         every plan this month
--   spent_planned_minor   spent in categories with a plan
--   unplanned_minor       spent in categories without one
--   uncategorized_minor   spent with no category
--   lines, within         plans this month, and how many stayed within
--   history_lines, history_within   the same over the 12 months
--   first_month           the first month with any plan, or null
-- ---------------------------------------------------------------------------
create function public.budget_month_summary(p_month date)
returns table (
  planned_minor       bigint,
  spent_planned_minor bigint,
  unplanned_minor     bigint,
  uncategorized_minor bigint,
  lines               integer,
  within              integer,
  history_lines       integer,
  history_within      integer,
  first_month         date)
language sql
stable
security invoker
set search_path = ''
as $$
  with m as (select pg_catalog.date_trunc('month', p_month)::date as m),
  now_rows as (
    select r.* from m, public.budget_month_results(m.m, (m.m + interval '1 month')::date) r
  ),
  past as (
    select r.*
      from m, public.budget_month_results((m.m - interval '11 months')::date, (m.m + interval '1 month')::date) r
     where r.planned_minor is not null
  )
  select
    (select coalesce(sum(n.planned_minor), 0) from now_rows n)::bigint,
    (select coalesce(sum(n.spent_minor), 0) from now_rows n where n.planned_minor is not null)::bigint,
    (select coalesce(sum(n.spent_minor), 0) from now_rows n where n.planned_minor is null and n.category_id is not null)::bigint,
    (select coalesce(sum(n.spent_minor), 0) from now_rows n where n.category_id is null)::bigint,
    (select count(*) from now_rows n where n.planned_minor is not null)::integer,
    (select count(*) from now_rows n where n.within_plan)::integer,
    (select count(*) from past)::integer,
    (select count(*) from past p where p.within_plan)::integer,
    (select min(b.month) from public.budgets b);
$$;

-- ---------------------------------------------------------------------------
-- Each goal, month by month: what was put into its account by transfer,
-- what was taken out, and the balance at the month's end. Every month the
-- account has existed has a row, from account_month_flow.
-- ---------------------------------------------------------------------------
create view public.goal_month_flow with (security_invoker = true) as
  select g.user_id,
         g.id as goal_id,
         g.account_id,
         f.month,
         f.transfer_in_minor  as put_in_minor,
         f.transfer_out_minor as taken_out_minor,
         f.closing_balance_minor
    from public.goals g
    join public.account_month_flow f on f.user_id = g.user_id and f.account_id = g.account_id;

revoke all on public.goal_month_flow from anon, authenticated, service_role;
grant select on public.goal_month_flow to authenticated;

-- ---------------------------------------------------------------------------
-- goal_progress, with four more columns at the end:
--   needed_monthly_minor   to reach the target by its date: what is left over
--                          the months between this one and the date's (all
--                          of it when the date is this month or past), null
--                          without a target and a date
--   avg_put_in_minor       the average put in over the 6 complete months
--                          before this one, quiet months as zero
--   months_put_in          how many of those 6 had money put in
--   estimated_month        at that pace, the month the target is reached;
--                          only with a target, money still to go, and 3 or
--                          more of those months with money put in
-- ---------------------------------------------------------------------------
create or replace view public.goal_progress with (security_invoker = true) as
  select g.user_id,
         g.id as goal_id,
         g.account_id,
         g.name,
         g.target_minor,
         g.target_date,
         g.monthly_plan_minor,
         g.sort_order,
         g.achieved_at,
         g.archived_at,
         ab.balance_minor,
         (g.target_minor - ab.balance_minor)::bigint as remaining_minor,
         m.this_month,
         coalesce(c.contributed, 0)::bigint as this_month_contributed_minor,
         case
           when g.target_minor is null or g.target_date is null then null
           when ml.months_left > 0 then ceil(greatest(g.target_minor - ab.balance_minor, 0)::numeric / ml.months_left)
           else greatest(g.target_minor - ab.balance_minor, 0)
         end::bigint as needed_monthly_minor,
         round(coalesce(h.put_in, 0)::numeric / 6)::bigint as avg_put_in_minor,
         coalesce(h.months, 0)::integer as months_put_in,
         case
           when g.target_minor is not null
            and g.target_minor > ab.balance_minor
            and coalesce(h.months, 0) >= 3
            and coalesce(h.put_in, 0) > 0
           then (m.this_month + pg_catalog.make_interval(months =>
                  ceil((g.target_minor - ab.balance_minor)::numeric / (h.put_in::numeric / 6))::integer))::date
         end as estimated_month
    from public.goals g
    join public.account_balances ab on ab.user_id = g.user_id and ab.account_id = g.account_id
    join public.profiles p on p.id = g.user_id
    cross join lateral (
      select date_trunc('month', pg_catalog.now() at time zone p.timezone)::date as this_month
    ) m
    cross join lateral (
      select ((extract(year from g.target_date)::integer * 12 + extract(month from g.target_date)::integer)
            - (extract(year from m.this_month)::integer * 12 + extract(month from m.this_month)::integer)) as months_left
    ) ml
    left join lateral (
      select sum(t.amount_minor) as contributed
        from public.transactions t
       where t.user_id = g.user_id
         and t.kind = 'transfer'
         and t.to_account_id = g.account_id
         and t.occurred_on >= m.this_month
         and t.occurred_on <  (m.this_month + interval '1 month')
    ) c on true
    left join lateral (
      select sum(t.amount_minor) as put_in,
             count(distinct date_trunc('month', t.occurred_on)) as months
        from public.transactions t
       where t.user_id = g.user_id
         and t.kind = 'transfer'
         and t.to_account_id = g.account_id
         and t.occurred_on >= (m.this_month - interval '6 months')
         and t.occurred_on <  m.this_month
    ) h on true;

revoke execute on function public.report_category_months(date, date, uuid[])            from public, anon, authenticated, service_role;
revoke execute on function public.report_category_totals(date, date, date, uuid[])      from public, anon, authenticated, service_role;
revoke execute on function public.budget_month_results(date, date)                      from public, anon, authenticated, service_role;
revoke execute on function public.budget_month_summary(date)                            from public, anon, authenticated, service_role;
grant  execute on function public.report_category_months(date, date, uuid[])            to authenticated;
grant  execute on function public.report_category_totals(date, date, date, uuid[])      to authenticated;
grant  execute on function public.budget_month_results(date, date)                      to authenticated;
grant  execute on function public.budget_month_summary(date)                            to authenticated;
