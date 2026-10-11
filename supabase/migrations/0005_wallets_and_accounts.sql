-- Wallets and accounts (feedback video 1).
--
-- Only the `money` schema is touched, and every object is schema-qualified.

-- ---------------------------------------------------------------------------
-- "Set the amount in this wallet now" (item 4)
--
-- Saying "there is 700 in this wallet" must not rewrite history. The
-- difference between what the ledger says and what is really there is stored
-- as its own row: a cash_topups row with source 'adjustment', whose amount is
-- signed (negative when there is less cash than the ledger thought). Every
-- balance already sums cash_topups per wallet, so the adjustment counts
-- everywhere at once, and dismissing it undoes it.
-- ---------------------------------------------------------------------------

alter table money.cash_topups drop constraint if exists cash_topups_source_check;
alter table money.cash_topups
  add constraint cash_topups_source_check
  check (source in ('riseup_withdrawal', 'manual', 'cash_income', 'adjustment'));

alter table money.cash_topups drop constraint if exists cash_topups_amount_ils_check;
alter table money.cash_topups
  add constraint cash_topups_amount_ils_check
  check (amount_ils > 0 or (source = 'adjustment' and amount_ils <> 0));

-- ---------------------------------------------------------------------------
-- Names for cards and bank accounts (item 7)
--
-- RiseUp's API never sends a card or account number: only a short opaque code
-- per account (accountNumberHash, e.g. "cc5910") and the provider (source,
-- e.g. "leumicard"). The couple names each account once ("כרטיס 0848"); the
-- name is ours and shows everywhere that account appears. One row per
-- account, a few dozen at most.
-- ---------------------------------------------------------------------------

create table if not exists money.account_labels (
  source               text        not null,
  account_number_hash  text        not null,
  label                text        not null check (length(btrim(label)) between 1 and 40),
  updated_at           timestamptz not null default now(),
  primary key (source, account_number_hash)
);
comment on table money.account_labels is
  'The couple''s own name for a RiseUp card or bank account, keyed by provider and RiseUp''s opaque account code.';

-- Server-only, like every table here: RLS with no policies, and 0002's default
-- privileges already keep anon and authenticated out of new tables.
alter table money.account_labels enable row level security;
