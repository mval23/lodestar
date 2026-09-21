-- =============================================================================
-- Pending goes away.
--
-- Every transaction in Lodestar is entered by hand, so nothing is ever really
-- waiting for a bank to settle it: "pending" asked a question the person
-- always had to answer "cleared" to. With the status gone there is one
-- balance per account instead of two, and one less thing to keep in step.
--
-- Rows that were pending become ordinary transactions; they already counted
-- in the balance, so no figure moves.
-- =============================================================================

-- The import path first: its body names the type, and a plpgsql body is not
-- tracked as a dependency, so the type could otherwise be dropped from under it.
create or replace function public.import_transactions(p_batch jsonb, p_rows jsonb)
returns table (batch_id uuid, inserted_count integer, duplicate_count integer)
language plpgsql
security invoker
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid      uuid := auth.uid();
  v_batch    uuid;
  v_total    integer;
  v_inserted integer;
begin
  if v_uid is null then
    raise exception 'Not signed in.' using errcode = '42501';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'rows must be a JSON array' using errcode = '22023';
  end if;
  v_total := jsonb_array_length(p_rows);
  if v_total = 0 or v_total > 20000 then
    raise exception 'An import must have between 1 and 20000 rows (got %).', v_total using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(p_rows) e
              where coalesce(btrim(e ->> 'source_ref'), '') = '') then
    raise exception 'Every imported row needs a source_ref.' using errcode = '22023';
  end if;

  insert into public.import_batches (source, filename, row_count)
  values ((p_batch ->> 'source')::public.import_source, nullif(p_batch ->> 'filename', ''), v_total)
  returning id into v_batch;

  insert into public.transactions
    (kind, occurred_on, amount_minor, from_account_id, to_account_id, category_id,
     description, notes, source_ref, import_batch_id, created_at)
  select r.kind, r.occurred_on, r.amount_minor, r.from_account_id, r.to_account_id, r.category_id,
         r.description, r.notes, r.source_ref, v_batch,
         coalesce(r.created_at, pg_catalog.now())
    from jsonb_to_recordset(p_rows) as r(
           kind public.txn_kind, occurred_on date, amount_minor bigint,
           from_account_id uuid, to_account_id uuid, category_id uuid,
           description text, notes text,
           source_ref text, created_at timestamptz)
  on conflict (user_id, source_ref) where source_ref is not null do nothing;

  get diagnostics v_inserted = row_count;

  perform public.log_event('import', v_batch, v_inserted);

  return query select v_batch, v_inserted, v_total - v_inserted;
end;
$$;

-- The views that read the column, and the two that stand on them, dropped
-- innermost last and put back below exactly as they were.
drop view public.goal_progress;
drop view public.net_worth_by_month;
drop view public.account_ledger;
drop view public.account_month_flow;
drop view public.account_balances;
drop view public.account_entries;

alter table public.transactions drop column status;
drop type public.txn_status;

-- Recreated without it. account_balances loses cleared_balance_minor: with
-- nothing pending, it was always the balance.
create view public.account_entries with (security_invoker = true) as
  select t.user_id, t.to_account_id as account_id, t.id as transaction_id, t.kind,
         t.occurred_on, t.amount_minor as signed_amount_minor
    from public.transactions t
   where t.to_account_id is not null
  union all
  select t.user_id, t.from_account_id, t.id, t.kind,
         t.occurred_on, -t.amount_minor
    from public.transactions t
   where t.from_account_id is not null;

-- Balance = opening + money in - money out (the owner's Notion formula).
create view public.account_balances with (security_invoker = true) as
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
         (a.opening_balance_minor + coalesce(i.total, 0) - coalesce(o.total, 0))::bigint as balance_minor
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

create view public.account_month_flow with (security_invoker = true) as
  with monthly as (
    select e.user_id,
           e.account_id,
           date_trunc('month', e.occurred_on)::date as month,
           sum(e.signed_amount_minor)  filter (where e.kind = 'income')                                   as income_minor,
           count(*)                    filter (where e.kind = 'income')                                   as income_count,
           sum(-e.signed_amount_minor) filter (where e.kind = 'expense')                                  as expense_minor,
           count(*)                    filter (where e.kind = 'expense')                                  as expense_count,
           sum(e.signed_amount_minor)  filter (where e.kind = 'transfer' and e.signed_amount_minor > 0)   as transfer_in_minor,
           count(*)                    filter (where e.kind = 'transfer' and e.signed_amount_minor > 0)   as transfer_in_count,
           sum(-e.signed_amount_minor) filter (where e.kind = 'transfer' and e.signed_amount_minor < 0)   as transfer_out_minor,
           count(*)                    filter (where e.kind = 'transfer' and e.signed_amount_minor < 0)   as transfer_out_count,
           sum(e.signed_amount_minor)                                                                     as net_minor
      from public.account_entries e
     group by e.user_id, e.account_id, date_trunc('month', e.occurred_on)::date
  ),
  spans as (
    select a.user_id,
           a.id as account_id,
           a.opening_balance_minor,
           least(coalesce(min(m.month), c.current_month),
                 coalesce(date_trunc('month', a.opening_date)::date, c.current_month),
                 c.current_month) as first_month,
           greatest(coalesce(max(m.month), c.current_month), c.current_month) as last_month
      from public.accounts a
      join public.profiles p on p.id = a.user_id
     cross join lateral (
       select date_trunc('month', pg_catalog.now() at time zone p.timezone)::date as current_month
     ) c
      left join monthly m on m.user_id = a.user_id and m.account_id = a.id
     group by a.user_id, a.id, a.opening_balance_minor, a.opening_date, c.current_month
  ),
  grid as (
    select s.user_id, s.account_id, s.opening_balance_minor, gs::date as month
      from spans s
     cross join lateral generate_series(s.first_month, s.last_month, interval '1 month') gs
  )
  select g.user_id,
         g.account_id,
         g.month,
         coalesce(m.income_minor, 0)::bigint       as income_minor,
         coalesce(m.income_count, 0)::bigint       as income_count,
         coalesce(m.expense_minor, 0)::bigint      as expense_minor,
         coalesce(m.expense_count, 0)::bigint      as expense_count,
         coalesce(m.transfer_in_minor, 0)::bigint  as transfer_in_minor,
         coalesce(m.transfer_in_count, 0)::bigint  as transfer_in_count,
         coalesce(m.transfer_out_minor, 0)::bigint as transfer_out_minor,
         coalesce(m.transfer_out_count, 0)::bigint as transfer_out_count,
         coalesce(m.net_minor, 0)::bigint          as net_minor,
         (g.opening_balance_minor + sum(coalesce(m.net_minor, 0)) over w)::bigint as closing_balance_minor
    from grid g
    left join monthly m on m.user_id = g.user_id and m.account_id = g.account_id and m.month = g.month
  window w as (partition by g.user_id, g.account_id order by g.month
               rows between unbounded preceding and current row);

create view public.account_ledger with (security_invoker = true) as
  select e.user_id,
         e.account_id,
         e.transaction_id,
         e.kind,
         e.occurred_on,
         t.created_at,
         e.signed_amount_minor,
         t.description,
         t.category_id,
         t.from_account_id,
         t.to_account_id,
         (a.opening_balance_minor
          + sum(e.signed_amount_minor) over (
              partition by e.user_id, e.account_id
              order by e.occurred_on, t.created_at, e.transaction_id
              rows between unbounded preceding and current row))::bigint as balance_after_minor
    from public.account_entries e
    join public.transactions t on t.user_id = e.user_id and t.id = e.transaction_id
    join public.accounts a on a.user_id = e.user_id and a.id = e.account_id;

-- Unchanged, but they stood on the views above, so they went with them.
create view public.goal_progress with (security_invoker = true) as
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
         coalesce(c.contributed, 0)::bigint as this_month_contributed_minor
    from public.goals g
    join public.account_balances ab on ab.user_id = g.user_id and ab.account_id = g.account_id
    join public.profiles p on p.id = g.user_id
    cross join lateral (
      select date_trunc('month', pg_catalog.now() at time zone p.timezone)::date as this_month
    ) m
    left join lateral (
      select sum(t.amount_minor) as contributed
        from public.transactions t
       where t.user_id = g.user_id
         and t.kind = 'transfer'
         and t.to_account_id = g.account_id
         and t.occurred_on >= m.this_month
         and t.occurred_on <  (m.this_month + interval '1 month')
    ) c on true;

-- Net worth at the end of each month, from the user's first activity through
-- the current month in the profile's time zone. Includes archived accounts,
-- because their balances were real in the months they were open. Opening
-- balances count from opening_date, or from the first month when it is null.
create view public.net_worth_by_month with (security_invoker = true) as
  with deltas as (
    select e.user_id, date_trunc('month', e.occurred_on)::date as month,
           public.is_liability(a.type) as is_liability, e.signed_amount_minor as amount_minor
      from public.account_entries e
      join public.accounts a on a.user_id = e.user_id and a.id = e.account_id
    union all
    select a.user_id, date_trunc('month', a.opening_date)::date,
           public.is_liability(a.type), a.opening_balance_minor
      from public.accounts a
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

revoke all on
  public.account_entries, public.account_balances, public.account_ledger, public.account_month_flow,
  public.goal_progress, public.net_worth_by_month
  from anon, authenticated, service_role;
grant select on
  public.account_entries, public.account_balances, public.account_ledger, public.account_month_flow,
  public.goal_progress, public.net_worth_by_month
  to authenticated;

-- Dropping the column took its grants with it; these restate the column lists
-- so the grants stay readable in one place.
grant insert (id, kind, occurred_on, amount_minor, from_account_id, to_account_id, category_id,
              description, notes, recurring_item_id, import_batch_id, source_ref, created_at)
  on public.transactions to authenticated;
grant update (kind, occurred_on, amount_minor, from_account_id, to_account_id, category_id,
              description, notes, recurring_item_id)
  on public.transactions to authenticated;
