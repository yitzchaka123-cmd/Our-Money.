-- The daily brief (feedback video 1, item 3).
--
-- Everything stays inside `money` and stays small: one column on the RiseUp
-- mirror and one row per member.

-- ---------------------------------------------------------------------------
-- When a RiseUp charge first reached us. `synced_at` is rewritten on every
-- sync, so it cannot say what is new; this column is set once on insert and
-- left alone by the sync's upsert, which only writes the columns it sends.
-- ---------------------------------------------------------------------------

alter table money.riseup_transactions
  add column if not exists first_seen_at timestamptz not null default now();

-- Rows already mirrored get the day after their purchase rather than "now",
-- so the first brief after this migration is a day's news, not six months'.
update money.riseup_transactions
   set first_seen_at = least(first_seen_at, transaction_date::timestamptz + interval '1 day')
 where transaction_date is not null;

create index if not exists riseup_transactions_first_seen_idx
  on money.riseup_transactions (first_seen_at desc);

-- ---------------------------------------------------------------------------
-- The brief: how far each member has read. Anything that reached us after
-- `seen_until` is new to them.
-- ---------------------------------------------------------------------------

create table money.member_brief_state (
  member_id   uuid        primary key references money.household_members (id) on delete cascade,
  seen_until  timestamptz not null,
  updated_at  timestamptz not null default now()
);
comment on table money.member_brief_state is
  'Daily brief: the point each member has read up to. Written when they reach the last card.';

alter table money.member_brief_state  enable row level security;

-- Server-only, as everything in `money` (see 0002). The default privileges set
-- there already cover new tables; saying it here keeps this file correct even
-- if it is applied by a different role.
revoke all on money.member_brief_state
  from public, anon, authenticated;
grant all on money.member_brief_state
  to service_role;
