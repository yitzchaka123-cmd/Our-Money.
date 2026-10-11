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
