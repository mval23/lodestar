-- =============================================================================
-- Lodestar: initial schema
-- Target: Supabase Postgres 17. Applied by CI only; never edit production by hand.
--
-- Principle: store facts, compute everything else. No stored balances, spent,
-- left, progress, "this month" flags or rollups. Those are the views at the end.
--
-- Authorization: Row Level Security is the only authorization layer.
--   * Every user-owned table has user_id default auth.uid(), RLS enabled and
--     exactly one policy per command (select, insert, update, delete) for
--     `authenticated`. Commands a table does not allow get an explicit
--     `false` policy, so every public table passes the same CI gate
--     (supabase/tests/rls_gate.sql).
--   * Cross-row references are composite foreign keys (user_id, x_id), so no
--     row can point at another user's row.
--   * user_id is never writable by clients (column-level INSERT/UPDATE grants)
--     and a trigger rejects any change to it from any role.
--   * Nothing is granted to `anon`.
--
-- "Restrict" semantics are written as ON DELETE NO ACTION (the Postgres
-- default): a referenced row cannot be deleted while references remain, the
-- check runs at the end of the statement, and it can be made deferrable later
-- if a migration needs it. Deleting a user from auth.users cascades through
-- every table in one statement; the schema harness verifies this completes.
-- =============================================================================

create extension if not exists pg_trgm with schema extensions;

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------
create type public.account_type as enum (
  'checking', 'savings', 'credit_card', 'cash', 'investment', 'loan', 'other_asset'
);
comment on type public.account_type is
  'Liabilities are credit_card and loan (see public.is_liability). investment is a balance only.';

create type public.txn_kind        as enum ('expense', 'income', 'transfer');
create type public.txn_status      as enum ('cleared', 'pending');
create type public.category_kind   as enum ('expense', 'income');
create type public.cadence_unit    as enum ('week', 'month', 'year');
create type public.recurring_label as enum ('bill', 'subscription', 'income', 'transfer');
create type public.import_source   as enum ('csv', 'notion');
create type public.import_status   as enum ('imported', 'reconciled');
create type public.audit_event     as enum ('export', 'import', 'bulk_delete', 'account_delete_requested');

-- -----------------------------------------------------------------------------
-- Shared trigger functions
-- -----------------------------------------------------------------------------
create function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

-- Defense in depth behind the column grants: no role, not even the table
-- owner or service_role, can move a row to another user.
create function public.prevent_owner_change()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_table_name = 'profiles' then
    if new.id is distinct from old.id then
      raise exception 'profiles.id cannot be changed' using errcode = '42501';
    end if;
  elsif new.user_id is distinct from old.user_id then
    raise exception '%.user_id cannot be changed', tg_table_name using errcode = '42501';
  end if;
  return new;
end;
$$;

create function public.is_liability(p_type public.account_type)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select p_type in ('credit_card'::public.account_type, 'loan'::public.account_type);
$$;

-- -----------------------------------------------------------------------------
-- currencies (reference data, read-only for signed-in users)
-- -----------------------------------------------------------------------------
create table public.currencies (
  code        char(3)     primary key check (code ~ '^[A-Z]{3}$'),
  name        text        not null,
  exponent    smallint    not null check (exponent between 0 and 4),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
comment on table public.currencies is
  'Reference data. exponent = number of minor-unit digits: USD 2 (cents), COP 0 (whole pesos).';

insert into public.currencies (code, name, exponent) values
  ('USD', 'US dollar', 2),
  ('COP', 'Colombian peso', 0);

-- -----------------------------------------------------------------------------
-- profiles (one per auth user; created only by the sign-up trigger)
-- -----------------------------------------------------------------------------
create table public.profiles (
  id            uuid        primary key default auth.uid()
                            references auth.users (id) on delete cascade,
  display_name  text        check (display_name is null or char_length(display_name) <= 80),
  currency      char(3)     not null default 'USD' references public.currencies (code),
  timezone      text        not null default 'UTC',
  week_start    smallint    not null default 1 check (week_start between 1 and 7),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
comment on column public.profiles.currency is
  'USD or COP, chosen at first run. Changeable only while the user has no transactions (trigger profiles_currency_lock).';
comment on column public.profiles.timezone is
  'IANA name, validated against pg_timezone_names (trigger profiles_timezone_valid). Source of "today" and "this month".';
comment on column public.profiles.week_start is 'ISO day of week: 1 = Monday ... 7 = Sunday.';

-- -----------------------------------------------------------------------------
-- accounts
-- -----------------------------------------------------------------------------
create table public.accounts (
  id                     uuid        primary key default gen_random_uuid(),
  user_id                uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  name                   text        not null,
  type                   public.account_type not null,
  opening_balance_minor  bigint      not null default 0,
  opening_date           date,
  sort_order             integer     not null default 0,
  archived_at            timestamptz,
  source_ref             text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint accounts_user_id_id_key unique (user_id, id),
  constraint accounts_name_length check (char_length(name) <= 60 and btrim(name) <> ''),
  constraint accounts_opening_date_range check (opening_date is null or opening_date >= date '1970-01-01'),
  constraint accounts_source_ref_length check (source_ref is null or char_length(source_ref) between 1 and 200)
);
comment on column public.accounts.opening_balance_minor is
  'Minor units of profiles.currency. Liabilities are entered negative. The balance itself is the view account_balances.';
create unique index accounts_active_name_key on public.accounts (user_id, lower(name)) where archived_at is null;
create unique index accounts_source_ref_key  on public.accounts (user_id, source_ref) where source_ref is not null;

-- -----------------------------------------------------------------------------
-- category_groups and categories
-- -----------------------------------------------------------------------------
create table public.category_groups (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  name        text        not null,
  sort_order  integer     not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint category_groups_user_id_id_key unique (user_id, id),
  constraint category_groups_name_length check (char_length(name) <= 60 and btrim(name) <> '')
);
create unique index category_groups_name_key on public.category_groups (user_id, lower(name));

create table public.categories (
  id           uuid        primary key default gen_random_uuid(),
  user_id      uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  group_id     uuid,
  name         text        not null,
  kind         public.category_kind not null,
  sort_order   integer     not null default 0,
  archived_at  timestamptz,
  source_ref   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint categories_user_id_id_key unique (user_id, id),
  -- Target of the kind-checking composite FKs from transactions, budgets and recurring_items.
  constraint categories_user_id_id_kind_key unique (user_id, id, kind),
  constraint categories_name_length check (char_length(name) <= 60 and btrim(name) <> ''),
  constraint categories_source_ref_length check (source_ref is null or char_length(source_ref) between 1 and 200),
  -- Deleting a group leaves its categories ungrouped; only group_id is nulled, never user_id.
  constraint categories_group_fkey foreign key (user_id, group_id)
    references public.category_groups (user_id, id) on delete set null (group_id)
);
comment on table public.categories is
  'Income and expense categories only. There are no savings categories: savings are transfers into a goal''s account.';
create unique index categories_name_key       on public.categories (user_id, kind, lower(name));
create unique index categories_source_ref_key on public.categories (user_id, source_ref) where source_ref is not null;
create index categories_group_idx on public.categories (user_id, group_id);

-- -----------------------------------------------------------------------------
-- import_batches
-- -----------------------------------------------------------------------------
create table public.import_batches (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  source      public.import_source not null,
  filename    text        check (filename is null or char_length(filename) between 1 and 255),
  row_count   integer     not null check (row_count >= 0),
  status      public.import_status not null default 'imported',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint import_batches_user_id_id_key unique (user_id, id)
);
comment on column public.import_batches.row_count is
  'Rows submitted in this import (a fact about the event). Rows actually inserted are count(transactions) with this batch id.';
comment on table public.import_batches is
  'Deleting a batch deletes its transactions (FK transactions_import_batch_fkey is ON DELETE CASCADE). That is the undo and the migration rollback.';
create index import_batches_user_created_idx on public.import_batches (user_id, created_at desc);

-- -----------------------------------------------------------------------------
-- recurring_items (bills and subscriptions)
-- -----------------------------------------------------------------------------
create table public.recurring_items (
  id                  uuid        primary key default gen_random_uuid(),
  user_id             uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  name                text        not null,
  label               public.recurring_label not null,
  kind                public.txn_kind not null,
  amount_minor        bigint      not null,
  amount_is_variable  boolean     not null default false,
  from_account_id     uuid,
  to_account_id       uuid,
  category_id         uuid,
  category_kind       public.category_kind generated always as (
                        case kind
                          when 'expense' then 'expense'::public.category_kind
                          when 'income'  then 'income'::public.category_kind
                        end) stored,
  cadence_unit        public.cadence_unit not null,
  cadence_interval    smallint    not null default 1,
  anchor_on           date        not null,
  next_due_on         date        not null,
  ends_on             date,
  archived_at         timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint recurring_items_user_id_id_key unique (user_id, id),
  constraint recurring_items_name_length check (char_length(name) <= 60 and btrim(name) <> ''),
  constraint recurring_items_amount_positive check (amount_minor > 0),
  constraint recurring_items_direction_check check (
       (kind = 'expense'  and from_account_id is not null and to_account_id is null)
    or (kind = 'income'   and from_account_id is null     and to_account_id is not null)
    or (kind = 'transfer' and from_account_id is not null and to_account_id is not null
                          and from_account_id <> to_account_id)),
  constraint recurring_items_category_on_transfer_check check (kind <> 'transfer' or category_id is null),
  constraint recurring_items_label_kind_check check (
        (label = 'income')   = (kind = 'income')
    and (label <> 'transfer' or kind = 'transfer')
    and (label <> 'subscription' or kind = 'expense')),
  constraint recurring_items_interval_range check (cadence_interval between 1 and 12),
  constraint recurring_items_dates_check check (
        anchor_on >= date '1970-01-01'
    and next_due_on >= anchor_on
    and (ends_on is null or ends_on >= anchor_on)),
  constraint recurring_items_from_account_fkey foreign key (user_id, from_account_id)
    references public.accounts (user_id, id) on delete no action,
  constraint recurring_items_to_account_fkey foreign key (user_id, to_account_id)
    references public.accounts (user_id, id) on delete no action,
  constraint recurring_items_category_fkey foreign key (user_id, category_id, category_kind)
    references public.categories (user_id, id, kind) on delete no action
);
comment on column public.recurring_items.anchor_on is
  'First occurrence. Every due date is anchor + n x interval units, so month-end dates clamp without drifting (Jan 31, Feb 28, Mar 31).';
comment on column public.recurring_items.category_kind is
  'Generated from kind; part of the FK to categories(user_id, id, kind) so a category of the wrong kind cannot be referenced.';
create index recurring_items_due_idx          on public.recurring_items (user_id, next_due_on);
create index recurring_items_from_account_idx on public.recurring_items (user_id, from_account_id);
create index recurring_items_to_account_idx   on public.recurring_items (user_id, to_account_id);
create index recurring_items_category_idx     on public.recurring_items (user_id, category_id);

-- -----------------------------------------------------------------------------
-- transactions
-- -----------------------------------------------------------------------------
create table public.transactions (
  id                 uuid        primary key default gen_random_uuid(),
  user_id            uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  kind               public.txn_kind not null,
  occurred_on        date        not null,
  amount_minor       bigint      not null,
  from_account_id    uuid,
  to_account_id      uuid,
  category_id        uuid,
  category_kind      public.category_kind generated always as (
                       case kind
                         when 'expense' then 'expense'::public.category_kind
                         when 'income'  then 'income'::public.category_kind
                       end) stored,
  description        text        not null,
  notes              text,
  status             public.txn_status not null default 'cleared',
  recurring_item_id  uuid,
  import_batch_id    uuid,
  source_ref         text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint transactions_user_id_id_key unique (user_id, id),
  constraint transactions_amount_positive check (amount_minor > 0),
  constraint transactions_direction_check check (
       (kind = 'expense'  and from_account_id is not null and to_account_id is null)
    or (kind = 'income'   and from_account_id is null     and to_account_id is not null)
    or (kind = 'transfer' and from_account_id is not null and to_account_id is not null
                          and from_account_id <> to_account_id)),
  -- The composite category FK below is MATCH SIMPLE, so it is skipped when
  -- category_kind is null (transfers). This check closes that gap.
  constraint transactions_category_on_transfer_check check (kind <> 'transfer' or category_id is null),
  constraint transactions_description_length check (char_length(description) <= 140 and btrim(description) <> ''),
  constraint transactions_notes_length check (notes is null or char_length(notes) <= 4000),
  -- Upper bound (today + 1 year) is the trigger transactions_occurred_on_upper_bound.
  constraint transactions_occurred_on_lower_bound check (occurred_on >= date '1970-01-01'),
  constraint transactions_source_ref_length check (source_ref is null or char_length(source_ref) between 1 and 200),
  constraint transactions_from_account_fkey foreign key (user_id, from_account_id)
    references public.accounts (user_id, id) on delete no action,
  constraint transactions_to_account_fkey foreign key (user_id, to_account_id)
    references public.accounts (user_id, id) on delete no action,
  constraint transactions_category_fkey foreign key (user_id, category_id, category_kind)
    references public.categories (user_id, id, kind) on delete no action,
  constraint transactions_recurring_item_fkey foreign key (user_id, recurring_item_id)
    references public.recurring_items (user_id, id) on delete set null (recurring_item_id),
  constraint transactions_import_batch_fkey foreign key (user_id, import_batch_id)
    references public.import_batches (user_id, id) on delete cascade
);
comment on table public.transactions is
  'One row per money event. expense: from only; income: to only; transfer: both, different, no category.';
comment on column public.transactions.amount_minor is
  'Always positive, in minor units of profiles.currency. Direction comes from kind and the from/to accounts.';
comment on column public.transactions.source_ref is
  'Stable external id (notion:<page id>, csv:<row hash>). Unique per user so imports are idempotent. Not updatable.';

create unique index transactions_source_ref_key on public.transactions (user_id, source_ref) where source_ref is not null;
create index transactions_user_occurred_idx   on public.transactions (user_id, occurred_on desc, id);
create index transactions_from_account_idx    on public.transactions (user_id, from_account_id, occurred_on);
create index transactions_to_account_idx      on public.transactions (user_id, to_account_id, occurred_on);
create index transactions_category_idx        on public.transactions (user_id, category_id, occurred_on);
create index transactions_recurring_item_idx  on public.transactions (user_id, recurring_item_id);
create index transactions_import_batch_idx    on public.transactions (user_id, import_batch_id);
create index transactions_description_trgm_idx on public.transactions using gin (description extensions.gin_trgm_ops);
create index transactions_notes_trgm_idx       on public.transactions using gin (notes extensions.gin_trgm_ops);

-- -----------------------------------------------------------------------------
-- budgets (one row per expense category per month)
-- -----------------------------------------------------------------------------
create table public.budgets (
  id             uuid        primary key default gen_random_uuid(),
  user_id        uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  category_id    uuid        not null,
  -- Constant generated column: the FK below can only match expense categories.
  category_kind  public.category_kind generated always as ('expense'::public.category_kind) stored,
  month          date        not null,
  amount_minor   bigint      not null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint budgets_user_id_id_key unique (user_id, id),
  constraint budgets_category_month_key unique (user_id, category_id, month),
  constraint budgets_month_first_day check (extract(day from month) = 1 and month >= date '1970-01-01'),
  constraint budgets_amount_nonnegative check (amount_minor >= 0),
  -- Plans are not history: deleting an (unused) category removes its plans.
  constraint budgets_category_fkey foreign key (user_id, category_id, category_kind)
    references public.categories (user_id, id, kind) on delete cascade
);
create index budgets_user_month_idx on public.budgets (user_id, month);

-- -----------------------------------------------------------------------------
-- goals (exactly one fund account each)
-- -----------------------------------------------------------------------------
create table public.goals (
  id                  uuid        primary key default gen_random_uuid(),
  user_id             uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  account_id          uuid        not null,
  name                text        not null,
  target_minor        bigint,
  target_date         date,
  monthly_plan_minor  bigint,
  sort_order          integer     not null default 0,
  achieved_at         timestamptz,
  archived_at         timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint goals_user_id_id_key unique (user_id, id),
  constraint goals_account_id_key unique (account_id),
  constraint goals_name_length check (char_length(name) <= 60 and btrim(name) <> ''),
  constraint goals_target_positive check (target_minor is null or target_minor > 0),
  constraint goals_monthly_plan_nonnegative check (monthly_plan_minor is null or monthly_plan_minor >= 0),
  constraint goals_target_date_range check (target_date is null or target_date >= date '1970-01-01'),
  constraint goals_account_fkey foreign key (user_id, account_id)
    references public.accounts (user_id, id) on delete no action
);
comment on table public.goals is
  'Contributions are transfers into account_id. No category or flag marks savings.';

-- -----------------------------------------------------------------------------
-- audit_events (append-only; written only by log_event)
-- -----------------------------------------------------------------------------
create table public.audit_events (
  id          bigint      generated always as identity primary key,
  user_id     uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  event       public.audit_event not null,
  subject_id  uuid,
  row_count   integer     check (row_count is null or row_count >= 0),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint audit_events_user_id_id_key unique (user_id, id)
);
comment on table public.audit_events is
  'Security log. Structured columns only (no free-form metadata), so amounts and descriptions cannot be recorded. created_at is when the event occurred.';
create index audit_events_user_created_idx on public.audit_events (user_id, created_at desc);

-- -----------------------------------------------------------------------------
-- Triggers: updated_at and owner immutability on every table
-- -----------------------------------------------------------------------------
create trigger currencies_set_updated_at      before update on public.currencies      for each row execute function public.set_updated_at();
create trigger profiles_set_updated_at        before update on public.profiles        for each row execute function public.set_updated_at();
create trigger accounts_set_updated_at        before update on public.accounts        for each row execute function public.set_updated_at();
create trigger category_groups_set_updated_at before update on public.category_groups for each row execute function public.set_updated_at();
create trigger categories_set_updated_at      before update on public.categories      for each row execute function public.set_updated_at();
create trigger import_batches_set_updated_at  before update on public.import_batches  for each row execute function public.set_updated_at();
create trigger recurring_items_set_updated_at before update on public.recurring_items for each row execute function public.set_updated_at();
create trigger transactions_set_updated_at    before update on public.transactions    for each row execute function public.set_updated_at();
create trigger budgets_set_updated_at         before update on public.budgets         for each row execute function public.set_updated_at();
create trigger goals_set_updated_at           before update on public.goals           for each row execute function public.set_updated_at();
create trigger audit_events_set_updated_at    before update on public.audit_events    for each row execute function public.set_updated_at();

create trigger profiles_owner_immutable        before update on public.profiles        for each row execute function public.prevent_owner_change();
create trigger accounts_owner_immutable        before update on public.accounts        for each row execute function public.prevent_owner_change();
create trigger category_groups_owner_immutable before update on public.category_groups for each row execute function public.prevent_owner_change();
create trigger categories_owner_immutable      before update on public.categories      for each row execute function public.prevent_owner_change();
create trigger import_batches_owner_immutable  before update on public.import_batches  for each row execute function public.prevent_owner_change();
create trigger recurring_items_owner_immutable before update on public.recurring_items for each row execute function public.prevent_owner_change();
create trigger transactions_owner_immutable    before update on public.transactions    for each row execute function public.prevent_owner_change();
create trigger budgets_owner_immutable         before update on public.budgets         for each row execute function public.prevent_owner_change();
create trigger goals_owner_immutable           before update on public.goals           for each row execute function public.prevent_owner_change();
create trigger audit_events_owner_immutable    before update on public.audit_events    for each row execute function public.prevent_owner_change();

-- -----------------------------------------------------------------------------
-- Triggers: profile rules
-- -----------------------------------------------------------------------------
-- A CHECK cannot use a subquery, and the set of time zone names comes from the
-- server's tzdata, so validation is a trigger rather than a CHECK.
create function public.validate_profile_timezone()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = new.timezone) then
    raise exception 'Unknown time zone "%". Use an IANA name such as America/Bogota.', new.timezone
      using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger profiles_timezone_valid
  before insert or update of timezone on public.profiles
  for each row execute function public.validate_profile_timezone();

create function public.enforce_currency_lock()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.currency is distinct from old.currency
     and exists (select 1 from public.transactions t where t.user_id = old.id) then
    raise exception 'Currency can only be changed before the first transaction is recorded.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger profiles_currency_lock
  before update of currency on public.profiles
  for each row execute function public.enforce_currency_lock();

-- -----------------------------------------------------------------------------
-- Trigger: occurred_on upper bound
-- A CHECK constraint must be immutable: Postgres assumes a row that passed a
-- CHECK always passes it, and re-evaluates CHECKs only on write and on
-- restore. current_date is not immutable, depends on the server time zone
-- rather than the user's, and would make a valid row fail on a later
-- unrelated update or on restore to a server with a different clock. So the
-- lower bound is a CHECK and the moving upper bound is this trigger, which
-- runs only when occurred_on is written and uses the profile's time zone.
-- -----------------------------------------------------------------------------
create function public.check_occurred_on_upper_bound()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_today date;
begin
  select (pg_catalog.now() at time zone p.timezone)::date
    into v_today
    from public.profiles p
   where p.id = new.user_id;
  v_today := coalesce(v_today, (pg_catalog.now() at time zone 'UTC')::date);
  if new.occurred_on > v_today + interval '1 year' then
    raise exception 'occurred_on % is more than one year after today (%).', new.occurred_on, v_today
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger transactions_occurred_on_upper_bound
  before insert or update of occurred_on on public.transactions
  for each row execute function public.check_occurred_on_upper_bound();

-- -----------------------------------------------------------------------------
-- Row Level Security: one policy per command per table, all for authenticated
-- -----------------------------------------------------------------------------
alter table public.currencies      enable row level security;
alter table public.profiles        enable row level security;
alter table public.accounts        enable row level security;
alter table public.category_groups enable row level security;
alter table public.categories      enable row level security;
alter table public.import_batches  enable row level security;
alter table public.recurring_items enable row level security;
alter table public.transactions    enable row level security;
alter table public.budgets         enable row level security;
alter table public.goals           enable row level security;
alter table public.audit_events    enable row level security;

-- currencies: readable by every signed-in user; nobody writes from the app.
create policy currencies_select_all   on public.currencies for select to authenticated using (true);
create policy currencies_insert_none  on public.currencies for insert to authenticated with check (false);
create policy currencies_update_none  on public.currencies for update to authenticated using (false) with check (false);
create policy currencies_delete_none  on public.currencies for delete to authenticated using (false);

-- profiles: keyed on id; inserted by handle_new_user, deleted by the auth.users cascade.
create policy profiles_select_own  on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy profiles_insert_none on public.profiles for insert to authenticated with check (false);
create policy profiles_update_own  on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy profiles_delete_none on public.profiles for delete to authenticated using (false);

create policy accounts_select_own on public.accounts for select to authenticated using (user_id = (select auth.uid()));
create policy accounts_insert_own on public.accounts for insert to authenticated with check (user_id = (select auth.uid()));
create policy accounts_update_own on public.accounts for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy accounts_delete_own on public.accounts for delete to authenticated using (user_id = (select auth.uid()));

create policy category_groups_select_own on public.category_groups for select to authenticated using (user_id = (select auth.uid()));
create policy category_groups_insert_own on public.category_groups for insert to authenticated with check (user_id = (select auth.uid()));
create policy category_groups_update_own on public.category_groups for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy category_groups_delete_own on public.category_groups for delete to authenticated using (user_id = (select auth.uid()));

create policy categories_select_own on public.categories for select to authenticated using (user_id = (select auth.uid()));
create policy categories_insert_own on public.categories for insert to authenticated with check (user_id = (select auth.uid()));
create policy categories_update_own on public.categories for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy categories_delete_own on public.categories for delete to authenticated using (user_id = (select auth.uid()));

create policy import_batches_select_own on public.import_batches for select to authenticated using (user_id = (select auth.uid()));
create policy import_batches_insert_own on public.import_batches for insert to authenticated with check (user_id = (select auth.uid()));
create policy import_batches_update_own on public.import_batches for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy import_batches_delete_own on public.import_batches for delete to authenticated using (user_id = (select auth.uid()));

create policy recurring_items_select_own on public.recurring_items for select to authenticated using (user_id = (select auth.uid()));
create policy recurring_items_insert_own on public.recurring_items for insert to authenticated with check (user_id = (select auth.uid()));
create policy recurring_items_update_own on public.recurring_items for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy recurring_items_delete_own on public.recurring_items for delete to authenticated using (user_id = (select auth.uid()));

create policy transactions_select_own on public.transactions for select to authenticated using (user_id = (select auth.uid()));
create policy transactions_insert_own on public.transactions for insert to authenticated with check (user_id = (select auth.uid()));
create policy transactions_update_own on public.transactions for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy transactions_delete_own on public.transactions for delete to authenticated using (user_id = (select auth.uid()));

create policy budgets_select_own on public.budgets for select to authenticated using (user_id = (select auth.uid()));
create policy budgets_insert_own on public.budgets for insert to authenticated with check (user_id = (select auth.uid()));
create policy budgets_update_own on public.budgets for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy budgets_delete_own on public.budgets for delete to authenticated using (user_id = (select auth.uid()));

create policy goals_select_own on public.goals for select to authenticated using (user_id = (select auth.uid()));
create policy goals_insert_own on public.goals for insert to authenticated with check (user_id = (select auth.uid()));
create policy goals_update_own on public.goals for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy goals_delete_own on public.goals for delete to authenticated using (user_id = (select auth.uid()));

-- audit_events: read own; written only by log_event (SECURITY DEFINER, owner bypasses RLS).
create policy audit_events_select_own  on public.audit_events for select to authenticated using (user_id = (select auth.uid()));
create policy audit_events_insert_none on public.audit_events for insert to authenticated with check (false);
create policy audit_events_update_none on public.audit_events for update to authenticated using (false) with check (false);
create policy audit_events_delete_none on public.audit_events for delete to authenticated using (false);

-- -----------------------------------------------------------------------------
-- Table privileges
-- Supabase grants ALL on new public tables to anon, authenticated and
-- service_role by default. Start from nothing and grant back only what each
-- table needs. INSERT and UPDATE are column-level: user_id, id (on update),
-- source_ref (on update), created_at and updated_at are never client-writable.
-- service_role is revoked too: the only server-side code (delete-account)
-- calls the Auth admin API and does not touch public tables.
-- -----------------------------------------------------------------------------
revoke all on table
  public.currencies, public.profiles, public.accounts, public.category_groups,
  public.categories, public.import_batches, public.recurring_items,
  public.transactions, public.budgets, public.goals, public.audit_events
  from anon, authenticated, service_role;

grant select on public.currencies to authenticated;

grant select on public.profiles to authenticated;
grant update (display_name, currency, timezone, week_start) on public.profiles to authenticated;

grant select, delete on public.accounts to authenticated;
grant insert (id, name, type, opening_balance_minor, opening_date, sort_order, archived_at, source_ref)
  on public.accounts to authenticated;
grant update (name, type, opening_balance_minor, opening_date, sort_order, archived_at)
  on public.accounts to authenticated;

grant select, delete on public.category_groups to authenticated;
grant insert (id, name, sort_order) on public.category_groups to authenticated;
grant update (name, sort_order)     on public.category_groups to authenticated;

grant select, delete on public.categories to authenticated;
grant insert (id, group_id, name, kind, sort_order, archived_at, source_ref) on public.categories to authenticated;
grant update (group_id, name, kind, sort_order, archived_at)                on public.categories to authenticated;

grant select, delete on public.import_batches to authenticated;
grant insert (id, source, filename, row_count) on public.import_batches to authenticated;
grant update (status)                          on public.import_batches to authenticated;

grant select, delete on public.recurring_items to authenticated;
grant insert (id, name, label, kind, amount_minor, amount_is_variable, from_account_id, to_account_id,
              category_id, cadence_unit, cadence_interval, anchor_on, next_due_on, ends_on, archived_at)
  on public.recurring_items to authenticated;
grant update (name, label, kind, amount_minor, amount_is_variable, from_account_id, to_account_id,
              category_id, cadence_unit, cadence_interval, anchor_on, next_due_on, ends_on, archived_at)
  on public.recurring_items to authenticated;

grant select, delete on public.transactions to authenticated;
-- created_at is insertable on transactions only, so the Notion import can keep Notion's created time.
grant insert (id, kind, occurred_on, amount_minor, from_account_id, to_account_id, category_id,
              description, notes, status, recurring_item_id, import_batch_id, source_ref, created_at)
  on public.transactions to authenticated;
grant update (kind, occurred_on, amount_minor, from_account_id, to_account_id, category_id,
              description, notes, status, recurring_item_id)
  on public.transactions to authenticated;

grant select, delete on public.budgets to authenticated;
grant insert (id, category_id, month, amount_minor) on public.budgets to authenticated;
grant update (amount_minor)                         on public.budgets to authenticated;

grant select, delete on public.goals to authenticated;
grant insert (id, account_id, name, target_minor, target_date, monthly_plan_minor, sort_order, achieved_at, archived_at)
  on public.goals to authenticated;
grant update (name, target_minor, target_date, monthly_plan_minor, sort_order, achieved_at, archived_at)
  on public.goals to authenticated;

grant select on public.audit_events to authenticated;

-- The audit_events identity sequence also received Supabase's default grants.
-- Only log_event (running as the owner) draws from it.
revoke all on all sequences in schema public from anon, authenticated, service_role;

-- Future objects created by the migration role in public are not granted to anon.
alter default privileges in schema public revoke all on tables    from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke all on functions from anon;

-- =============================================================================
-- Views. All security_invoker, so the caller's RLS applies. These are the only
-- source of balances, spent, left, cash flow, goal progress and net worth.
-- Sums of bigint return numeric in Postgres; they are cast back to bigint.
-- =============================================================================

-- One signed entry per account side of a transaction: + into to_account, - out of from_account.
create view public.account_entries with (security_invoker = true) as
  select t.user_id, t.to_account_id as account_id, t.id as transaction_id, t.kind, t.status,
         t.occurred_on, t.amount_minor as signed_amount_minor
    from public.transactions t
   where t.to_account_id is not null
  union all
  select t.user_id, t.from_account_id, t.id, t.kind, t.status,
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
         (a.opening_balance_minor + coalesce(i.total, 0) - coalesce(o.total, 0))::bigint as balance_minor,
         (a.opening_balance_minor + coalesce(i.cleared, 0) - coalesce(o.cleared, 0))::bigint as cleared_balance_minor
    from public.accounts a
    left join lateral (
      select sum(t.amount_minor) as total,
             sum(t.amount_minor) filter (where t.status = 'cleared') as cleared
        from public.transactions t
       where t.user_id = a.user_id and t.to_account_id = a.id
    ) i on true
    left join lateral (
      select sum(t.amount_minor) as total,
             sum(t.amount_minor) filter (where t.status = 'cleared') as cleared
        from public.transactions t
       where t.user_id = a.user_id and t.from_account_id = a.id
    ) o on true;

-- Planned vs spent per budget row. Spent counts expenses only; left may go negative.
create view public.budget_progress with (security_invoker = true) as
  select b.user_id,
         b.id as budget_id,
         b.category_id,
         c.name as category_name,
         c.group_id,
         b.month,
         b.amount_minor as planned_minor,
         coalesce(s.spent, 0)::bigint as spent_minor,
         (b.amount_minor - coalesce(s.spent, 0))::bigint as left_minor
    from public.budgets b
    join public.categories c on c.user_id = b.user_id and c.id = b.category_id
    left join lateral (
      select sum(t.amount_minor) as spent
        from public.transactions t
       where t.user_id = b.user_id
         and t.category_id = b.category_id
         and t.kind = 'expense'
         and t.occurred_on >= b.month
         and t.occurred_on <  (b.month + interval '1 month')
    ) s on true;

-- Money in (income) and out (expenses) per calendar month. Transfers are excluded.
create view public.monthly_cash_flow with (security_invoker = true) as
  select t.user_id,
         date_trunc('month', t.occurred_on)::date as month,
         coalesce(sum(t.amount_minor) filter (where t.kind = 'income'),  0)::bigint as money_in_minor,
         coalesce(sum(t.amount_minor) filter (where t.kind = 'expense'), 0)::bigint as money_out_minor,
         (coalesce(sum(t.amount_minor) filter (where t.kind = 'income'),  0)
        - coalesce(sum(t.amount_minor) filter (where t.kind = 'expense'), 0))::bigint as net_minor
    from public.transactions t
   where t.kind <> 'transfer'
   group by t.user_id, date_trunc('month', t.occurred_on);

-- Goal progress. "This month" comes from the profile's time zone.
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

-- For "ordered by recent use" in category pickers.
create view public.category_usage with (security_invoker = true) as
  select c.user_id,
         c.id as category_id,
         c.kind,
         max(t.created_at) as last_used_at,
         count(t.id) as use_count
    from public.categories c
    left join public.transactions t on t.user_id = c.user_id and t.category_id = c.id
   group by c.user_id, c.id, c.kind;

revoke all on
  public.account_entries, public.account_balances, public.budget_progress,
  public.monthly_cash_flow, public.goal_progress, public.net_worth_by_month, public.category_usage
  from anon, authenticated, service_role;
grant select on
  public.account_entries, public.account_balances, public.budget_progress,
  public.monthly_cash_flow, public.goal_progress, public.net_worth_by_month, public.category_usage
  to authenticated;

-- =============================================================================
-- Functions
-- =============================================================================

-- Next due date strictly after p_after on the grid anchor + n x interval.
-- Always measured from the anchor, so month-end dates clamp without drift:
-- anchor Jan 31 gives Feb 28 (or 29), then Mar 31, not Mar 28.
create function public.recurrence_next(
  p_anchor date, p_unit public.cadence_unit, p_interval integer, p_after date)
returns date
language plpgsql
immutable
parallel safe
set search_path = ''
as $$
declare
  v_step interval;
  v_n    integer;
  v_date date;
begin
  if p_interval is null or p_interval < 1 or p_interval > 12 then
    raise exception 'interval must be between 1 and 12' using errcode = '22023';
  end if;
  if p_after < p_anchor then
    return p_anchor;
  end if;
  v_step := case p_unit
              when 'week'  then pg_catalog.make_interval(days   => 7 * p_interval)
              when 'month' then pg_catalog.make_interval(months => p_interval)
              else              pg_catalog.make_interval(years  => p_interval)
            end;
  -- Estimate the occurrence index, step back one, then walk forward.
  v_n := case p_unit
           when 'week'  then (p_after - p_anchor) / (7 * p_interval)
           when 'month' then ((extract(year from p_after)::integer * 12 + extract(month from p_after)::integer)
                            - (extract(year from p_anchor)::integer * 12 + extract(month from p_anchor)::integer)) / p_interval
           else              (extract(year from p_after)::integer - extract(year from p_anchor)::integer) / p_interval
         end;
  v_n := greatest(v_n - 1, 0);
  loop
    v_date := (p_anchor + v_step * v_n)::date;
    exit when v_date > p_after;
    v_n := v_n + 1;
  end loop;
  return v_date;
end;
$$;

-- Records one payment of a bill and advances next_due_on, atomically.
create function public.mark_bill_paid(
  p_item_id uuid, p_paid_on date default null, p_amount_minor bigint default null)
returns table (transaction_id uuid, next_due_on date)
language plpgsql
security invoker
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_item public.recurring_items;
  v_txn  uuid;
  v_next date;
  v_paid date;
begin
  select * into v_item from public.recurring_items ri where ri.id = p_item_id for update;
  if not found then
    raise exception 'Bill not found.' using errcode = 'P0002';
  end if;
  if v_item.archived_at is not null then
    raise exception 'This bill is archived.' using errcode = '55000';
  end if;

  v_paid := coalesce(p_paid_on,
                     (select (pg_catalog.now() at time zone p.timezone)::date
                        from public.profiles p where p.id = v_item.user_id));

  insert into public.transactions
    (kind, occurred_on, amount_minor, from_account_id, to_account_id, category_id, description, recurring_item_id)
  values
    (v_item.kind, v_paid, coalesce(p_amount_minor, v_item.amount_minor), v_item.from_account_id,
     v_item.to_account_id, v_item.category_id, v_item.name, v_item.id)
  returning id into v_txn;

  v_next := public.recurrence_next(v_item.anchor_on, v_item.cadence_unit, v_item.cadence_interval, v_item.next_due_on);

  update public.recurring_items ri set next_due_on = v_next where ri.id = v_item.id;

  return query select v_txn, v_next;
end;
$$;

-- Starts a month from another month's plan. Never overwrites existing rows.
-- Archived categories are not copied. Returns the number of rows inserted.
create function public.copy_budgets(p_from_month date, p_to_month date)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_count integer;
begin
  if p_from_month is null or p_to_month is null
     or extract(day from p_from_month) <> 1 or extract(day from p_to_month) <> 1 then
    raise exception 'Months must be the first day of a month.' using errcode = '22023';
  end if;
  if p_from_month = p_to_month then
    raise exception 'Source and target months are the same.' using errcode = '22023';
  end if;

  insert into public.budgets (category_id, month, amount_minor)
  select b.category_id, p_to_month, b.amount_minor
    from public.budgets b
    join public.categories c on c.user_id = b.user_id and c.id = b.category_id
   where b.user_id = (select auth.uid())
     and b.month = p_from_month
     and c.archived_at is null
  on conflict (user_id, category_id, month) do nothing;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- The single import path for CSV and the Notion migration.
--   p_batch: {"source": "csv" | "notion", "filename": "..."}
--   p_rows:  [{"kind", "occurred_on", "amount_minor", "from_account_id", "to_account_id",
--              "category_id", "description", "notes", "status", "source_ref", "created_at"}]
-- Every row needs a source_ref. Rows whose source_ref already exists are
-- skipped, so re-running an import inserts nothing. Any invalid row aborts
-- the whole call (one database transaction): no batch, no rows.
create function public.import_transactions(p_batch jsonb, p_rows jsonb)
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
     description, notes, status, source_ref, import_batch_id, created_at)
  select r.kind, r.occurred_on, r.amount_minor, r.from_account_id, r.to_account_id, r.category_id,
         r.description, r.notes, coalesce(r.status, 'cleared'), r.source_ref, v_batch,
         coalesce(r.created_at, pg_catalog.now())
    from jsonb_to_recordset(p_rows) as r(
           kind public.txn_kind, occurred_on date, amount_minor bigint,
           from_account_id uuid, to_account_id uuid, category_id uuid,
           description text, notes text, status public.txn_status,
           source_ref text, created_at timestamptz)
  on conflict (user_id, source_ref) where source_ref is not null do nothing;

  get diagnostics v_inserted = row_count;

  perform public.log_event('import', v_batch, v_inserted);

  return query select v_batch, v_inserted, v_total - v_inserted;
end;
$$;

-- Moves everything from one category to another of the same kind, adds the
-- source's budget amounts into the target's for the same months, then deletes
-- the source. Returns the number of transactions moved.
create function public.merge_categories(p_source_id uuid, p_target_id uuid)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_source public.categories;
  v_target public.categories;
  v_moved  integer;
begin
  select * into v_source from public.categories c where c.id = p_source_id for update;
  select * into v_target from public.categories c where c.id = p_target_id for update;
  if v_source.id is null or v_target.id is null then
    raise exception 'Category not found.' using errcode = 'P0002';
  end if;
  if v_source.id = v_target.id then
    raise exception 'Choose two different categories.' using errcode = '22023';
  end if;
  if v_source.kind <> v_target.kind then
    raise exception 'Only categories of the same kind can be merged.' using errcode = '22023';
  end if;

  update public.transactions t set category_id = v_target.id where t.category_id = v_source.id;
  get diagnostics v_moved = row_count;

  update public.recurring_items ri set category_id = v_target.id where ri.category_id = v_source.id;

  insert into public.budgets as b (category_id, month, amount_minor)
  select v_target.id, s.month, s.amount_minor
    from public.budgets s
   where s.category_id = v_source.id
  on conflict (user_id, category_id, month)
  do update set amount_minor = b.amount_minor + excluded.amount_minor;

  delete from public.categories c where c.id = v_source.id;  -- cascades its budgets
  return v_moved;
end;
$$;

-- -----------------------------------------------------------------------------
-- SECURITY DEFINER functions. There are exactly two (enforced by the CI gate).
-- -----------------------------------------------------------------------------

-- Writes an audit event for the caller only. The event is a fixed enum;
-- there is no free-form payload, so no amounts or descriptions can be stored.
create function public.log_event(
  p_event public.audit_event, p_subject_id uuid default null, p_row_count integer default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Not signed in.' using errcode = '42501';
  end if;
  insert into public.audit_events (user_id, event, subject_id, row_count)
  values (v_uid, p_event, p_subject_id, p_row_count);
end;
$$;

-- Creates the profile at sign-up. Optional metadata: display_name, timezone.
-- An unknown time zone falls back to UTC instead of failing sign-up.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tz text := new.raw_user_meta_data ->> 'timezone';
begin
  if v_tz is null or not exists (select 1 from pg_catalog.pg_timezone_names where name = v_tz) then
    v_tz := 'UTC';
  end if;
  insert into public.profiles (id, display_name, timezone)
  values (new.id, left(nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''), 80), v_tz);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- -----------------------------------------------------------------------------
-- Function privileges: nothing for PUBLIC or anon; RPCs for authenticated only.
-- Trigger functions need no EXECUTE grant to fire.
-- -----------------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon, authenticated, service_role;

grant execute on function public.is_liability(public.account_type)                            to authenticated;
grant execute on function public.recurrence_next(date, public.cadence_unit, integer, date)    to authenticated;
grant execute on function public.mark_bill_paid(uuid, date, bigint)                           to authenticated;
grant execute on function public.copy_budgets(date, date)                                     to authenticated;
grant execute on function public.import_transactions(jsonb, jsonb)                            to authenticated;
grant execute on function public.merge_categories(uuid, uuid)                                 to authenticated;
grant execute on function public.log_event(public.audit_event, uuid, integer)                 to authenticated;

-- TEMPORARY MUTATION, NOT FOR MERGE: a permissive policy that exposes every
-- user's accounts to every signed-in caller. The Phase 4 suite must catch it.
create policy accounts_select_everyone on public.accounts for select to authenticated using (true);
