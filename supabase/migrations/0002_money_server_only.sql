-- Server-only. The `money` schema is reachable by the service role — the key
-- the server holds — and by nobody else: not anon, not authenticated, not
-- PUBLIC. Row level security (0001) already stops other roles at every row;
-- this stops them at the schema door, so they cannot even see the tables.
--
-- Only `money` is touched. Nothing here changes global default privileges,
-- which would reach into the other apps' schemas.

revoke all on schema money from public, anon, authenticated;
grant usage on schema money to service_role;

revoke all on all tables    in schema money from public, anon, authenticated;
revoke all on all sequences in schema money from public, anon, authenticated;
revoke all on all functions in schema money from public, anon, authenticated;

grant all     on all tables    in schema money to service_role;
grant all     on all sequences in schema money to service_role;
grant execute on all functions in schema money to service_role;

-- Objects added by later migrations (created by the same role) start out the
-- same way.
alter default privileges in schema money revoke all on tables    from public, anon, authenticated;
alter default privileges in schema money revoke all on sequences from public, anon, authenticated;
alter default privileges in schema money revoke all on functions from anon, authenticated;
alter default privileges in schema money grant all     on tables    to service_role;
alter default privileges in schema money grant all     on sequences to service_role;
alter default privileges in schema money grant execute on functions to service_role;

-- Postgres grants EXECUTE on every new function to PUBLIC globally, and a
-- per-schema rule cannot take that back. Without USAGE on the schema nobody
-- but the service role can reach a function anyway, but a later migration
-- that adds one should still say:
--   revoke execute on function money.<name>(...) from public;
-- The lockdown test checks every function in the schema.
