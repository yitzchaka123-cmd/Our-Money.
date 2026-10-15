-- The daily brief setting and "seen" insight cards (feedback video 2, items 9
-- and 17; video 4, item 10).
--
-- Small and inside `money`: one flag per member, two timestamps per card a
-- member has been shown.

-- ---------------------------------------------------------------------------
-- Settings → "הסיכום היומי": a member can turn the daily brief off (the blob,
-- the deck and the drawer's link). On by default.
-- ---------------------------------------------------------------------------

alter table money.household_members
  add column if not exists show_daily_brief boolean not null default true;

comment on column money.household_members.show_daily_brief is
  'Settings: show the daily brief (blob and swipe cards). Default on.';
