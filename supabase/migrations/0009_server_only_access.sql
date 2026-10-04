-- Server-only, belt and braces. Row level security (enabled on every table,
-- with no policies) already stops the public API roles from reading or
-- writing rows. This also takes away their table privileges, so even a leaked
-- publishable key cannot see that the tables exist. Only the service role —
-- the key the server holds — keeps access.
revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated;

-- Tables added by later migrations start out locked the same way.
alter default privileges in schema public revoke all on tables    from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated;
