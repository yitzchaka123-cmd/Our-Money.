-- 0004: what each member wants to be called.
--
-- Only the `money` schema is touched. Not applied by the helper that wrote
-- it; the lead applies it.

-- ---------------------------------------------------------------------------
-- The greeting's name. The Telegram account's display name is often not the
-- person's name, so the greeting uses this and, while it is null, says just
-- "היי".
-- ---------------------------------------------------------------------------

alter table money.household_members
  add column if not exists preferred_name text
    check (preferred_name is null or char_length(preferred_name) between 1 and 40);

comment on column money.household_members.preferred_name is
  'What the member asked to be called. Null: greet with just "היי", never the Telegram name.';
