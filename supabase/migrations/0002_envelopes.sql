-- RiseUp organises a month as "envelopes" (income, variable expenses, fixed
-- expenses, per-category trackers, savings goals), each with a planned amount
-- and its actual transactions. The dashboard is built on that shape, so we
-- mirror it from GET /api/external/budget/:month alongside the transaction feed.

create table if not exists riseup_envelopes (
  id            uuid primary key default gen_random_uuid(),
  month         text not null,
  envelope_id   text not null,
  -- fixed | trackingCategory | variable | variableIncome | riseupGoal
  envelope_type text not null,
  name          text,
  planned_ils   numeric(12, 2) not null default 0,
  actual_ils    numeric(12, 2) not null default 0,
  position      integer not null default 0,
  raw           jsonb not null,
  synced_at     timestamptz not null default now(),
  unique (month, envelope_id)
);

create index if not exists riseup_envelopes_month_idx on riseup_envelopes (month);

comment on column riseup_envelopes.actual_ils is
  'Summed from the envelope''s own actuals rather than read off a field — the two candidate fields on the envelope are documented inconsistently, but the actuals are unambiguous.';

-- One row per transaction inside an envelope, so a card can expand into its
-- real charges without another API round-trip.
create table if not exists riseup_envelope_actuals (
  id                  uuid primary key default gen_random_uuid(),
  month               text not null,
  envelope_id         text not null,
  transaction_id      text not null,
  transaction_date    date,
  billing_date        date,
  business_name       text,
  amount_ils          numeric(12, 2) not null default 0,
  is_income           boolean not null default false,
  account_nickname    text,
  account_number_hash text,
  source              text,
  is_installment      boolean not null default false,
  payment_number      integer,
  total_payments      integer,
  category_label      text,
  raw                 jsonb not null,
  unique (month, envelope_id, transaction_id)
);

create index if not exists riseup_envelope_actuals_lookup_idx
  on riseup_envelope_actuals (month, envelope_id);

alter table riseup_envelopes        enable row level security;
alter table riseup_envelope_actuals enable row level security;
