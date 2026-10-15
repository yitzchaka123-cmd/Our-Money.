-- Wallets and cash income (feedback video 2 item 12, video 4 item 8).
--
-- Only the `money` schema is touched, and every object is schema-qualified.
-- Two small additions: one nullable column, and one row per month at most.

-- ---------------------------------------------------------------------------
-- "איזו הכנסה זו?" for cash income (video 4, item 8)
--
-- RiseUp's three kinds of income: variable (the default, and what a null
-- means, so every existing row stays as it was), fixed (expected again next
-- month until it arrives), and not-cashflow (kept out of the forecast). The
-- category stays in the existing `category` column: משכורת, דיור, קצבאות, or
-- the couple's own name, which the app remembers by reading earlier rows.
-- ---------------------------------------------------------------------------

alter table money.cash_topups
  add column if not exists income_kind text
  check (income_kind in ('variable', 'fixed', 'non_cashflow'));

comment on column money.cash_topups.income_kind is
  'Cash income only: variable (null means the same), fixed, or non_cashflow (kept out of the forecast).';

-- ---------------------------------------------------------------------------
-- "צפוי להיכנס החודש" for the wallets (video 2, item 12)
--
-- The app predicts each month's cash in from the last three months; when the
-- couple corrects the guess for a month, their figure is kept here. One row
-- per month that was corrected, nothing else.
-- ---------------------------------------------------------------------------

create table if not exists money.cash_inflow_overrides (
  month       text           primary key check (month ~ '^\d{4}-\d{2}$'),
  amount_ils  numeric(12, 2) not null check (amount_ils >= 0),
  member_id   uuid           references money.household_members (id) on delete set null,
  updated_at  timestamptz    not null default now()
);
comment on table money.cash_inflow_overrides is
  'The couple''s own figure for how much cash comes into the wallets in a month, replacing the app''s guess.';

-- Server-only, like every table here: RLS with no policies, and no grants for
-- anyone but the service role (0002's default privileges already say so; this
-- says it again for this table).
alter table money.cash_inflow_overrides enable row level security;
revoke all on table money.cash_inflow_overrides from public, anon, authenticated;
grant all on table money.cash_inflow_overrides to service_role;
