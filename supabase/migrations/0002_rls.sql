-- ============================================================================
-- Row Level Security policies
-- ============================================================================
-- Enable RLS on app tables. BetterAuth tables (user/session/account/verification)
-- stay un-RLS'd because the browser never queries them — only the BetterAuth
-- server-side API does, and that uses the unrestricted DB connection.

alter table channels        enable row level security;
alter table channel_members enable row level security;
alter table messages        enable row level security;

-- ----------------------------------------------------------------------------
-- Helper: extract our custom claim from the JWT
-- BetterAuth user IDs are text (cuid/nanoid), so we return text not uuid.
-- ----------------------------------------------------------------------------
create or replace function app_user_id() returns text
language sql stable as $$
  select nullif(
    current_setting('request.jwt.claims', true)::jsonb ->> 'app_user_id',
    ''
  )
$$;

-- ----------------------------------------------------------------------------
-- channel_members: each user manages only their own membership rows
-- ----------------------------------------------------------------------------
create policy cm_select_own on channel_members for select
  using (user_id = app_user_id());

create policy cm_insert_self on channel_members for insert
  with check (user_id = app_user_id());

create policy cm_delete_self on channel_members for delete
  using (user_id = app_user_id());

create policy cm_update_own on channel_members for update
  using (user_id = app_user_id())
  with check (user_id = app_user_id());

-- ----------------------------------------------------------------------------
-- channels: any authenticated user can see public channels (for discovery);
-- private channels require an active membership row.
-- ----------------------------------------------------------------------------
create policy channels_select_member on channels for select using (
  type = 'public'
  or exists (
    select 1 from channel_members
    where channel_members.channel_id = channels.id
      and channel_members.user_id = app_user_id()
  )
);

create policy channels_insert_authenticated on channels for insert
  with check (created_by = app_user_id());

-- ----------------------------------------------------------------------------
-- messages: readable by channel members, insertable only as self + as 'user' kind.
-- AI message inserts come from the service-role client and bypass RLS entirely.
-- ----------------------------------------------------------------------------
create policy messages_select_member on messages for select using (
  exists (
    select 1 from channel_members
    where channel_members.channel_id = messages.channel_id
      and channel_members.user_id = app_user_id()
  )
);

create policy messages_insert_member on messages for insert with check (
  author_kind = 'user'
  and author_id = app_user_id()
  and exists (
    select 1 from channel_members
    where channel_members.channel_id = messages.channel_id
      and channel_members.user_id = app_user_id()
  )
);

-- No UPDATE or DELETE policy on messages: browser-initiated mutations are denied.
-- The AI streaming continuation updates messages via the service-role client only.

-- ----------------------------------------------------------------------------
-- Enable Realtime broadcast on the messages table so Postgres Changes events
-- get delivered to subscribed clients (with RLS filtering).
-- ----------------------------------------------------------------------------
alter publication supabase_realtime add table messages;
