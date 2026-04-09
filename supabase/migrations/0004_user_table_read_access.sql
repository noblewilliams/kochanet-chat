-- The "user" table (BetterAuth) is queried by the user-scoped Supabase client
-- to resolve member names. Ensure the authenticated role can read it.

alter table "user" enable row level security;

create policy user_select_authenticated on "user" for select
  to authenticated
  using (true);
