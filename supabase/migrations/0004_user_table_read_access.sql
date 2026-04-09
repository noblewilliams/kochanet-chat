-- BetterAuth tables (user, session, account, verification) must NOT have RLS.
--
-- BetterAuth's pg Pool connects as the "postgres" role, which on Supabase
-- is NOT a superuser and does NOT bypass RLS. If RLS is enabled on these
-- tables without a permissive policy for postgres, BetterAuth's getSession()
-- and signUp() calls fail with 42501 (insufficient_privilege).
--
-- These tables were created by @better-auth/cli in 0001_init.sql. Supabase
-- may auto-enable RLS on new public tables in some configurations — this
-- migration explicitly disables it to be safe.

alter table "user"         disable row level security;
alter table "session"      disable row level security;
alter table "account"      disable row level security;
alter table "verification" disable row level security;
