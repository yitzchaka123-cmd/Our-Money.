-- Several cash wallets: the one in a pocket, the one in the other pocket, the
-- envelope in the drawer. A wallet is WHERE cash is; the envelopes stay WHAT it
-- was for, so every wallet's spending still rolls up into the same RiseUp
-- envelopes and every wallet's income into the same cash income envelope.

create table if not exists cash_wallets (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  -- Owner, for "whose wallet"; null means shared.
  member_id    uuid references household_members (id),
  is_default   boolean not null default false,
  is_archived  boolean not null default false,
  position     integer not null default 0,
  created_at   timestamptz not null default now()
);

-- Exactly one default: ATM withdrawals land there, and rows written before
-- wallets existed count toward it.
create unique index if not exists cash_wallets_one_default_idx
  on cash_wallets (is_default) where is_default = true;

insert into cash_wallets (name, is_default, position)
select 'ארנק ראשי', true, 0
where not exists (select 1 from cash_wallets);

alter table cash_spends add column if not exists wallet_id uuid references cash_wallets (id);
alter table cash_topups add column if not exists wallet_id uuid references cash_wallets (id);

create index if not exists cash_spends_wallet_idx on cash_spends (wallet_id) where status <> 'deleted';
create index if not exists cash_topups_wallet_idx on cash_topups (wallet_id) where is_dismissed = false;

-- Moving cash between wallets changes where it is, not how much there is, so
-- it is its own table rather than a top-up/spend pair that would show up in
-- the envelopes.
create table if not exists cash_transfers (
  id              uuid primary key default gen_random_uuid(),
  from_wallet_id  uuid not null references cash_wallets (id),
  to_wallet_id    uuid not null references cash_wallets (id),
  amount_ils      numeric(12, 2) not null check (amount_ils > 0),
  occurred_at     date not null,
  member_id       uuid references household_members (id),
  note            text,
  is_dismissed    boolean not null default false,
  created_at      timestamptz not null default now(),
  check (from_wallet_id <> to_wallet_id)
);

create index if not exists cash_transfers_occurred_idx
  on cash_transfers (occurred_at desc) where is_dismissed = false;

alter table cash_wallets   enable row level security;
alter table cash_transfers enable row level security;
