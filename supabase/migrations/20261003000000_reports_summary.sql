-- Phase 3 of the reports and dashboards plan: the figures behind the Reports
-- hub and its Cash flow and Net worth reports. Four read-only functions, all
-- run as the caller, so row-level security decides what they see; every sum
-- happens here and the browser only formats.
--
-- Periods are calendar months: p_from is the first day of the first month and
-- p_to the first day after the last (exclusive), so "the last 12 complete
-- months" is p_to = the first of the current month.
--
-- Account scope: p_account_ids null means every account. Given a list, income
-- counts when it arrives in a listed account and an expense when it leaves
-- one; a transfer between a listed and an unlisted account is "moved in" or
-- "moved out", never income or spending.
--
-- Goals: money into goals is a transfer into a goal's account from an account
-- that backs no goal; out of goals is the reverse. A transfer between two
-- goal accounts is neither: it only moves savings between goals.

-- ---------------------------------------------------------------------------
-- One row per calendar month of the period, empty months as zeros.
-- ---------------------------------------------------------------------------
create function public.report_cash_flow(p_from date, p_to date, p_account_ids uuid[] default null)
returns table (
  month             date,
  money_in_minor    bigint,
  money_out_minor   bigint,
  net_minor         bigint,
  to_goals_minor    bigint,
  from_goals_minor  bigint,
  moved_in_minor    bigint,
  moved_out_minor   bigint,
  active            boolean)
language sql
stable
security invoker
set search_path = ''
as $$
  with months as (
    select gs::date as m
      from pg_catalog.generate_series(
             pg_catalog.date_trunc('month', p_from)::date,
             (pg_catalog.date_trunc('month', p_to)::date - 1),
             interval '1 month') gs
  ),
  scoped as (
    select t.kind,
           t.amount_minor,
           pg_catalog.date_trunc('month', t.occurred_on)::date as m,
           (p_account_ids is null or t.from_account_id = any (p_account_ids)) as from_in,
           (p_account_ids is null or t.to_account_id   = any (p_account_ids)) as to_in,
           gf.id is not null as from_goal,
           gt.id is not null as to_goal
      from public.transactions t
      -- goals.account_id is unique per user, so these joins never multiply rows.
      left join public.goals gt on gt.user_id = t.user_id and gt.account_id = t.to_account_id
      left join public.goals gf on gf.user_id = t.user_id and gf.account_id = t.from_account_id
     where t.occurred_on >= pg_catalog.date_trunc('month', p_from)::date
       and t.occurred_on <  pg_catalog.date_trunc('month', p_to)::date
  )
  select mo.m,
         coalesce(sum(s.amount_minor) filter (where s.kind = 'income'  and s.to_in), 0)::bigint,
         coalesce(sum(s.amount_minor) filter (where s.kind = 'expense' and s.from_in), 0)::bigint,
         (coalesce(sum(s.amount_minor) filter (where s.kind = 'income'  and s.to_in), 0)
        - coalesce(sum(s.amount_minor) filter (where s.kind = 'expense' and s.from_in), 0))::bigint,
         coalesce(sum(s.amount_minor) filter (where s.kind = 'transfer' and s.to_goal and not s.from_goal
                                                 and (s.to_in or s.from_in)), 0)::bigint,
         coalesce(sum(s.amount_minor) filter (where s.kind = 'transfer' and s.from_goal and not s.to_goal
                                                 and (s.to_in or s.from_in)), 0)::bigint,
         coalesce(sum(s.amount_minor) filter (where p_account_ids is not null and s.kind = 'transfer'
                                                 and s.to_in and not s.from_in), 0)::bigint,
         coalesce(sum(s.amount_minor) filter (where p_account_ids is not null and s.kind = 'transfer'
                                                 and s.from_in and not s.to_in), 0)::bigint,
         count(s.kind) filter (where (s.kind = 'income' and s.to_in) or (s.kind = 'expense' and s.from_in)) > 0
    from months mo
    left join scoped s on s.m = mo.m
   group by mo.m
   order by mo.m;
$$;

-- ---------------------------------------------------------------------------
-- Totals for the period and for a comparison period of the same length that
-- starts at p_compare_from (the previous period, or the same months a year
-- earlier: the caller chooses). Transfers are split by where they go, each in
-- exactly one bucket, so the buckets add up to every transfer in scope; that
-- total is transfers_minor, so the browser never adds them up.
-- ---------------------------------------------------------------------------
create function public.report_summary(
  p_from date, p_to date, p_compare_from date, p_account_ids uuid[] default null)
returns table (
  period                  text,
  period_from             date,
  period_to               date,
  money_in_minor          bigint,
  money_out_minor         bigint,
  net_minor               bigint,
  to_goals_minor          bigint,
  from_goals_minor        bigint,
  card_payments_minor     bigint,
  loan_payments_minor     bigint,
  cash_withdrawals_minor  bigint,
  other_transfers_minor   bigint,
  transfers_minor         bigint,
  months                  integer,
  active_months           integer)
language sql
stable
security invoker
set search_path = ''
as $$
  with span as (
    select pg_catalog.date_trunc('month', p_from)::date as f,
           pg_catalog.date_trunc('month', p_to)::date   as t,
           pg_catalog.date_trunc('month', p_compare_from)::date as cf
  ),
  len as (
    select s.*,
           ((extract(year from s.t)::integer * 12 + extract(month from s.t)::integer)
          - (extract(year from s.f)::integer * 12 + extract(month from s.f)::integer)) as n
      from span s
  ),
  periods as (
    select 'current'::text as period, l.f as pf, l.t as pt, l.n from len l
    union all
    select 'compare', l.cf, (l.cf + pg_catalog.make_interval(months => l.n))::date, l.n from len l
  ),
  scoped as (
    select p.period,
           t.kind,
           t.amount_minor,
           pg_catalog.date_trunc('month', t.occurred_on)::date as m,
           (p_account_ids is null or t.from_account_id = any (p_account_ids)) as from_in,
           (p_account_ids is null or t.to_account_id   = any (p_account_ids)) as to_in,
           gf.id is not null as from_goal,
           gt.id is not null as to_goal,
           ta.type as to_type
      from periods p
      join public.transactions t on t.occurred_on >= p.pf and t.occurred_on < p.pt
      left join public.accounts ta on ta.user_id = t.user_id and ta.id = t.to_account_id
      left join public.goals gt on gt.user_id = t.user_id and gt.account_id = t.to_account_id
      left join public.goals gf on gf.user_id = t.user_id and gf.account_id = t.from_account_id
  ),
  transfers as (
    select s.*,
           case
             when s.to_goal and not s.from_goal then 'to_goals'
             when s.from_goal and not s.to_goal then 'from_goals'
             when s.to_type = 'credit_card'     then 'card'
             when s.to_type = 'loan'            then 'loan'
             when s.to_type = 'cash'            then 'cash'
             else 'other'
           end as bucket
      from scoped s
     where s.kind = 'transfer' and (s.to_in or s.from_in)
  ),
  flows as (
    select s.period,
           coalesce(sum(s.amount_minor) filter (where s.kind = 'income'  and s.to_in), 0)   as i,
           coalesce(sum(s.amount_minor) filter (where s.kind = 'expense' and s.from_in), 0) as o,
           count(distinct s.m) filter (where (s.kind = 'income' and s.to_in) or (s.kind = 'expense' and s.from_in)) as active
      from scoped s
     group by s.period
  ),
  moved as (
    select tr.period,
           coalesce(sum(tr.amount_minor) filter (where tr.bucket = 'to_goals'), 0)   as tg,
           coalesce(sum(tr.amount_minor) filter (where tr.bucket = 'from_goals'), 0) as fg,
           coalesce(sum(tr.amount_minor) filter (where tr.bucket = 'card'), 0)       as card,
           coalesce(sum(tr.amount_minor) filter (where tr.bucket = 'loan'), 0)       as loan,
           coalesce(sum(tr.amount_minor) filter (where tr.bucket = 'cash'), 0)       as cash,
           coalesce(sum(tr.amount_minor) filter (where tr.bucket = 'other'), 0)      as other,
           coalesce(sum(tr.amount_minor), 0)                                         as total
      from transfers tr
     group by tr.period
  )
  select p.period,
         p.pf,
         p.pt,
         coalesce(f.i, 0)::bigint,
         coalesce(f.o, 0)::bigint,
         (coalesce(f.i, 0) - coalesce(f.o, 0))::bigint,
         coalesce(mv.tg, 0)::bigint,
         coalesce(mv.fg, 0)::bigint,
         coalesce(mv.card, 0)::bigint,
         coalesce(mv.loan, 0)::bigint,
         coalesce(mv.cash, 0)::bigint,
         coalesce(mv.other, 0)::bigint,
         coalesce(mv.total, 0)::bigint,
         p.n::integer,
         coalesce(f.active, 0)::integer
    from periods p
    left join flows f  on f.period = p.period
    left join moved mv on mv.period = p.period
   order by p.period desc;
$$;

-- ---------------------------------------------------------------------------
-- Each account's balance at the start and end of the period (before p_from
-- and before p_to). An opening balance counts from its account's opening
-- date, or, undated, from the person's first month with any activity: the
-- same rule net_worth_by_month folds it in by.
-- ---------------------------------------------------------------------------
create function public.net_worth_by_account(p_from date, p_to date)
returns table (
  account_id            uuid,
  name                  text,
  type                  public.account_type,
  is_liability          boolean,
  include_in_net_worth  boolean,
  archived_at           timestamptz,
  start_minor           bigint,
  end_minor             bigint,
  change_minor          bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  with first_month as (
    select least(
             (select min(pg_catalog.date_trunc('month', e.occurred_on))::date from public.account_entries e),
             (select min(pg_catalog.date_trunc('month', a.opening_date))::date from public.accounts a)) as m
  ),
  accounts as (
    select a.*,
           coalesce(pg_catalog.date_trunc('month', a.opening_date)::date, fm.m) as opened
      from public.accounts a, first_month fm
  ),
  balances as (
    select a.id,
           (case when a.opened is null or a.opened < pg_catalog.date_trunc('month', p_from)::date
                 then a.opening_balance_minor else 0 end
            + coalesce((select sum(e.signed_amount_minor) from public.account_entries e
                         where e.account_id = a.id and e.occurred_on < pg_catalog.date_trunc('month', p_from)::date), 0)
           )::bigint as start_minor,
           (case when a.opened is null or a.opened < pg_catalog.date_trunc('month', p_to)::date
                 then a.opening_balance_minor else 0 end
            + coalesce((select sum(e.signed_amount_minor) from public.account_entries e
                         where e.account_id = a.id and e.occurred_on < pg_catalog.date_trunc('month', p_to)::date), 0)
           )::bigint as end_minor
      from accounts a
  )
  select a.id, a.name, a.type, public.is_liability(a.type), a.include_in_net_worth, a.archived_at,
         b.start_minor, b.end_minor, (b.end_minor - b.start_minor)::bigint
    from accounts a
    join balances b on b.id = a.id
   order by (b.end_minor - b.start_minor) desc, a.name;
$$;

-- ---------------------------------------------------------------------------
-- Why net worth moved over the period, in parts that add up to the change:
--   cash flow       income into, less spending from, accounts in net worth
--   openings        opening balances of accounts that began in the period
--   moved           transfers in from accounts left out of net worth, less
--                   transfers out to them
-- change = cash_flow + openings + moved, to the cent.
-- ---------------------------------------------------------------------------
create function public.net_worth_change(p_from date, p_to date)
returns table (
  start_minor      bigint,
  end_minor        bigint,
  change_minor     bigint,
  cash_flow_minor  bigint,
  openings_minor   bigint,
  moved_minor      bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  with span as (
    select pg_catalog.date_trunc('month', p_from)::date as f, pg_catalog.date_trunc('month', p_to)::date as t
  ),
  per_account as (
    select * from public.net_worth_by_account(p_from, p_to) where include_in_net_worth
  ),
  first_month as (
    select least(
             (select min(pg_catalog.date_trunc('month', e.occurred_on))::date from public.account_entries e),
             (select min(pg_catalog.date_trunc('month', a.opening_date))::date from public.accounts a)) as m
  ),
  inside as (
    select tx.kind, tx.amount_minor,
           coalesce(acc_from.include_in_net_worth, false) as from_counted,
           coalesce(acc_to.include_in_net_worth, false) as to_counted
      from public.transactions tx
      cross join span s
      left join public.accounts acc_from on acc_from.user_id = tx.user_id and acc_from.id = tx.from_account_id
      left join public.accounts acc_to on acc_to.user_id = tx.user_id and acc_to.id = tx.to_account_id
     where tx.occurred_on >= s.f and tx.occurred_on < s.t
  )
  select coalesce((select sum(p.start_minor) from per_account p), 0)::bigint,
         coalesce((select sum(p.end_minor)   from per_account p), 0)::bigint,
         coalesce((select sum(p.change_minor) from per_account p), 0)::bigint,
         (coalesce((select sum(i.amount_minor) from inside i where i.kind = 'income'  and i.to_counted), 0)
        - coalesce((select sum(i.amount_minor) from inside i where i.kind = 'expense' and i.from_counted), 0))::bigint,
         coalesce((select sum(a.opening_balance_minor)
                     from public.accounts a, span s, first_month fm
                    where a.include_in_net_worth
                      and coalesce(pg_catalog.date_trunc('month', a.opening_date)::date, fm.m) >= s.f
                      and coalesce(pg_catalog.date_trunc('month', a.opening_date)::date, fm.m) <  s.t), 0)::bigint,
         (coalesce((select sum(i.amount_minor) from inside i
                     where i.kind = 'transfer' and i.to_counted and not i.from_counted), 0)
        - coalesce((select sum(i.amount_minor) from inside i
                     where i.kind = 'transfer' and i.from_counted and not i.to_counted), 0))::bigint;
$$;

revoke execute on function public.report_cash_flow(date, date, uuid[])       from public, anon, authenticated, service_role;
revoke execute on function public.report_summary(date, date, date, uuid[])   from public, anon, authenticated, service_role;
revoke execute on function public.net_worth_by_account(date, date)           from public, anon, authenticated, service_role;
revoke execute on function public.net_worth_change(date, date)               from public, anon, authenticated, service_role;
grant  execute on function public.report_cash_flow(date, date, uuid[])       to authenticated;
grant  execute on function public.report_summary(date, date, date, uuid[])   to authenticated;
grant  execute on function public.net_worth_by_account(date, date)           to authenticated;
grant  execute on function public.net_worth_change(date, date)               to authenticated;
