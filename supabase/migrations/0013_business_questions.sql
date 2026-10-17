-- "מה קניתם כאן?" (C26): after a sync, the bot asks once about a charge at a
-- business that never appeared before, and keeps the answer as our own note
-- on the charge (money.transaction_notes, 0011). RiseUp is never changed.
--
-- One short row per charge asked about, so it is never asked twice. The
-- question's Telegram messages ("chat id:message id", one per chat it went
-- to) let a reply find its charge. Tiny and inside `money`.

create table money.business_questions (
  transaction_id  text        primary key check (length(transaction_id) between 1 and 200),
  business_name   text        check (business_name is null or char_length(business_name) <= 200),
  -- asking: claimed, being sent; asked: waiting for an answer; answered / skipped: done.
  status          text        not null default 'asking' check (status in ('asking', 'asked', 'answered', 'skipped')),
  messages        text[]      not null default '{}' check (cardinality(messages) <= 10),
  asked_at        timestamptz not null default now(),
  answered_by     uuid        references money.household_members (id) on delete set null,
  answered_at     timestamptz
);
comment on table money.business_questions is
  'The bot asked "what did you buy here?" about these RiseUp charges (once each). Tiny: one short row per question.';

alter table money.business_questions enable row level security;

-- Server-only, like everything else in money (see 0002).
revoke all on money.business_questions from public, anon, authenticated;
grant all on money.business_questions to service_role;
