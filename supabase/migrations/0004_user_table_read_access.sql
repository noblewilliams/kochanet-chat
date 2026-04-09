-- The "user" table (BetterAuth) is queried by:
--   1. The user-scoped Supabase client (authenticated role) to resolve member names
--   2. BetterAuth's pg Pool (postgres role) for session validation
--
-- The policy must allow ALL roles, not just "authenticated", because the
-- postgres role on Supabase is NOT a superuser and does NOT bypass RLS.
-- Restricting to "authenticated" causes BetterAuth's getSession() to fail
-- with 42501 (insufficient_privilege) when it queries the user table.

alter table "user" enable row level security;

create policy user_select_all on "user" for select
  using (true);
