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

-- ---------------------------------------------------------------------------
-- Insight and tip cards are shown once: on the day a card first appears
-- (`seen_at`), and never again after it was opened (`opened_at`), answered or
-- dismissed. A card only returns under a new key, when its numbers moved.
-- ---------------------------------------------------------------------------

alter table money.insight_feedback
  add column if not exists seen_at timestamptz,
  add column if not exists opened_at timestamptz;

comment on column money.insight_feedback.seen_at is
  'When this card was first shown to the member; it is not shown on a later day.';
comment on column money.insight_feedback.opened_at is
  'When the member opened the card ("לפרטים נוספים"); an opened card never comes back.';
