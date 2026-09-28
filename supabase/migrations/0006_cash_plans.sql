-- Expected cash: a payment or income the couple knows is coming — the cleaner
-- paid in cash every month, a cash salary, a one-off gift — so it counts in
-- the month's forecast before it happens, the way RiseUp's own predicted
-- transactions do.

create table if not exists cash_plans (
  id              uuid primary key default gen_random_uuid(),
  kind            text        not null check (kind in ('spend', 'income')),
  amount_ils      numeric(12, 2) not null check (amount_ils > 0),
  category        text        not null,
  note            text,
  -- Which envelope family it belongs to. Envelope ids change every month, so a
  -- plan remembers the type (and, for a tracker, its name) and is re-resolved
  -- against each month's envelopes. Null resolves from the category.
  envelope_type   text check (envelope_type in ('variable', 'fixed', 'trackingCategory', 'riseupGoal')),
  envelope_name   text,
  day_of_month    smallint    not null default 1 check (day_of_month between 1 and 31),
  recurrence      text        not null default 'monthly' check (recurrence in ('monthly', 'once')),
  starts_month    text        not null check (starts_month ~ '^\d{4}-\d{2}$'),
  ends_month      text check (ends_month ~ '^\d{4}-\d{2}$'),
  wallet_id       uuid references cash_wallets (id),
  member_id       uuid references household_members (id),
  is_active       boolean     not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- "Not this month": the plan stays, one month's occurrence is dropped.
create table if not exists cash_plan_skips (
  plan_id  uuid not null references cash_plans (id) on delete cascade,
  month    text not null check (month ~ '^\d{4}-\d{2}$'),
  primary key (plan_id, month)
);

-- A spend or income recorded against a plan settles that month's occurrence.
alter table cash_spends add column if not exists plan_id uuid references cash_plans (id) on delete set null;
alter table cash_topups add column if not exists plan_id uuid references cash_plans (id) on delete set null;

create index if not exists cash_spends_plan_idx on cash_spends (plan_id) where plan_id is not null;
create index if not exists cash_topups_plan_idx on cash_topups (plan_id) where plan_id is not null;
create index if not exists cash_plans_active_idx on cash_plans (starts_month) where is_active;

alter table cash_plans      enable row level security;
alter table cash_plan_skips enable row level security;
