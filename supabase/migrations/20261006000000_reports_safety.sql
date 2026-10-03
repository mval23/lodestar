-- Phase 7 of the reports and dashboards plan: Recurring payments, Cash runway
-- and Debt repayment, the three reports that answer "how safe am I". Every
-- function runs as the caller, so row-level security decides what it sees,
-- and every sum, average and division happens here; the browser formats.
-- "Today" comes from the profile's time zone; p_today pins it for tests.

-- ---------------------------------------------------------------------------
-- Each bill and subscription that costs money, at its yearly cost: the
-- amount times how often it falls due in a year, or, for a bill whose amount
-- varies, what was actually paid for it over the last 12 months. With the
-- totals over every item, and over subscriptions alone, on each row.
-- ---------------------------------------------------------------------------
create function public.recurring_costs(p_today date default null)
returns table (
  recurring_item_id        uuid,
  yearly_minor             bigint,
  paid_12m_minor           bigint,
  payments_12m             integer,
  last_paid_on             date,
  total_yearly_minor       bigint,
  total_monthly_minor      bigint,
  subscriptions_yearly_minor bigint,
  items                    integer)
language sql
stable
security invoker
set search_path = ''
as $$
  with t as (
    select coalesce(
             p_today,
             (select (pg_catalog.now() at time zone p.timezone)::date
                from public.profiles p
               where p.id = (select auth.uid())),
             (pg_catalog.now() at time zone 'UTC')::date) as today
  ),
  items as (
    select r.*
      from public.recurring_items r
     where r.kind = 'expense'
       and r.archived_at is null
  ),
  paid as (
    select tx.recurring_item_id, sum(tx.amount_minor) as amt, count(*) as n, max(tx.occurred_on) as last_on
      from public.transactions tx, t
     where tx.recurring_item_id is not null
       and tx.occurred_on >  (t.today - interval '12 months')::date
       and tx.occurred_on <= t.today
     group by tx.recurring_item_id
  ),
  costs as (
    select i.id,
           i.label,
           case
             when i.amount_is_variable then coalesce(p.amt, 0)
             else round(i.amount_minor::numeric
                        * (case i.cadence_unit when 'week' then 52 when 'month' then 12 else 1 end)
                        / greatest(i.cadence_interval, 1))
           end::bigint as yearly,
           coalesce(p.amt, 0)::bigint as paid,
           coalesce(p.n, 0)::integer as n,
           p.last_on
      from items i
      left join paid p on p.recurring_item_id = i.id
  )
  select c.id,
         c.yearly,
         c.paid,
         c.n,
         c.last_on,
         (sum(c.yearly) over ())::bigint,
         round(sum(c.yearly) over () / 12.0)::bigint,
         (coalesce(sum(c.yearly) filter (where c.label = 'subscription') over (), 0))::bigint,
         (count(*) over ())::integer
    from costs c
   order by c.yearly desc;
$$;

-- ---------------------------------------------------------------------------
-- Each month's spending split in two: fixed, paid through a bill or
-- subscription ("Mark as paid" links it), and flexible, everything else.
-- With the period's totals on each row.
-- ---------------------------------------------------------------------------
create function public.report_fixed_flexible(p_from date, p_to date, p_account_ids uuid[] default null)
returns table (
  month           date,
  fixed_minor     bigint,
  flexible_minor  bigint,
  total_minor     bigint,
  fixed_total_minor bigint,
  all_total_minor   bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  with months as (
    select pg_catalog.generate_series(
             pg_catalog.date_trunc('month', p_from),
             pg_catalog.date_trunc('month', p_to) - interval '1 month',
             interval '1 month')::date as m
  ),
  sums as (
    select mo.m,
           coalesce(sum(tx.amount_minor) filter (where tx.recurring_item_id is not null), 0) as fixed,
           coalesce(sum(tx.amount_minor) filter (where tx.recurring_item_id is null), 0)     as flexible
      from months mo
      left join public.transactions tx
        on tx.kind = 'expense'
       and tx.occurred_on >= mo.m
       and tx.occurred_on <  (mo.m + interval '1 month')::date
       and (p_account_ids is null or tx.from_account_id = any (p_account_ids))
     group by mo.m
  )
  select s.m,
         s.fixed::bigint,
         s.flexible::bigint,
         (s.fixed + s.flexible)::bigint,
         (sum(s.fixed) over ())::bigint,
         (sum(s.fixed + s.flexible) over ())::bigint
    from sums s
   order by s.m;
$$;

-- ---------------------------------------------------------------------------
-- Expenses not linked to a bill whose exact description comes back month
-- after month: at least 3 consecutive months since p_since, each month's
-- amount within 10% of the typical (average) one. A description already used
-- as the name of an active bill or subscription is left out, so setting one
-- up from here takes it off the list. Confidence is high from 9 consecutive
-- months, medium below. With the count and yearly total on each row.
-- ---------------------------------------------------------------------------
create function public.possible_recurring(p_since date)
returns table (
  description     text,
  category_id     uuid,
  account_id      uuid,
  typical_minor   bigint,
  yearly_minor    bigint,
  months_seen     integer,
  run_months      integer,
  last_on         date,
  confidence      text,
  found           integer,
  found_yearly_minor bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  with loose as (
    select tx.description,
           pg_catalog.date_trunc('month', tx.occurred_on)::date as m,
           sum(tx.amount_minor) as amt,
           max(tx.occurred_on) as last_on
      from public.transactions tx
     where tx.kind = 'expense'
       and tx.recurring_item_id is null
       and tx.occurred_on >= pg_catalog.date_trunc('month', p_since)::date
       and not exists (
             select 1 from public.recurring_items r
              where r.archived_at is null
                and pg_catalog.lower(pg_catalog.btrim(r.name)) = pg_catalog.lower(pg_catalog.btrim(tx.description)))
     group by tx.description, pg_catalog.date_trunc('month', tx.occurred_on)::date
  ),
  stats as (
    select l.description, avg(l.amt) as typical, count(*) as seen, max(l.last_on) as last_on,
           bool_and(abs(l.amt - x.avg_amt) <= x.avg_amt * 0.1) as steady
      from loose l
      join (select description, avg(amt) as avg_amt from loose group by description) x on x.description = l.description
     group by l.description
  ),
  -- Runs of consecutive months: a month's index less its row number is the
  -- same along a run.
  runs as (
    select l.description,
           (extract(year from l.m)::integer * 12 + extract(month from l.m)::integer)
             - row_number() over (partition by l.description order by l.m) as run_key
      from loose l
  ),
  longest as (
    select r.description, max(r.n) as run
      from (select description, run_key, count(*) as n from runs group by description, run_key) r
     group by r.description
  ),
  latest as (
    select distinct on (tx.description) tx.description, tx.category_id, tx.from_account_id
      from public.transactions tx
     where tx.kind = 'expense' and tx.recurring_item_id is null
     order by tx.description, tx.occurred_on desc, tx.created_at desc
  ),
  found as (
    select s.description, la.category_id, la.from_account_id, round(s.typical)::bigint as typical,
           s.seen::integer as seen, lo.run::integer as run, s.last_on
      from stats s
      join longest lo on lo.description = s.description
      join latest la on la.description = s.description
     where s.steady and lo.run >= 3
  )
  select f.description,
         f.category_id,
         f.from_account_id,
         f.typical,
         (f.typical * 12)::bigint,
         f.seen,
         f.run,
         f.last_on,
         case when f.run >= 9 then 'high' else 'medium' end,
         (count(*) over ())::integer,
         (sum(f.typical * 12) over ())::bigint
    from found f
   order by f.typical * 12 desc, f.description;
$$;

-- ---------------------------------------------------------------------------
-- How long cash and goal savings would cover spending, line by line, so the
-- page's table and its figures are the same numbers:
--   'account'        each checking, cash and savings account backing no goal
--                    (balance), and each card (its balance, owed, negative)
--   'available'      their sum: cash after the card balance
--   'goal'           each savings account backing a goal
--   'goals'          their sum
--   'spending'       average monthly spending over the last p_months complete
--                    months, months with no income or expenses left out
--                    (n: how many were used)
--   'group_spending' the same for one category group, when one is given
--   'loan_payments'  average monthly transfers into loans over those months
--   'runway'         (available + goals) / spending, in months
--   'runway_loans'   the same with loan payments added to spending
--   'group_runway'   (available + goals) / the group's spending
-- Months are rounded to one decimal. Investments and loans are not cash.
-- ---------------------------------------------------------------------------
create function public.cash_runway(p_months integer default 6, p_group_id uuid default null, p_today date default null)
returns table (
  line         text,
  account_id   uuid,
  name         text,
  amount_minor bigint,
  months       numeric,
  n            integer)
language sql
stable
security invoker
set search_path = ''
as $$
  with t as (
    select pg_catalog.date_trunc('month', coalesce(
             p_today,
             (select (pg_catalog.now() at time zone p.timezone)::date
                from public.profiles p
               where p.id = (select auth.uid())),
             (pg_catalog.now() at time zone 'UTC')::date))::date as m
  ),
  accts as (
    select ab.account_id, ab.name, ab.type, ab.balance_minor, ab.sort_order,
           exists (select 1 from public.goals g where g.account_id = ab.account_id) as backs_goal
      from public.account_balances ab
     where ab.archived_at is null
  ),
  cash as (
    select * from accts a
     where (a.type in ('checking', 'cash') or (a.type = 'savings' and not a.backs_goal) or a.type = 'credit_card')
  ),
  goal_cash as (
    select * from accts a where a.type = 'savings' and a.backs_goal
  ),
  months as (
    select (t.m - pg_catalog.make_interval(months => k))::date as pm
      from t, pg_catalog.generate_series(1, greatest(p_months, 1)) k
  ),
  per_month as (
    select mo.pm,
           coalesce(sum(tx.amount_minor) filter (where tx.kind = 'expense'), 0) as spent,
           coalesce(sum(tx.amount_minor) filter (
             where tx.kind = 'expense'
               and tx.category_id in (select c.id from public.categories c where c.group_id = p_group_id)), 0) as group_spent,
           coalesce(sum(tx.amount_minor) filter (
             where tx.kind = 'transfer'
               and tx.to_account_id in (select a.id from public.accounts a where a.type = 'loan')), 0) as loans,
           count(*) filter (where tx.kind <> 'transfer') as activity
      from months mo
      left join public.transactions tx
        on tx.occurred_on >= mo.pm
       and tx.occurred_on <  (mo.pm + interval '1 month')::date
     group by mo.pm
  ),
  avgs as (
    select coalesce(round(avg(pm.spent)), 0) as spending,
           coalesce(round(avg(pm.group_spent)), 0) as group_spending,
           coalesce(round(avg(pm.loans)), 0) as loans,
           count(*) as used
      from per_month pm
     where pm.activity > 0
  ),
  totals as (
    select (select coalesce(sum(c.balance_minor), 0) from cash c) as available,
           (select coalesce(sum(g.balance_minor), 0) from goal_cash g) as goals
  ),
  lines as (
    -- Cash first, then the cards it has to cover.
    select 1 as ord, (c.type = 'credit_card')::integer * 100000 + c.sort_order as sub, 'account'::text as line, c.account_id, c.name,
           c.balance_minor::bigint as amount, null::numeric as months, null::integer as n
      from cash c
    union all
    select 2, 0, 'available', null, null, tt.available::bigint,
           case when a.spending > 0 then round(tt.available::numeric / a.spending, 1) end, null
      from totals tt, avgs a
    union all
    select 3, g.sort_order, 'goal', g.account_id, g.name, g.balance_minor::bigint,
           case when a.spending > 0 then round(g.balance_minor::numeric / a.spending, 1) end, null
      from goal_cash g, avgs a
    union all
    select 4, 0, 'goals', null, null, tt.goals::bigint,
           case when a.spending > 0 then round(tt.goals::numeric / a.spending, 1) end, null
      from totals tt, avgs a
    union all
    select 5, 0, 'spending', null, null, a.spending::bigint, null, a.used::integer from avgs a
    union all
    select 6, 0, 'group_spending', null, null, a.group_spending::bigint, null, a.used::integer
      from avgs a where p_group_id is not null
    union all
    select 7, 0, 'loan_payments', null, null, a.loans::bigint, null, a.used::integer from avgs a
    union all
    select 8, 0, 'runway', null, null, (tt.available + tt.goals)::bigint,
           case when a.spending > 0 then round((tt.available + tt.goals)::numeric / a.spending, 1) end, null
      from totals tt, avgs a
    union all
    select 9, 0, 'runway_loans', null, null, (tt.available + tt.goals)::bigint,
           case when a.spending + a.loans > 0 then round((tt.available + tt.goals)::numeric / (a.spending + a.loans), 1) end, null
      from totals tt, avgs a
    union all
    select 10, 0, 'group_runway', null, null, (tt.available + tt.goals)::bigint,
           case when a.group_spending > 0 then round((tt.available + tt.goals)::numeric / a.group_spending, 1) end, null
      from totals tt, avgs a where p_group_id is not null
  )
  select l.line, l.account_id, l.name, l.amount, l.months, l.n
    from lines l
   order by l.ord, l.sub, l.name;
$$;

-- ---------------------------------------------------------------------------
-- Each card and loan over [p_from, p_to):
--   start_minor, end_minor   the balance before p_from and before p_to
--                            (negative: what is owed)
--   balance_minor            the balance now
--   paid_minor               money paid in (transfers into it)
--   purchases_minor          expenses charged to it
--   months_with_purchases, months_paid_full   for a card: months with
--                            purchases, and of those, months whose purchases
--                            the next month's payments covered
--   recent_payment_minor     the average payment over the 3 complete months
--                            before this one
--   payments_left, payoff_month   at that payment, how many more payments
--                            clear the balance, and the month of the last;
--                            null when nothing is owed or nothing is paid.
--                            Interest is not separated.
-- With the totals over every debt on each row.
-- ---------------------------------------------------------------------------
create function public.debt_summary(p_from date, p_to date, p_today date default null)
returns table (
  account_id            uuid,
  name                  text,
  type                  public.account_type,
  start_minor           bigint,
  end_minor             bigint,
  balance_minor         bigint,
  paid_minor            bigint,
  purchases_minor       bigint,
  months_with_purchases integer,
  months_paid_full      integer,
  recent_payment_minor  bigint,
  payments_left         integer,
  payoff_month          date,
  total_start_minor     bigint,
  total_end_minor       bigint,
  total_paid_minor      bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  with t as (
    select pg_catalog.date_trunc('month', coalesce(
             p_today,
             (select (pg_catalog.now() at time zone p.timezone)::date
                from public.profiles p
               where p.id = (select auth.uid())),
             (pg_catalog.now() at time zone 'UTC')::date))::date as m
  ),
  debts as (
    select ab.account_id, ab.name, ab.type, ab.balance_minor, ab.opening_balance_minor, ab.sort_order
      from public.account_balances ab
     where ab.type in ('credit_card', 'loan')
       and ab.archived_at is null
  ),
  entries as (
    select e.account_id, e.occurred_on, e.kind, e.signed_amount_minor
      from public.account_entries e
     where e.account_id in (select d.account_id from debts d)
  ),
  per_month as (
    select e.account_id, pg_catalog.date_trunc('month', e.occurred_on)::date as m,
           coalesce(sum(e.signed_amount_minor) filter (where e.kind = 'transfer' and e.signed_amount_minor > 0), 0) as paid,
           coalesce(sum(-e.signed_amount_minor) filter (where e.kind = 'expense'), 0) as bought
      from entries e
     group by e.account_id, pg_catalog.date_trunc('month', e.occurred_on)::date
  ),
  figures as (
    select d.*,
           d.opening_balance_minor + coalesce((select sum(e.signed_amount_minor) from entries e
                                                where e.account_id = d.account_id and e.occurred_on < p_from), 0) as start_b,
           d.opening_balance_minor + coalesce((select sum(e.signed_amount_minor) from entries e
                                                where e.account_id = d.account_id and e.occurred_on < p_to), 0) as end_b,
           coalesce((select sum(pm.paid) from per_month pm
                      where pm.account_id = d.account_id and pm.m >= p_from and pm.m < p_to), 0) as paid,
           coalesce((select sum(pm.bought) from per_month pm
                      where pm.account_id = d.account_id and pm.m >= p_from and pm.m < p_to), 0) as bought,
           (select count(*) from per_month pm
             where pm.account_id = d.account_id and pm.m >= p_from and pm.m < p_to and pm.bought > 0) as bought_months,
           (select count(*) from per_month pm
             where pm.account_id = d.account_id and pm.m >= p_from and pm.m < p_to and pm.bought > 0
               and coalesce((select nx.paid from per_month nx
                              where nx.account_id = pm.account_id and nx.m = (pm.m + interval '1 month')::date), 0) >= pm.bought)
             as full_months,
           (select round(coalesce(sum(pm.paid), 0)::numeric / 3) from per_month pm, t
             where pm.account_id = d.account_id and pm.m >= (t.m - interval '3 months')::date and pm.m < t.m) as recent
      from debts d
  )
  select f.account_id,
         f.name,
         f.type,
         f.start_b::bigint,
         f.end_b::bigint,
         f.balance_minor::bigint,
         f.paid::bigint,
         f.bought::bigint,
         f.bought_months::integer,
         f.full_months::integer,
         f.recent::bigint,
         case when f.balance_minor < 0 and f.recent > 0 then ceil(-f.balance_minor::numeric / f.recent)::integer end,
         case when f.balance_minor < 0 and f.recent > 0
              then (t.m + pg_catalog.make_interval(months => ceil(-f.balance_minor::numeric / f.recent)::integer - 1))::date end,
         (sum(f.start_b) over ())::bigint,
         (sum(f.end_b) over ())::bigint,
         (sum(f.paid) over ())::bigint
    from figures f, t
   order by f.type desc, f.sort_order, f.name;
$$;

revoke execute on function public.recurring_costs(date)                        from public, anon, authenticated, service_role;
revoke execute on function public.report_fixed_flexible(date, date, uuid[])    from public, anon, authenticated, service_role;
revoke execute on function public.possible_recurring(date)                     from public, anon, authenticated, service_role;
revoke execute on function public.cash_runway(integer, uuid, date)             from public, anon, authenticated, service_role;
revoke execute on function public.debt_summary(date, date, date)               from public, anon, authenticated, service_role;
grant  execute on function public.recurring_costs(date)                        to authenticated;
grant  execute on function public.report_fixed_flexible(date, date, uuid[])    to authenticated;
grant  execute on function public.possible_recurring(date)                     to authenticated;
grant  execute on function public.cash_runway(integer, uuid, date)             to authenticated;
grant  execute on function public.debt_summary(date, date, date)               to authenticated;
