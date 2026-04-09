import { createClient } from '@/lib/supabase/server'
import { ChannelList } from './channel-list'
import { NewChannelButton } from './new-channel-button'
import { SignOutButton } from './sign-out-button'

export async function Sidebar({ currentUser }: { currentUser: { id: string; name: string } }) {
  const supabase = await createClient()
  // Two-step fetch to avoid PostgREST embed issues (no FK from user_id to public.user)
  // Step 1: get this user's memberships
  const { data: memberships } = await supabase
    .from('channel_members')
    .select('channel_id, last_read_at')
    .eq('user_id', currentUser.id)
    .order('joined_at')

  const membershipMap = new Map(
    (memberships ?? []).map((m) => [m.channel_id, m.last_read_at])
  )
  const channelIds = [...membershipMap.keys()]

  // Step 2: fetch channel details in one query
  const { data: channelRows } = channelIds.length
    ? await supabase.from('channels').select('id, name, type').in('id', channelIds)
    : { data: [] as Array<{ id: string; name: string; type: 'public' | 'private' }> }

  const baseChannels = (channelRows ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    type: c.type as 'public' | 'private',
    lastReadAt: membershipMap.get(c.id) ?? new Date().toISOString(),
  }))

  // Compute unread counts in parallel (one count query per channel)
  const unreadEntries = await Promise.all(
    baseChannels.map(async (c) => {
      const { count } = await supabase
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('channel_id', c.id)
        .gt('created_at', c.lastReadAt)
        .neq('author_id', currentUser.id)
      return [c.id, count ?? 0] as const
    })
  )
  const unreadMap = new Map(unreadEntries)
  const channels = baseChannels.map((c) => ({ ...c, unreadCount: unreadMap.get(c.id) ?? 0 }))

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-border bg-bg-lifted h-full">
      <div className="px-4 border-b border-border h-[60px] flex items-center">
        <div className="text-lg font-semibold text-white font-heading">Kochanet</div>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        <div className="flex items-center justify-between px-2 mb-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">
            Channels
          </span>
          <NewChannelButton />
        </div>
        <ChannelList channels={channels} />
      </div>

      <div className="border-t border-border px-3 py-3 h-[96px] flex items-center gap-3">
        <div className="h-8 w-8 shrink-0 rounded-full bg-surface grid place-items-center text-xs font-semibold text-accent">
          {currentUser.name.slice(0, 1).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm text-white font-medium truncate">{currentUser.name}</div>
          <div className="text-[10px] text-muted">Online</div>
        </div>
        <SignOutButton />
      </div>
    </aside>
  )
}
