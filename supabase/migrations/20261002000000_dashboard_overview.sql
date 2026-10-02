-- Phase 2 of the reports and dashboards plan: what the Overview needs to put
-- this month in context. Two read-only functions, both run as the caller, so
-- row-level security on transactions, budgets and recurring items decides what
-- they see. Every sum and average happens here; the browser only formats.
--
-- "Today" comes from the profile's time zone, as everywhere else. Both take an
-- optional p_today so tests can pin the date; passing one changes nothing but
-- which day the figures are cut at.

-- ---------------------------------------------------------------------------
-- The month so far, against a typical month cut at the same day.
--
-- A typical month is the average of the 6 complete months before p_month,
-- each counted up to the same day of the month (or its last day, when it is
-- shorter). Months with no income or expenses at all are left out of the
-- average, as on Reports, and typical_months says how many were used.
-- For a past month the day is its last, so the whole month is compared.
-- ---------------------------------------------------------------------------
create function public.month_to_date(p_month date, p_today date default null)
returns table (
  month                  date,
  today                  date,
  day_of_month           integer,
  days_in_month          integer,
  money_in_minor         bigint,
  money_out_minor        bigint,
  to_goals_minor         bigint,
  typical_in_minor       bigint,
  typical_out_minor      bigint,
  typical_to_goals_minor bigint,
  typical_months         integer)
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
           b.t,
           ((b.m + interval '1 month')::date - b.m) as dim,
           case
             when b.t < b.m then 0
             when b.t >= (b.m + interval '1 month')::date then (b.m + interval '1 month')::date - b.m
             else b.t - b.m + 1
           end as d
      from base b
  ),
  -- This month and the 6 before it, each with the number of days to count.
  months as (
    select s.m as pm, s.d as days from span s
    union all
    select (s.m - pg_catalog.make_interval(months => k))::date, s.d
      from span s, pg_catalog.generate_series(1, 6) k
  ),
  totals as (
    select mo.pm,
           coalesce(sum(tx.amount_minor) filter (where tx.kind = 'income'), 0)::bigint  as i,
           coalesce(sum(tx.amount_minor) filter (where tx.kind = 'expense'), 0)::bigint as o,
           coalesce(sum(tx.amount_minor) filter (where tx.kind = 'transfer' and g.id is not null), 0)::bigint as gl
      from months mo
      left join public.transactions tx
        on tx.occurred_on >= mo.pm
       and tx.occurred_on <  mo.pm + least(mo.days, (mo.pm + interval '1 month')::date - mo.pm)
      -- goals.account_id is unique per user, so this join never multiplies rows.
      left join public.goals g on g.user_id = tx.user_id and g.account_id = tx.to_account_id
     group by mo.pm
  ),
  -- Earlier months with any income or expense in the whole month.
  active as (
    select mo.pm
      from months mo, span s
     where mo.pm < s.m
       and exists (
             select 1
               from public.transactions tx
              where tx.kind <> 'transfer'
                and tx.occurred_on >= mo.pm
                and tx.occurred_on <  (mo.pm + interval '1 month')::date)
  )
  select s.m,
         s.t,
         s.d::integer,
         s.dim::integer,
         cur.i,
         cur.o,
         cur.gl,
         coalesce(round(avg(prev.i)), 0)::bigint,
         coalesce(round(avg(prev.o)), 0)::bigint,
         coalesce(round(avg(prev.gl)), 0)::bigint,
         count(prev.pm)::integer
    from span s
    join totals cur on cur.pm = s.m
    left join (totals prev join active a on a.pm = prev.pm) on true
   group by s.m, s.t, s.d, s.dim, cur.i, cur.o, cur.gl;
$$;

-- ---------------------------------------------------------------------------
-- Where each budget line should be by today, if the plan is to hold.
--
-- Pace counts bills and subscriptions in the category on their due dates, and
-- spreads the rest of the plan evenly over the month, so rent paid on the 1st
-- reads as on pace rather than far ahead. A bill's due dates in the month come
-- from its schedule (recurrence_next), at its current amount.
--
-- status: 'over' when spent is above the plan, 'ahead' when above pace,
-- otherwise 'on_pace'. per_day_minor is what is left divided by the days left,
-- or null when no days are left.
-- ---------------------------------------------------------------------------
create function public.budget_pace(p_month date, p_today date default null)
returns table (
  budget_id         uuid,
  category_id       uuid,
  category_name     text,
  group_id          uuid,
  month             date,
  planned_minor     bigint,
  spent_minor       bigint,
  bills_month_minor bigint,
  bills_due_minor   bigint,
  pace_minor        bigint,
  gap_minor         bigint,
  days_left         integer,
  per_day_minor     bigint,
  status            text)
language sql
stable
security invoker
set search_path = ''
as $$
  with recursive base as (
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
           (b.m + interval '1 month')::date as next_m,
           ((b.m + interval '1 month')::date - b.m) as dim,
           case
             when b.t < b.m then 0
             when b.t >= (b.m + interval '1 month')::date then (b.m + interval '1 month')::date - b.m
             else b.t - b.m + 1
           end as d
      from base b
  ),
  -- Every due date of every active expense bill with a category, walked
  -- forward from the first one on or after the start of the month.
  occ (item_id, category_id, amount, due, ends_on, anchor, unit, step) as (
    select r.id, r.category_id, r.amount_minor,
           public.recurrence_next(r.anchor_on, r.cadence_unit, r.cadence_interval, s.m - 1),
           r.ends_on, r.anchor_on, r.cadence_unit, r.cadence_interval::integer
      from public.recurring_items r, span s
     where r.kind = 'expense'
       and r.category_id is not null
       and r.archived_at is null
    union all
    select o.item_id, o.category_id, o.amount,
           public.recurrence_next(o.anchor, o.unit, o.step, o.due),
           o.ends_on, o.anchor, o.unit, o.step
      from occ o, span s
     where o.due < s.next_m
  ),
  bills as (
    select o.category_id,
           sum(o.amount)::bigint as month_total,
           coalesce(sum(o.amount) filter (where o.due < s.m + s.d), 0)::bigint as due_total
      from occ o, span s
     where o.due >= s.m
       and o.due <  s.next_m
       and (o.ends_on is null or o.due <= o.ends_on)
     group by o.category_id
  ),
  paced as (
    select bp.*,
           s.d,
           s.dim,
           coalesce(bl.month_total, 0) as month_total,
           coalesce(bl.due_total, 0)   as due_total,
           least(
             bp.planned_minor,
             coalesce(bl.due_total, 0)
               + round(greatest(bp.planned_minor - coalesce(bl.month_total, 0), 0)::numeric * s.d / s.dim)
           )::bigint as pace
      from public.budget_progress bp
      cross join span s
      left join bills bl on bl.category_id = bp.category_id
     where bp.month = s.m
  )
  select p.budget_id,
         p.category_id,
         p.category_name,
         p.group_id,
         p.month,
         p.planned_minor,
         p.spent_minor,
         p.month_total,
         p.due_total,
         p.pace,
         (p.spent_minor - p.pace)::bigint,
         (p.dim - p.d)::integer,
         case when p.dim - p.d > 0
              then (greatest(p.planned_minor - p.spent_minor, 0) / (p.dim - p.d))::bigint
         end,
         case when p.spent_minor > p.planned_minor then 'over'
              when p.spent_minor > p.pace          then 'ahead'
              else 'on_pace'
         end
    from paced p
   order by p.category_name;
$$;

revoke execute on function public.month_to_date(date, date) from public, anon, authenticated, service_role;
revoke execute on function public.budget_pace(date, date)   from public, anon, authenticated, service_role;
grant  execute on function public.month_to_date(date, date) to authenticated;
grant  execute on function public.budget_pace(date, date)   to authenticated;
