-- An account can be left out of net worth: one the person tracks but doesn't
-- count as theirs to stand on, such as money held for someone else or a
-- balance in a currency they don't want mixed in. It is a stored choice, not
-- a computed figure, so it is a column; everything that sums net worth reads
-- it.
--
-- Leaving an account out applies to its whole history, so the net worth
-- trend doesn't jump on the day the switch is turned. Its transactions still
-- count in cash flow, budgets and Activity: the switch is only about what
-- you own and owe.

alter table public.accounts
  add column include_in_net_worth boolean not null default true;

comment on column public.accounts.include_in_net_worth is
  'False leaves the account out of net worth (account_balances carries it; net_worth_by_month filters on it). Cash flow is unaffected.';

-- Column-level grants, restated in full as every migration does, so the last
-- grant for a table names every column a person may set.
grant insert (id, name, type, opening_balance_minor, opening_date, sort_order, archived_at, source_ref,
              include_in_net_worth)
  on public.accounts to authenticated;
grant update (name, type, opening_balance_minor, opening_date, sort_order, archived_at, include_in_net_worth)
  on public.accounts to authenticated;

-- account_balances gains the flag as its last column, so the app can leave
-- the account out of the Overview's net worth exactly as the view below does.
create or replace view public.account_balances with (security_invoker = true) as
  select a.user_id,
         a.id as account_id,
         a.name,
         a.type,
         public.is_liability(a.type) as is_liability,
         a.sort_order,
         a.archived_at,
         a.opening_balance_minor,
         coalesce(i.total, 0)::bigint as money_in_minor,
         coalesce(o.total, 0)::bigint as money_out_minor,
         (a.opening_balance_minor + coalesce(i.total, 0) - coalesce(o.total, 0))::bigint as balance_minor,
         a.include_in_net_worth
    from public.accounts a
    left join lateral (
      select sum(t.amount_minor) as total
        from public.transactions t
       where t.user_id = a.user_id and t.to_account_id = a.id
    ) i on true
    left join lateral (
      select sum(t.amount_minor) as total
        from public.transactions t
       where t.user_id = a.user_id and t.from_account_id = a.id
    ) o on true;

-- The same view as before, counting only accounts included in net worth.
create or replace view public.net_worth_by_month with (security_invoker = true) as
  with deltas as (
    select e.user_id, date_trunc('month', e.occurred_on)::date as month,
           public.is_liability(a.type) as is_liability, e.signed_amount_minor as amount_minor
      from public.account_entries e
      join public.accounts a on a.user_id = e.user_id and a.id = e.account_id
     where a.include_in_net_worth
    union all
    select a.user_id, date_trunc('month', a.opening_date)::date,
           public.is_liability(a.type), a.opening_balance_minor
      from public.accounts a
     where a.include_in_net_worth
  ),
  bounds as (
    select p.id as user_id,
           date_trunc('month', pg_catalog.now() at time zone p.timezone)::date as current_month,
           (select min(d.month) from deltas d where d.user_id = p.id) as first_month
      from public.profiles p
  ),
  months as (
    select b.user_id, gs::date as month
      from bounds b
     cross join lateral generate_series(
             least(coalesce(b.first_month, b.current_month), b.current_month),
             b.current_month, interval '1 month') gs
  ),
  monthly as (
    select m.user_id, m.month,
           coalesce(sum(d.amount_minor) filter (where not d.is_liability), 0) as assets_delta,
           coalesce(sum(d.amount_minor) filter (where d.is_liability), 0)     as liabilities_delta
      from months m
      left join bounds b on b.user_id = m.user_id
      left join deltas d
        on d.user_id = m.user_id
       and (  d.month = m.month
           -- fold undated opening balances into the first month
           or (d.month is null and m.month = least(coalesce(b.first_month, b.current_month), b.current_month)))
     group by m.user_id, m.month
  )
  select user_id,
         month,
         (sum(assets_delta)      over w)::bigint as assets_minor,
         (sum(liabilities_delta) over w)::bigint as liabilities_minor,
         (sum(assets_delta) over w + sum(liabilities_delta) over w)::bigint as net_worth_minor
    from monthly
  window w as (partition by user_id order by month rows between unbounded preceding and current row);
