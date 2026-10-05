-- Our Money lives in its own schema, `money`, inside a Supabase project it
-- shares with other apps. Every object here is schema-qualified on purpose:
-- run against any search_path, nothing can land in someone else's schema.
-- Nothing outside `money` is created, changed or dropped, and no extension is
-- touched (gen_random_uuid is built into Postgres).
--
-- Lean by design — the free plan's 500 MB is shared by every app in the
-- project. RiseUp data is stored as the columns the app reads, not as raw
-- JSON copies, and the sync prunes logs and old mirrors (lib/riseup/prune.ts).

create schema if not exists money;
comment on schema money is 'Our Money — the cash ledger beside RiseUp. Server-only.';

-- ---------------------------------------------------------------------------
-- People and categories
-- ---------------------------------------------------------------------------

create table money.household_members (
  id                uuid primary key default gen_random_uuid(),
  telegram_user_id  bigint      not null unique,
  display_name      text        not null,
  is_active         boolean     not null default true,
  created_at        timestamptz not null default now()
);
comment on table money.household_members is
  'Telegram users permitted to log cash. Created from TELEGRAM_ALLOWED_USER_IDS on first contact.';

-- Mirrors RiseUp's Hebrew category labels so the two ledgers add up; new
-- labels are registered automatically (see money.register_spend_category).
create table money.categories (
  label       text primary key,
  source      text        not null default 'seed' check (source in ('seed', 'riseup', 'manual')),
  is_active   boolean     not null default true,
  created_at  timestamptz not null default now()
);

insert into money.categories (label, source) values
  ('מזון וצריכה', 'seed'), ('מסעדות', 'seed'), ('תחבורה ורכב', 'seed'), ('בריאות', 'seed'),
  ('ביגוד והנעלה', 'seed'), ('פנאי ובידור', 'seed'), ('חינוך וילדים', 'seed'), ('בית ותחזוקה', 'seed'),
  ('טיפוח', 'seed'), ('מתנות ותרומות', 'seed'), ('תקשורת', 'seed'), ('אחר', 'seed')
on conflict (label) do nothing;

-- ---------------------------------------------------------------------------
-- Wallets: where cash physically is
-- ---------------------------------------------------------------------------

create table money.cash_wallets (
  id           uuid primary key default gen_random_uuid(),
  name         text    not null,
  member_id    uuid    references money.household_members (id),
  is_default   boolean not null default false,
  is_archived  boolean not null default false,
  position     integer not null default 0,
  created_at   timestamptz not null default now()
);
-- Exactly one default wallet: ATM withdrawals and unassigned cash land there.
create unique index cash_wallets_one_default_idx on money.cash_wallets (is_default) where is_default;

insert into money.cash_wallets (name, is_default, position)
select 'ארנק ראשי', true, 0
where not exists (select 1 from money.cash_wallets);

-- ---------------------------------------------------------------------------
-- Expected cash: payments and income known to be coming
-- ---------------------------------------------------------------------------

create table money.cash_plans (
  id              uuid primary key default gen_random_uuid(),
  kind            text           not null check (kind in ('spend', 'income')),
  amount_ils      numeric(12, 2) not null check (amount_ils > 0),
  category        text           not null,
  note            text,
  -- Envelope ids change every month, so a plan remembers the envelope's type
  -- (and a tracker's name) and is re-resolved against each month.
  envelope_type   text check (envelope_type in ('variable', 'fixed', 'trackingCategory', 'riseupGoal')),
  envelope_name   text,
  day_of_month    smallint       not null default 1 check (day_of_month between 1 and 31),
  recurrence      text           not null default 'monthly' check (recurrence in ('monthly', 'once')),
  starts_month    text           not null check (starts_month ~ '^\d{4}-\d{2}$'),
  ends_month      text check (ends_month ~ '^\d{4}-\d{2}$'),
  wallet_id       uuid references money.cash_wallets (id),
  member_id       uuid references money.household_members (id),
  is_active       boolean        not null default true,
  created_at      timestamptz    not null default now(),
  updated_at      timestamptz    not null default now()
);
create index cash_plans_active_idx on money.cash_plans (starts_month) where is_active;

-- "Not this month": the plan stays, one month's occurrence is dropped.
create table money.cash_plan_skips (
  plan_id  uuid not null references money.cash_plans (id) on delete cascade,
  month    text not null check (month ~ '^\d{4}-\d{2}$'),
  primary key (plan_id, month)
);

-- ---------------------------------------------------------------------------
-- Cash going out
-- ---------------------------------------------------------------------------

create table money.cash_spends (
  id                   uuid primary key default gen_random_uuid(),
  member_id            uuid           not null references money.household_members (id),
  amount_ils           numeric(12, 2) not null check (amount_ils > 0),
  category             text           not null references money.categories (label),
  note                 text,
  spent_at             date           not null,
  status               text           not null default 'confirmed' check (status in ('confirmed', 'needs_review', 'deleted')),
  confidence           text           not null default 'high' check (confidence in ('high', 'medium', 'low')),
  input_kind           text           not null default 'text' check (input_kind in ('text', 'voice', 'web')),
  raw_input            text,
  transcript           text,
  telegram_update_id   bigint unique,
  telegram_chat_id     bigint,
  telegram_message_id  bigint,
  bot_message_id       bigint,
  -- The RiseUp envelope this spend is filed in; null falls back to the month's
  -- variable envelope, RiseUp's own default for an uncategorised charge.
  envelope_id          text,
  envelope_type        text,
  wallet_id            uuid references money.cash_wallets (id),
  plan_id              uuid references money.cash_plans (id) on delete set null,
  created_at           timestamptz    not null default now(),
  updated_at           timestamptz    not null default now()
);
create index cash_spends_spent_at_idx    on money.cash_spends (spent_at desc) where status <> 'deleted';
create index cash_spends_member_idx      on money.cash_spends (member_id, spent_at desc) where status <> 'deleted';
create index cash_spends_bot_message_idx on money.cash_spends (telegram_chat_id, bot_message_id);
create index cash_spends_envelope_idx    on money.cash_spends (envelope_id) where status <> 'deleted';
create index cash_spends_wallet_idx      on money.cash_spends (wallet_id) where status <> 'deleted';
create index cash_spends_plan_idx        on money.cash_spends (plan_id) where plan_id is not null;

-- ---------------------------------------------------------------------------
-- Cash coming in: withdrawals (bank → wallet) and cash income
-- ---------------------------------------------------------------------------

create table money.cash_topups (
  id                     uuid primary key default gen_random_uuid(),
  amount_ils             numeric(12, 2) not null check (amount_ils > 0),
  occurred_at            date           not null,
  source                 text           not null default 'riseup_withdrawal'
                           check (source in ('riseup_withdrawal', 'manual', 'cash_income')),
  riseup_transaction_id  text unique,
  business_name          text,
  note                   text,
  -- Kept rather than deleted, so a rejected bank withdrawal never comes back.
  is_dismissed           boolean        not null default false,
  member_id              uuid references money.household_members (id),
  category               text,
  input_kind             text default 'text' check (input_kind in ('text', 'voice', 'web')),
  wallet_id              uuid references money.cash_wallets (id),
  plan_id                uuid references money.cash_plans (id) on delete set null,
  created_at             timestamptz    not null default now(),
  updated_at             timestamptz    not null default now()
);
create index cash_topups_occurred_at_idx on money.cash_topups (occurred_at desc) where not is_dismissed;
create index cash_topups_wallet_idx      on money.cash_topups (wallet_id) where not is_dismissed;
create index cash_topups_plan_idx        on money.cash_topups (plan_id) where plan_id is not null;

create table money.cash_transfers (
  id              uuid primary key default gen_random_uuid(),
  from_wallet_id  uuid           not null references money.cash_wallets (id),
  to_wallet_id    uuid           not null references money.cash_wallets (id),
  amount_ils      numeric(12, 2) not null check (amount_ils > 0),
  occurred_at     date           not null,
  member_id       uuid references money.household_members (id),
  note            text,
  is_dismissed    boolean        not null default false,
  created_at      timestamptz    not null default now(),
  check (from_wallet_id <> to_wallet_id)
);
create index cash_transfers_occurred_idx on money.cash_transfers (occurred_at desc) where not is_dismissed;

-- ---------------------------------------------------------------------------
-- The RiseUp mirror (read-only upstream; columns only, no raw JSON)
-- ---------------------------------------------------------------------------

create table money.riseup_transactions (
  transaction_id       text primary key,
  transaction_date     date,
  billing_date         date,
  cashflow_month       text,
  business_name        text,
  amount_ils           numeric(12, 2),
  is_income            boolean,
  source               text,
  source_type          text,
  account_nickname     text,
  account_number_hash  text,
  category_label       text,
  category_type        text,
  is_withdrawal        boolean     not null default false,
  synced_at            timestamptz not null default now()
);
create index riseup_transactions_month_idx on money.riseup_transactions (cashflow_month);

create table money.riseup_envelopes (
  id             uuid primary key default gen_random_uuid(),
  month          text           not null,
  envelope_id    text           not null,
  envelope_type  text           not null,
  name           text,
  planned_ils    numeric(12, 2) not null default 0,
  actual_ils     numeric(12, 2) not null default 0,
  position       integer        not null default 0,
  synced_at      timestamptz    not null default now(),
  unique (month, envelope_id)
);

create table money.riseup_envelope_actuals (
  id                   uuid primary key default gen_random_uuid(),
  month                text           not null,
  envelope_id          text           not null,
  transaction_id       text           not null,
  transaction_date     date,
  billing_date         date,
  business_name        text,
  amount_ils           numeric(12, 2) not null default 0,
  is_income            boolean        not null default false,
  account_nickname     text,
  account_number_hash  text,
  source               text,
  is_installment       boolean        not null default false,
  payment_number       integer,
  total_payments       integer,
  category_label       text,
  unique (month, envelope_id, transaction_id)
);

create table money.sync_runs (
  id                     uuid primary key default gen_random_uuid(),
  started_at             timestamptz not null default now(),
  finished_at            timestamptz,
  status                 text        not null default 'running' check (status in ('running', 'succeeded', 'failed')),
  months                 text[]      not null default '{}',
  transactions_upserted  integer     not null default 0,
  topups_created         integer     not null default 0,
  error                  text,
  -- An expired token needs a person; a rate limit or network blip does not.
  error_kind             text check (error_kind in ('auth', 'rate_limit', 'network', 'other'))
);
create index sync_runs_started_at_idx on money.sync_runs (started_at desc);
create index sync_runs_succeeded_idx  on money.sync_runs (finished_at desc) where status = 'succeeded';

-- ---------------------------------------------------------------------------
-- Sign-in codes for the home-screen app (Supabase Auth is not used)
-- ---------------------------------------------------------------------------

create table money.login_codes (
  id          uuid primary key default gen_random_uuid(),
  member_id   uuid        not null references money.household_members (id) on delete cascade,
  code_hash   text        not null,  -- HMAC of the code; the code is never stored
  expires_at  timestamptz not null,
  used_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index login_codes_live_idx on money.login_codes (code_hash) where used_at is null;

-- Wrong guesses, household-wide, so a six-digit code cannot be brute-forced.
create table money.login_failures (
  id  bigint generated always as identity primary key,
  at  timestamptz not null default now()
);
create index login_failures_at_idx on money.login_failures (at desc);

-- ---------------------------------------------------------------------------
-- A spend's category must exist in money.categories, but labels arrive from
-- the seed, from RiseUp and from whatever is typed on the dashboard. Register
-- a new label just before the foreign key is checked.
-- ---------------------------------------------------------------------------

create function money.register_spend_category()
returns trigger
language plpgsql
set search_path = money, pg_catalog
as $$
begin
  insert into money.categories (label, source)
  values (new.category, 'manual')
  on conflict (label) do nothing;
  return new;
end;
$$;
revoke execute on function money.register_spend_category() from public;

create trigger cash_spends_register_category
  before insert or update of category on money.cash_spends
  for each row execute function money.register_spend_category();

-- ---------------------------------------------------------------------------
-- Row level security on every table, with no policies: only a role that
-- bypasses RLS (the server's service role) reaches a row. The schema-level
-- lock is in 0002.
-- ---------------------------------------------------------------------------

alter table money.household_members       enable row level security;
alter table money.categories              enable row level security;
alter table money.cash_wallets            enable row level security;
alter table money.cash_plans              enable row level security;
alter table money.cash_plan_skips         enable row level security;
alter table money.cash_spends             enable row level security;
alter table money.cash_topups             enable row level security;
alter table money.cash_transfers          enable row level security;
alter table money.riseup_transactions     enable row level security;
alter table money.riseup_envelopes        enable row level security;
alter table money.riseup_envelope_actuals enable row level security;
alter table money.sync_runs               enable row level security;
alter table money.login_codes             enable row level security;
alter table money.login_failures          enable row level security;
