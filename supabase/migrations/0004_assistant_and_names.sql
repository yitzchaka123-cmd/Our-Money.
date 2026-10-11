-- 0004: what each member wants to be called, and the assistant's chats.
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

-- ---------------------------------------------------------------------------
-- The assistant's chats. Each member sees only their own; the app keeps the
-- 20 most recent per member and deletes older ones. Text only: questions and
-- answers, no data dumps.
-- ---------------------------------------------------------------------------

create table if not exists money.assistant_chats (
  id          uuid primary key default gen_random_uuid(),
  member_id   uuid        not null references money.household_members (id) on delete cascade,
  -- The first question, on one line.
  title       text        not null check (char_length(title) between 1 and 80),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists assistant_chats_member_idx on money.assistant_chats (member_id, updated_at desc);

create table if not exists money.assistant_messages (
  id          bigint generated always as identity primary key,
  chat_id     uuid        not null references money.assistant_chats (id) on delete cascade,
  role        text        not null check (role in ('user', 'assistant')),
  content     text        not null check (char_length(content) between 1 and 8000),
  created_at  timestamptz not null default now()
);
create index if not exists assistant_messages_chat_idx on money.assistant_messages (chat_id, id);

alter table money.assistant_chats    enable row level security;
alter table money.assistant_messages enable row level security;

-- Server-only, as 0002 locks every table: nobody but the service role.
revoke all on money.assistant_chats    from public, anon, authenticated;
revoke all on money.assistant_messages from public, anon, authenticated;
revoke all on sequence money.assistant_messages_id_seq from public, anon, authenticated;
grant all on money.assistant_chats    to service_role;
grant all on money.assistant_messages to service_role;
grant all on sequence money.assistant_messages_id_seq to service_role;
