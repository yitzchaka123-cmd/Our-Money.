-- Telegram settings (feedback videos 2, 3 and 4).
--
--  * money.app_settings: small household-wide values the bot learns by itself,
--    such as the family group it was added to (so nobody pastes a chat id
--    into a server setting). One short row per key.
--  * Per member: how often the evening "היו היום הוצאות במזומן?" comes, and
--    whether a spend from the bot is saved at once or waits for "לאשר".
--  * Per bank withdrawal: when the bot asked which wallet the cash went into,
--    so it never asks twice.
--
-- Everything stays inside `money` and stays tiny.

create table if not exists money.app_settings (
  key         text        primary key check (key ~ '^[a-z][a-z0-9_]{0,62}$'),
  value       text        check (value is null or char_length(value) <= 200),
  updated_by  uuid        references money.household_members (id) on delete set null,
  updated_at  timestamptz not null default now()
);
comment on table money.app_settings is
  'Household-wide settings (e.g. the family Telegram group the bot was added to). One short row per key.';

alter table money.app_settings enable row level security;

-- Server-only, as everything in `money` (see 0002).
revoke all on money.app_settings from public, anon, authenticated;
grant all on money.app_settings to service_role;

alter table money.household_members
  add column if not exists nudge_frequency text not null default 'daily'
    check (nudge_frequency in ('daily', 'weekdays', 'weekly', 'never')),
  add column if not exists bot_confirm_mode text not null default 'instant'
    check (bot_confirm_mode in ('instant', 'ask'));

comment on column money.household_members.nudge_frequency is
  'Evening reminder: daily, weekdays (Sun–Thu), weekly (Sunday) or never.';
comment on column money.household_members.bot_confirm_mode is
  'instant: a spend from the bot counts at once; ask: it waits (needs_review) until approved.';

alter table money.cash_topups add column if not exists wallet_asked_at timestamptz;

comment on column money.cash_topups.wallet_asked_at is
  'When the bot asked which wallet this bank withdrawal went into; set once, so it is asked only once.';
