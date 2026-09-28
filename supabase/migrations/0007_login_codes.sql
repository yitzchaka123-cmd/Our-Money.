-- One-time sign-in codes. A phone's home-screen app keeps its own cookies, so
-- the bot's sign-in link (which opens in the browser) cannot sign it in; the
-- bot sends a short code alongside the link, typed into the app instead.
create table if not exists login_codes (
  id          uuid primary key default gen_random_uuid(),
  member_id   uuid        not null references household_members (id) on delete cascade,
  -- HMAC of the code; the code itself is never stored.
  code_hash   text        not null,
  expires_at  timestamptz not null,
  used_at     timestamptz,
  created_at  timestamptz not null default now()
);

create index if not exists login_codes_live_idx on login_codes (code_hash) where used_at is null;

-- Wrong guesses, household-wide. Past a small number in a short window every
-- attempt is refused for a while, so a six-digit code cannot be brute-forced.
create table if not exists login_failures (
  id  bigint generated always as identity primary key,
  at  timestamptz not null default now()
);

create index if not exists login_failures_at_idx on login_failures (at desc);

alter table login_codes    enable row level security;
alter table login_failures enable row level security;
