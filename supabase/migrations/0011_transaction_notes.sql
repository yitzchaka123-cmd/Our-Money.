-- Our own notes on RiseUp charges (feedback video 2, item 16): "דל פסטו" was
-- the schnitzel from last night. RiseUp's API is read-only, so the note lives
-- here, on our side, and is laid over the charge wherever it is shown and
-- searched. RiseUp itself is never changed, and the app says so.
--
-- One note per charge: a charge keeps its transaction id from month to month
-- (installments too), so the note follows it. `month` is the cashflow month it
-- was written in, kept for reference.

create table money.transaction_notes (
  transaction_id  text        primary key check (length(transaction_id) between 1 and 200),
  month           text        not null check (month ~ '^\d{4}-\d{2}$'),
  note            text        not null check (length(note) between 1 and 300),
  updated_by      uuid        references money.household_members (id) on delete set null,
  updated_at      timestamptz not null default now()
);
comment on table money.transaction_notes is
  'Our notes on RiseUp charges (RiseUp is read-only). Tiny: one short row per note.';

alter table money.transaction_notes enable row level security;

-- Server-only, like everything else in money (see 0002).
revoke all on money.transaction_notes from public, anon, authenticated;
grant all on money.transaction_notes to service_role;
