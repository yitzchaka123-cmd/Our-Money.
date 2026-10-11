-- Our own changes to RiseUp's tracking categories and expected income.
--
-- RiseUp's API is read-only, so "change the target", "rename", "stop
-- tracking" and "track a new category" are kept here, on our side, and laid
-- over RiseUp's numbers when the dashboard is built. RiseUp itself is never
-- changed, and the dashboard says so.
--
-- tracker_key:
--   * a RiseUp tracker: the stable part of its envelope id — the third `#`
--     part, e.g. 'v2-default-il-expense-category-13' (the id itself changes
--     every month, the key does not);
--   * a tracker we added: 'custom:<category label>';
--   * expected income: 'income'.
-- month: '' applies to every month; 'YYYY-MM' applies to that month only and
--   wins over the '' row (RiseUp's "keep this target for October only").

create table money.tracker_overrides (
  tracker_key     text           not null check (length(tracker_key) between 1 and 200),
  month           text           not null default '' check (month = '' or month ~ '^\d{4}-\d{2}$'),
  name            text check (name is null or length(name) between 1 and 60),
  target_ils      numeric(12, 2) check (target_ils is null or target_ils >= 0),
  hidden          boolean        not null default false,
  -- A tracker we added: the category label whose spending it collects.
  category_label  text check (category_label is null or length(category_label) between 1 and 80),
  updated_by      uuid references money.household_members (id) on delete set null,
  updated_at      timestamptz    not null default now(),
  primary key (tracker_key, month)
);
comment on table money.tracker_overrides is
  'Our overrides of RiseUp trackers and expected income (RiseUp is read-only). Tiny: one row per change.';

alter table money.tracker_overrides enable row level security;

-- Server-only, like everything else in money (see 0002).
revoke all on money.tracker_overrides from public, anon, authenticated;
grant all on money.tracker_overrides to service_role;
