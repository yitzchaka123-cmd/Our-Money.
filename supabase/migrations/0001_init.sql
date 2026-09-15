-- Our Money — cash ledger that sits alongside RiseUp.
--
-- Model in one line: RiseUp tells us how much cash left the bank; this schema
-- tracks where that cash actually went, and the gap between the two is the
-- number we care about ("unaccounted cash").

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Who is allowed to log
-- ---------------------------------------------------------------------------
create table if not exists household_members (
  id                uuid primary key default gen_random_uuid(),
  telegram_user_id  bigint      not null unique,
  display_name      text        not null,
  is_active         boolean     not null default true,
  created_at        timestamptz not null default now()
);

comment on table household_members is
  'Telegram users permitted to log cash. Seeded from TELEGRAM_ALLOWED_USER_IDS on first contact.';

-- ---------------------------------------------------------------------------
-- Categories — mirrors RiseUp''s Hebrew category labels so the two ledgers
-- can be added together. Refreshed from observed RiseUp categoryLabel values
-- on every sync, so it converges on the real list rather than our guess.
-- ---------------------------------------------------------------------------
create table if not exists categories (
  label       text primary key,
  source      text        not null default 'seed'
                check (source in ('seed', 'riseup', 'manual')),
  is_active   boolean     not null default true,
  created_at  timestamptz not null default now()
);

insert into categories (label, source) values
  ('מזון וצריכה',      'seed'),
  ('מסעדות',           'seed'),
  ('תחבורה ורכב',      'seed'),
  ('בריאות',           'seed'),
  ('ביגוד והנעלה',     'seed'),
  ('פנאי ובידור',      'seed'),
  ('חינוך וילדים',     'seed'),
  ('בית ותחזוקה',      'seed'),
  ('טיפוח',            'seed'),
  ('מתנות ותרומות',    'seed'),
  ('תקשורת',           'seed'),
  ('אחר',              'seed')
on conflict (label) do nothing;

-- ---------------------------------------------------------------------------
-- Cash going OUT of the wallet — the part RiseUp cannot see
-- ---------------------------------------------------------------------------
create table if not exists cash_spends (
  id                   uuid primary key default gen_random_uuid(),
  member_id            uuid        not null references household_members (id),
  amount_ils           numeric(12, 2) not null check (amount_ils > 0),
  category             text        not null references categories (label),
  note                 text,
  spent_at             date        not null,
  status               text        not null default 'confirmed'
                         check (status in ('confirmed', 'needs_review', 'deleted')),
  confidence           text        not null default 'high'
                         check (confidence in ('high', 'medium', 'low')),
  input_kind           text        not null default 'text'
                         check (input_kind in ('text', 'voice')),
  raw_input            text,
  transcript           text,
  -- Telegram delivers webhooks at-least-once; this makes replays no-ops.
  telegram_update_id   bigint      unique,
  telegram_chat_id     bigint,
  telegram_message_id  bigint,
  bot_message_id       bigint,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists cash_spends_spent_at_idx
  on cash_spends (spent_at desc) where status <> 'deleted';
create index if not exists cash_spends_member_idx
  on cash_spends (member_id, spent_at desc) where status <> 'deleted';
create index if not exists cash_spends_bot_message_idx
  on cash_spends (telegram_chat_id, bot_message_id);

-- ---------------------------------------------------------------------------
-- Cash coming IN to the wallet — mostly ATM withdrawals detected in RiseUp
-- ---------------------------------------------------------------------------
create table if not exists cash_topups (
  id                     uuid primary key default gen_random_uuid(),
  amount_ils             numeric(12, 2) not null check (amount_ils > 0),
  occurred_at            date        not null,
  source                 text        not null default 'riseup_withdrawal'
                           check (source in ('riseup_withdrawal', 'manual')),
  -- Set for RiseUp-derived rows; the unique constraint keeps re-syncs idempotent.
  riseup_transaction_id  text        unique,
  business_name          text,
  note                   text,
  is_dismissed           boolean     not null default false,
  created_at             timestamptz not null default now()
);

create index if not exists cash_topups_occurred_at_idx
  on cash_topups (occurred_at desc) where is_dismissed = false;

comment on column cash_topups.is_dismissed is
  'Set when a detected "withdrawal" turns out not to be one. Keeps the row so the next sync does not re-add it.';

-- ---------------------------------------------------------------------------
-- Mirror of RiseUp transactions (read-only upstream)
-- ---------------------------------------------------------------------------
create table if not exists riseup_transactions (
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
  raw                  jsonb       not null,
  synced_at            timestamptz not null default now()
);

create index if not exists riseup_transactions_month_idx
  on riseup_transactions (cashflow_month);
create index if not exists riseup_transactions_withdrawal_idx
  on riseup_transactions (is_withdrawal) where is_withdrawal = true;

-- ---------------------------------------------------------------------------
-- Sync bookkeeping — so a failing PAT is visible instead of silent
-- ---------------------------------------------------------------------------
create table if not exists sync_runs (
  id                     uuid primary key default gen_random_uuid(),
  started_at             timestamptz not null default now(),
  finished_at            timestamptz,
  status                 text        not null default 'running'
                           check (status in ('running', 'succeeded', 'failed')),
  months                 text[]      not null default '{}',
  transactions_upserted  integer     not null default 0,
  topups_created         integer     not null default 0,
  error                  text
);

create index if not exists sync_runs_started_at_idx on sync_runs (started_at desc);

-- ---------------------------------------------------------------------------
-- Row level security
--
-- Every path into this data is a server-side route holding the service role
-- key, which bypasses RLS. We still enable RLS with no permissive policies so
-- that an anon or authenticated key — should one ever reach a browser — reads
-- and writes nothing.
-- ---------------------------------------------------------------------------
alter table household_members     enable row level security;
alter table categories            enable row level security;
alter table cash_spends           enable row level security;
alter table cash_topups           enable row level security;
alter table riseup_transactions   enable row level security;
alter table sync_runs             enable row level security;
