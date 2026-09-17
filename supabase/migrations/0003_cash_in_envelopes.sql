-- Cash moves INTO RiseUp's envelopes.
--
-- A cash spend is attached to the RiseUp envelope it belongs to (a tracking
-- category, or the variable / fixed envelope) so it shows in the same card and
-- the same breakdown row as a card spend would. Cash received is a top-up of
-- the wallet with its own category, and gets its own income envelope.

alter table cash_spends
  add column if not exists envelope_id   text,
  add column if not exists envelope_type text;

create index if not exists cash_spends_envelope_idx
  on cash_spends (envelope_id) where status <> 'deleted';

comment on column cash_spends.envelope_id is
  'RiseUp envelope this spend is attached to. Null falls back to the month''s variable envelope, which is RiseUp''s own default for an uncategorised charge.';

-- Cash income is a wallet top-up like a withdrawal is, just with a source of
-- its own — so the wallet arithmetic stays "all top-ups minus all spends".
alter table cash_topups drop constraint if exists cash_topups_source_check;
alter table cash_topups
  add constraint cash_topups_source_check
    check (source in ('riseup_withdrawal', 'manual', 'cash_income'));

alter table cash_topups
  add column if not exists member_id uuid references household_members (id),
  add column if not exists category  text,
  add column if not exists input_kind text default 'text'
    check (input_kind in ('text', 'voice', 'web')),
  add column if not exists updated_at timestamptz not null default now();

alter table cash_spends
  drop constraint if exists cash_spends_input_kind_check;
alter table cash_spends
  add constraint cash_spends_input_kind_check
    check (input_kind in ('text', 'voice', 'web'));
