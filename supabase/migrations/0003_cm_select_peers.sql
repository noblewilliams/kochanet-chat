-- Allow users to see all members of channels they belong to.
-- The original cm_select_own policy only allowed seeing your own row,
-- which meant other members' names couldn't be resolved in the UI.

-- Helper bypasses RLS (SECURITY DEFINER) to avoid self-referential policy issues
create or replace function is_channel_member(p_channel_id uuid, p_user_id text)
returns boolean
language sql stable security definer as $$
  select exists (
    select 1 from channel_members
    where channel_id = p_channel_id
      and user_id = p_user_id
  )
$$;

drop policy cm_select_own on channel_members;

create policy cm_select_peers on channel_members for select using (
  is_channel_member(channel_id, app_user_id())
);
