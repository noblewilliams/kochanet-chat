import { createClient } from '@/lib/supabase/server'
import { ChannelList } from './channel-list'
import { NewChannelButton } from './new-channel-button'
import { SignOutButton } from './sign-out-button'

type Channel = {
  id: string
  name: string
  type: 'public' | 'private'
  lastReadAt: string
  unreadCount: number
}

async function loadChannels(currentUserId: string): Promise<Channel[]> {
  try {
    const supabase = await createClient()

    const { data: memberships } = await supabase
      .from('channel_members')
      .select('channel_id, last_read_at')
      .eq('user_id', currentUserId)
      .order('joined_at')

    const membershipMap = new Map(
      (memberships ?? []).map((m) => [m.channel_id, m.last_read_at])
    )
    const channelIds = [...membershipMap.keys()]
    if (channelIds.length === 0) return []

    const { data: channelRows } = await supabase
      .from('channels')
      .select('id, name, type')
      .in('id', channelIds)

    const baseChannels = (channelRows ?? []).map((c) => ({
      id: c.id,
      name: c.name,
      type: c.type as 'public' | 'private',
      lastReadAt: membershipMap.get(c.id) ?? new Date().toISOString(),
    }))

    // Compute unread counts
    const earliestReadAt = baseChannels.reduce(
      (min, c) => (c.lastReadAt < min ? c.lastReadAt : min),
      baseChannels[0]?.lastReadAt ?? new Date().toISOString()
    )
    const { data: unreadRows } = await supabase
      .from('messages')
      .select('channel_id, created_at')
      .in('channel_id', channelIds)
      .gt('created_at', earliestReadAt)
      .neq('author_id', currentUserId)

    const unreadMap = new Map<string, number>()
    for (const c of baseChannels) {
      const count = (unreadRows ?? []).filter(
        (r: { channel_id: string; created_at: string }) =>
          r.channel_id === c.id && r.created_at > c.lastReadAt
      ).length
      unreadMap.set(c.id, count)
    }

    return baseChannels.map((c) => ({ ...c, unreadCount: unreadMap.get(c.id) ?? 0 }))
  } catch (err) {
    console.error('Sidebar: failed to load channels:', err)
    return []
  }
}

export async function Sidebar({ currentUser }: { currentUser: { id: string; name: string } }) {
  const channels = await loadChannels(currentUser.id)

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
