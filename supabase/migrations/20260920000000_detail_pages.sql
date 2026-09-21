-- =============================================================================
-- Detail pages: one page per account, category, budget line, month, goal and
-- bill. Every figure on those pages is one of these queries. Nothing is
-- stored: no balance, spent or month columns, no summary table.
--
-- All views run as the caller (security_invoker), so RLS on the underlying
-- tables decides what each person sees. The one function is SECURITY INVOKER
-- for the same reason and carries no user check of its own.
-- =============================================================================

-- Per account, per month, from the first month with activity (or the opening
-- date) through the current month in the profile's time zone: what arrived
-- and left by kind, and the balance at the end of the month. Months with no
-- activity are present with zeros, so a chart never has to invent them.
-- The closing balance uses the same arithmetic as account_balances:
-- opening + money in - money out.
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

-- Every entry of an account, signed from that account's side, with the
-- balance just after it. Entries on the same day are ordered by when they
-- were recorded, then by id, so the running balance is chronological where
-- it can be and stable where it cannot. Filtering this view by kind or date
-- does not change the balances: the window is computed over the whole
-- account first.
create view public.account_ledger with (security_invoker = true) as
  select e.user_id,
         e.account_id,
         e.transaction_id,
         e.kind,
         e.status,
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

-- Per category, per month: the total and the number of transactions. A
-- category holds one kind, so this is spending for an expense category and
-- money received for an income one. Transfers carry no category and never
-- appear here.
create view public.category_month_totals with (security_invoker = true) as
  select t.user_id,
         t.category_id,
         t.category_kind as kind,
         date_trunc('month', t.occurred_on)::date as month,
         sum(t.amount_minor)::bigint as total_minor,
         count(*)::bigint            as txn_count
    from public.transactions t
   where t.category_id is not null
   group by t.user_id, t.category_id, t.category_kind, date_trunc('month', t.occurred_on)::date;

-- One calendar month: totals and counts by kind, and how much of the
-- transferred money went into goal accounts. Net is income less expenses;
-- transfers stay out of it, as in monthly_cash_flow.
create view public.month_summary with (security_invoker = true) as
  select t.user_id,
         date_trunc('month', t.occurred_on)::date as month,
         coalesce(sum(t.amount_minor) filter (where t.kind = 'income'), 0)::bigint   as income_minor,
         count(*) filter (where t.kind = 'income')                                   as income_count,
         coalesce(sum(t.amount_minor) filter (where t.kind = 'expense'), 0)::bigint  as expense_minor,
         count(*) filter (where t.kind = 'expense')                                  as expense_count,
         coalesce(sum(t.amount_minor) filter (where t.kind = 'transfer'), 0)::bigint as transfer_minor,
         count(*) filter (where t.kind = 'transfer')                                 as transfer_count,
         coalesce(sum(t.amount_minor) filter (where t.kind = 'transfer' and g.id is not null), 0)::bigint
                                                                                     as to_goals_minor,
         (coalesce(sum(t.amount_minor) filter (where t.kind = 'income'), 0)
        - coalesce(sum(t.amount_minor) filter (where t.kind = 'expense'), 0))::bigint as net_minor
    from public.transactions t
    -- goals.account_id is unique per user, so this join never multiplies rows.
    left join public.goals g on g.user_id = t.user_id and g.account_id = t.to_account_id
   group by t.user_id, date_trunc('month', t.occurred_on)::date;

-- What each bill or subscription actually cost, per month. The amount the
-- item expected at the time is not stored, so only what was paid is shown.
create view public.recurring_item_months with (security_invoker = true) as
  select t.user_id,
         t.recurring_item_id,
         date_trunc('month', t.occurred_on)::date as month,
         sum(t.amount_minor)::bigint as paid_minor,
         count(*)::bigint            as payment_count,
         max(t.occurred_on)          as last_paid_on
    from public.transactions t
   where t.recurring_item_id is not null
   group by t.user_id, t.recurring_item_id, date_trunc('month', t.occurred_on)::date;

revoke all on
  public.account_month_flow, public.account_ledger, public.category_month_totals, public.month_summary,
  public.recurring_item_months
  from anon, authenticated, service_role;
grant select on
  public.account_month_flow, public.account_ledger, public.category_month_totals, public.month_summary,
  public.recurring_item_months
  to authenticated;

-- The descriptions a category is spent on most, between two dates (the end is
-- exclusive). Grouped on the exact text: descriptions are free text, and a
-- loose match would pretend to know more than it does. RLS on transactions
-- does the filtering, so another person's category simply returns nothing.
create function public.category_top_descriptions(
  p_category_id uuid, p_from date, p_to date, p_limit integer default 5)
returns table (description text, total_minor bigint, txn_count bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select t.description, sum(t.amount_minor)::bigint, count(*)::bigint
    from public.transactions t
   where t.category_id = p_category_id
     and t.occurred_on >= p_from
     and t.occurred_on <  p_to
   group by t.description
   order by 2 desc, 1
   limit least(greatest(coalesce(p_limit, 5), 1), 20);
$$;

revoke execute on function public.category_top_descriptions(uuid, date, date, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.category_top_descriptions(uuid, date, date, integer) to authenticated;
