-- The daily brief and the insight cards (feedback video 1, items 3 and 16).
--
-- Everything stays inside `money` and stays small: one row per member for the
-- brief, one row per member and insight card they dismissed or rated, and one
-- forecast figure per day (pruned by the app after 40 days).

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

-- ---------------------------------------------------------------------------
-- Insight cards: dismissed ones never come back for the same key, and the
-- "זה עזר לך?" answer is kept.
-- ---------------------------------------------------------------------------

create table money.insight_feedback (
  member_id    uuid        not null references money.household_members (id) on delete cascade,
  insight_key  text        not null check (char_length(insight_key) between 1 and 200),
  dismissed    boolean     not null default false,
  helpful      boolean,
  at           timestamptz not null default now(),
  primary key (member_id, insight_key)
);

-- One figure per day, so a card can say how the forecast moved since yesterday.
create table money.forecast_snapshots (
  day       date           primary key,
  month     text           not null check (month ~ '^\d{4}-\d{2}$'),
  forecast  numeric(12, 2) not null,
  at        timestamptz    not null default now()
);

alter table money.member_brief_state  enable row level security;
alter table money.insight_feedback    enable row level security;
alter table money.forecast_snapshots  enable row level security;

-- Server-only, as everything in `money` (see 0002). The default privileges set
-- there already cover new tables; saying it here keeps this file correct even
-- if it is applied by a different role.
revoke all on money.member_brief_state, money.insight_feedback, money.forecast_snapshots
  from public, anon, authenticated;
grant all on money.member_brief_state, money.insight_feedback, money.forecast_snapshots
  to service_role;
