-- Phase 8 of the reports and dashboards plan: the Account and Bill pages
-- become dashboards, and the Overview gets its 30-day Coming up strip. Every
-- function runs as the caller, so row-level security decides what it sees,
-- and every sum, average and difference happens here; the browser formats.
-- "Today" comes from the profile's time zone; p_today pins it for tests.

-- ---------------------------------------------------------------------------
-- Every bill, subscription, expected income and planned transfer due in the
-- next p_days days (today included), each repeat on its own row, walked from
-- next_due_on with recurrence_next. A due date already past is listed once,
-- as overdue, in the first week. week is 0 to 3: three weeks of seven days,
-- then the rest of the window. Bills are expenses; transfers are listed but
-- counted in neither total, since they move money between your accounts.
-- ---------------------------------------------------------------------------
create function public.upcoming_items(p_days integer default 30, p_today date default null)
returns table (
  recurring_item_id  uuid,
  name               text,
  label              public.recurring_label,
  kind               public.txn_kind,
  due_on             date,
  amount_minor       bigint,
  amount_is_variable boolean,
  overdue            boolean,
  week               integer,
  week_bills_minor   bigint,
  week_in_minor      bigint,
  bills_minor        bigint,
  in_minor           bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  with recursive t as (
    select coalesce(
             p_today,
             (select (pg_catalog.now() at time zone p.timezone)::date
                from public.profiles p
               where p.id = (select auth.uid())),
             (pg_catalog.now() at time zone 'UTC')::date) as today,
           greatest(coalesce(p_days, 30), 1) as days
  ),
  occ (item_id, due, anchor, unit, step, ends_on) as (
    select r.id, r.next_due_on, r.anchor_on, r.cadence_unit, r.cadence_interval::integer, r.ends_on
      from public.recurring_items r, t
     where r.archived_at is null
       and r.next_due_on < t.today + t.days
    union all
    select o.item_id, public.recurrence_next(o.anchor, o.unit, o.step, o.due), o.anchor, o.unit, o.step, o.ends_on
      from occ o, t
     where o.due < t.today + t.days
  ),
  due as (
    select o.item_id,
           o.due,
           o.due < t.today as overdue,
           case when o.due < t.today then 0 else least((o.due - t.today) / 7, 3) end as week
      from occ o
      join public.recurring_items r on r.id = o.item_id
      cross join t
     where o.due < t.today + t.days
       and (o.ends_on is null or o.due <= o.ends_on)
       -- Of the dates already past, only the unpaid one: next_due_on itself.
       and (o.due >= t.today or o.due = r.next_due_on)
  )
  select r.id,
         r.name,
         r.label,
         r.kind,
         d.due,
         r.amount_minor,
         r.amount_is_variable,
         d.overdue,
         d.week,
         (coalesce(sum(r.amount_minor) filter (where r.kind = 'expense') over (partition by d.week), 0))::bigint,
         (coalesce(sum(r.amount_minor) filter (where r.kind = 'income')  over (partition by d.week), 0))::bigint,
         (coalesce(sum(r.amount_minor) filter (where r.kind = 'expense') over (), 0))::bigint,
         (coalesce(sum(r.amount_minor) filter (where r.kind = 'income')  over (), 0))::bigint
    from due d
    join public.recurring_items r on r.id = d.item_id
   order by d.week, d.due, r.kind = 'income', r.amount_minor desc, r.name;
$$;

-- ---------------------------------------------------------------------------
-- Where one account's money went between two dates (the end is exclusive):
-- expenses by category ('category', a null category is "No category"), and
-- transfers out by where they went: into any goal's fund as one 'goals'
-- line, otherwise one 'account' line per destination. The lines add up to
-- the account's money out for the period, which total_out_minor carries.
-- ---------------------------------------------------------------------------
create function public.account_outflows(p_account_id uuid, p_from date, p_to date)
returns table (
  line            text,
  category_id     uuid,
  to_account_id   uuid,
  account_type    public.account_type,
  name            text,
  out_minor       bigint,
  txn_count       integer,
  total_out_minor bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  with outs as (
    select case
             when tx.kind = 'expense' then 'category'
             when exists (select 1 from public.goals g
                           where g.user_id = tx.user_id and g.account_id = tx.to_account_id) then 'goals'
             else 'account'
           end as line,
           case when tx.kind = 'expense' then tx.category_id end as category_id,
           case when tx.kind = 'transfer' then tx.to_account_id end as to_account_id,
           tx.amount_minor
      from public.transactions tx
     where tx.from_account_id = p_account_id
       and tx.kind in ('expense', 'transfer')
       and tx.occurred_on >= p_from
       and tx.occurred_on <  p_to
  ),
  lines as (
    select o.line,
           o.category_id,
           case when o.line = 'account' then o.to_account_id end as to_account_id,
           sum(o.amount_minor) as amt,
           count(*) as n
      from outs o
     group by o.line, o.category_id, case when o.line = 'account' then o.to_account_id end
  )
  select l.line,
         l.category_id,
         l.to_account_id,
         a.type,
         case l.line
           when 'goals' then 'Into goals'
           when 'account' then a.name
           else coalesce(c.name, 'No category')
         end,
         l.amt::bigint,
         l.n::integer,
         (sum(l.amt) over ())::bigint
    from lines l
    left join public.categories c on c.id = l.category_id
    left join public.accounts a on a.id = l.to_account_id
   order by l.amt desc, 5;
$$;

-- ---------------------------------------------------------------------------
-- One account's figures for a period (the end is exclusive): what came in
-- and went out, by kind and as a monthly average over the period's months;
-- the balance and how it changed since the last month end and since the
-- same month end a year before; the lowest balance in the last 90 days,
-- read from account_ledger (the balance carried into the window counts, and
-- is dated the window's first day); and, for a loan, how many more payments
-- at the period's average would clear it. One row, or none for an account
-- that isn't yours.
-- ---------------------------------------------------------------------------
create function public.account_summary(p_account_id uuid, p_from date, p_to date, p_today date default null)
returns table (
  months                 integer,
  income_minor           bigint,
  expense_minor          bigint,
  transfer_in_minor      bigint,
  transfer_out_minor     bigint,
  in_minor               bigint,
  out_minor              bigint,
  avg_in_minor           bigint,
  avg_out_minor          bigint,
  avg_income_minor       bigint,
  avg_expense_minor      bigint,
  avg_transfer_in_minor  bigint,
  avg_transfer_out_minor bigint,
  balance_minor          bigint,
  month_end_on           date,
  since_month_end_minor  bigint,
  year_ago_on            date,
  since_year_ago_minor   bigint,
  lowest_minor           bigint,
  lowest_on              date,
  payments_left          integer)
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
  marks as (
    select t.today,
           (pg_catalog.date_trunc('month', t.today)::date - 1) as month_end,
           ((pg_catalog.date_trunc('month', t.today) - interval '11 months')::date - 1) as year_ago,
           (t.today - 89) as low_from,
           greatest(
             ((extract(year from p_to)::integer * 12 + extract(month from p_to)::integer)
              - (extract(year from p_from)::integer * 12 + extract(month from p_from)::integer)), 1) as months
      from t
  ),
  acct as (
    select a.id, a.type, a.opening_balance_minor
      from public.accounts a
     where a.id = p_account_id
  ),
  sums as (
    select coalesce(sum(e.signed_amount_minor)  filter (where e.kind = 'income'), 0)                                 as income,
           coalesce(sum(-e.signed_amount_minor) filter (where e.kind = 'expense'), 0)                                as expense,
           coalesce(sum(e.signed_amount_minor)  filter (where e.kind = 'transfer' and e.signed_amount_minor > 0), 0) as t_in,
           coalesce(sum(-e.signed_amount_minor) filter (where e.kind = 'transfer' and e.signed_amount_minor < 0), 0) as t_out
      from public.account_entries e
     where e.account_id = p_account_id
       and e.occurred_on >= p_from
       and e.occurred_on <  p_to
  ),
  bal as (
    select a.opening_balance_minor + coalesce(sum(e.signed_amount_minor), 0) as now_bal,
           a.opening_balance_minor + coalesce(sum(e.signed_amount_minor) filter (where e.occurred_on <= m.month_end), 0) as at_month_end,
           a.opening_balance_minor + coalesce(sum(e.signed_amount_minor) filter (where e.occurred_on <= m.year_ago), 0)  as at_year_ago,
           a.opening_balance_minor + coalesce(sum(e.signed_amount_minor) filter (where e.occurred_on <  m.low_from), 0)  as carried_in
      from acct a
      cross join marks m
      left join public.account_entries e on e.account_id = a.id
     group by a.opening_balance_minor
  ),
  low as (
    select c.amount, c.on_date
      from (
        select b.carried_in as amount, m.low_from as on_date, 1 as pick
          from bal b, marks m
        union all
        select l.balance_after_minor, l.occurred_on, 0
          from public.account_ledger l, marks m
         where l.account_id = p_account_id
           and l.occurred_on >= m.low_from
           and l.occurred_on <= m.today
      ) c
     order by c.amount, c.on_date desc, c.pick
     limit 1
  )
  select m.months::integer,
         s.income::bigint,
         s.expense::bigint,
         s.t_in::bigint,
         s.t_out::bigint,
         (s.income + s.t_in)::bigint,
         (s.expense + s.t_out)::bigint,
         round((s.income + s.t_in)::numeric / m.months)::bigint,
         round((s.expense + s.t_out)::numeric / m.months)::bigint,
         round(s.income::numeric / m.months)::bigint,
         round(s.expense::numeric / m.months)::bigint,
         round(s.t_in::numeric / m.months)::bigint,
         round(s.t_out::numeric / m.months)::bigint,
         b.now_bal::bigint,
         m.month_end,
         (b.now_bal - b.at_month_end)::bigint,
         m.year_ago,
         (b.now_bal - b.at_year_ago)::bigint,
         lo.amount::bigint,
         lo.on_date,
         case
           when a.type = 'loan' and b.now_bal < 0 and s.t_in > 0
             then ceil((-b.now_bal)::numeric / nullif(round(s.t_in::numeric / m.months), 0))::integer
         end
    from acct a
    cross join marks m
    cross join sums s
    cross join bal b
    cross join low lo;
$$;

-- ---------------------------------------------------------------------------
-- One bill's last p_months months, this month included, judged against its
-- current schedule (past schedules aren't stored): how many times it fell
-- due, what was paid and how often, and the change from the payment before
-- this month's first one. status is 'paid', 'short' (paid fewer times than
-- due), 'missed' (due, nothing paid, month over), 'due' (this month, a due
-- date passed, nothing paid yet), 'upcoming' (this month, not due yet) or
-- 'none'. months_due and months_paid count the months since the schedule
-- began that were due by today, and how many of them had a payment.
-- typical_month_minor is the average spent a month over the 12 complete
-- months before this one (fewer if your history is shorter), for the bill's
-- share of a typical month.
-- ---------------------------------------------------------------------------
create function public.recurring_item_history(p_item_id uuid, p_months integer default 24, p_today date default null)
returns table (
  month               date,
  due_count           integer,
  paid_minor          bigint,
  payment_count       integer,
  last_minor          bigint,
  from_minor          bigint,
  change_minor        bigint,
  status              text,
  months_due          integer,
  months_paid         integer,
  typical_month_minor bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  with recursive t as (
    select coalesce(
             p_today,
             (select (pg_catalog.now() at time zone p.timezone)::date
                from public.profiles p
               where p.id = (select auth.uid())),
             (pg_catalog.now() at time zone 'UTC')::date) as today
  ),
  span as (
    select t.today,
           pg_catalog.date_trunc('month', t.today)::date as this_m,
           (pg_catalog.date_trunc('month', t.today) - pg_catalog.make_interval(months => greatest(coalesce(p_months, 24), 1) - 1))::date as first_m,
           (pg_catalog.date_trunc('month', t.today) + interval '1 month')::date as end_m
      from t
  ),
  item as (
    select r.* from public.recurring_items r where r.id = p_item_id
  ),
  occ (due) as (
    select public.recurrence_next(i.anchor_on, i.cadence_unit, i.cadence_interval, s.first_m - 1)
      from item i, span s
    union all
    select public.recurrence_next(i.anchor_on, i.cadence_unit, i.cadence_interval, o.due)
      from occ o, item i, span s
     where o.due < s.end_m
  ),
  dues as (
    select pg_catalog.date_trunc('month', o.due)::date as m,
           count(*) as n,
           count(*) filter (where o.due <= s.today) as n_past
      from occ o, item i, span s
     where o.due < s.end_m
       and (i.ends_on is null or o.due <= i.ends_on)
     group by 1
  ),
  pays as (
    select tx.occurred_on,
           tx.amount_minor,
           lag(tx.amount_minor) over (order by tx.occurred_on, tx.created_at, tx.id) as prev_amount,
           row_number() over (partition by pg_catalog.date_trunc('month', tx.occurred_on)
                              order by tx.occurred_on, tx.created_at, tx.id) as nth_in_month,
           row_number() over (partition by pg_catalog.date_trunc('month', tx.occurred_on)
                              order by tx.occurred_on desc, tx.created_at desc, tx.id desc) as nth_from_end
      from public.transactions tx, span s
     where tx.recurring_item_id = p_item_id
       and tx.occurred_on < s.end_m
  ),
  paid as (
    select pg_catalog.date_trunc('month', p.occurred_on)::date as m,
           sum(p.amount_minor) as amt,
           count(*) as n,
           max(p.amount_minor) filter (where p.nth_from_end = 1) as last_amt,
           max(p.amount_minor) filter (where p.nth_in_month = 1) as first_amt,
           max(p.prev_amount)  filter (where p.nth_in_month = 1) as prev_amt
      from pays p
     group by 1
  ),
  grid as (
    select gs::date as m
      from span s
     cross join lateral pg_catalog.generate_series(s.first_m, s.this_m, interval '1 month') gs
  ),
  lines as (
    select g.m,
           coalesce(d.n, 0) as due_n,
           coalesce(d.n_past, 0) as due_past,
           coalesce(pd.amt, 0) as amt,
           coalesce(pd.n, 0) as pay_n,
           pd.last_amt,
           pd.prev_amt,
           pd.first_amt,
           g.m >= pg_catalog.date_trunc('month', i.anchor_on)::date as scheduled,
           case
             when coalesce(pd.n, 0) > 0 and coalesce(pd.n, 0) >= coalesce(d.n, 0) then 'paid'
             when g.m < s.this_m and coalesce(d.n, 0) > 0 and coalesce(pd.n, 0) = 0 then 'missed'
             when g.m < s.this_m and coalesce(pd.n, 0) < coalesce(d.n, 0) then 'short'
             when g.m = s.this_m and coalesce(d.n_past, 0) > 0 and coalesce(pd.n, 0) = 0 then 'due'
             when g.m = s.this_m and coalesce(d.n, 0) > 0 then 'upcoming'
             else 'none'
           end as status
      from grid g
      cross join item i
      cross join span s
      left join dues d on d.m = g.m
      left join paid pd on pd.m = g.m
  ),
  typical as (
    -- The 12 complete months before this one, or fewer since your first
    -- transaction; none when there is no complete month yet.
    select case when w.n_months > 0 then round(w.total::numeric / w.n_months)::bigint end as amt
      from (
        select x.total,
               (extract(year from x.this_m)::integer * 12 + extract(month from x.this_m)::integer)
               - (extract(year from x.from_m)::integer * 12 + extract(month from x.from_m)::integer) as n_months
          from (
            select s.this_m,
                   greatest((s.this_m - interval '12 months')::date,
                            coalesce((select pg_catalog.date_trunc('month', min(tx.occurred_on))::date from public.transactions tx), s.this_m)) as from_m,
                   (select coalesce(sum(tx.amount_minor), 0)
                      from public.transactions tx
                     where tx.kind = 'expense'
                       and tx.occurred_on >= greatest((s.this_m - interval '12 months')::date,
                                                      coalesce((select pg_catalog.date_trunc('month', min(t2.occurred_on))::date from public.transactions t2), s.this_m))
                       and tx.occurred_on < s.this_m) as total
              from span s
          ) x
      ) w
  )
  select r.m,
         r.due_n::integer,
         r.amt::bigint,
         r.pay_n::integer,
         r.last_amt::bigint,
         r.prev_amt::bigint,
         (r.first_amt - r.prev_amt)::bigint,
         r.status,
         (count(*) filter (where r.scheduled and r.due_past > 0) over ())::integer,
         (count(*) filter (where r.scheduled and r.due_past > 0 and r.pay_n > 0) over ())::integer,
         ty.amt
    from lines r
    cross join typical ty
   where exists (select 1 from item)
   order by r.m;
$$;

revoke execute on function public.upcoming_items(integer, date)                        from public, anon, authenticated, service_role;
revoke execute on function public.account_outflows(uuid, date, date)                   from public, anon, authenticated, service_role;
revoke execute on function public.account_summary(uuid, date, date, date)              from public, anon, authenticated, service_role;
revoke execute on function public.recurring_item_history(uuid, integer, date)          from public, anon, authenticated, service_role;
grant  execute on function public.upcoming_items(integer, date)                        to authenticated;
grant  execute on function public.account_outflows(uuid, date, date)                   to authenticated;
grant  execute on function public.account_summary(uuid, date, date, date)              to authenticated;
grant  execute on function public.recurring_item_history(uuid, integer, date)          to authenticated;
