-- A person can star the accounts they use most. Favorites sit first on the
-- Accounts page and first in every account picker. It is a stored choice,
-- not a computed figure, so it is a column, and it changes nothing about
-- balances, net worth or reports.

alter table public.accounts
  add column is_favorite boolean not null default false;

comment on column public.accounts.is_favorite is
  'True when the person has starred the account: it is listed first on Accounts and in pickers. Display only.';

-- Column-level grants, restated in full as every migration does, so the last
-- grant for a table names every column a person may set.
grant insert (id, name, type, opening_balance_minor, opening_date, sort_order, archived_at, source_ref,
              include_in_net_worth, is_favorite)
  on public.accounts to authenticated;
grant update (name, type, opening_balance_minor, opening_date, sort_order, archived_at, include_in_net_worth,
              is_favorite)
  on public.accounts to authenticated;

-- account_balances gains the flag as its last column; everything before it
-- is unchanged from 20261002010000_net_worth_exclusion.
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
         a.include_in_net_worth,
         a.is_favorite
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
