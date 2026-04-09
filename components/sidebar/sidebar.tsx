import { createClient } from '@/lib/supabase/server'
import { ChannelList } from './channel-list'
import { NewChannelButton } from './new-channel-button'
import { SignOutButton } from './sign-out-button'

export async function Sidebar({ currentUser }: { currentUser: { id: string; name: string } }) {
  const supabase = await createClient()
  const { data: memberships } = await supabase
    .from('channel_members')
    .select('channel_id, last_read_at, channels(id, name, type)')
    .eq('user_id', currentUser.id)
    .order('joined_at')

  // Deduplicate by channel_id (safety net — RLS should already filter to one row per channel)
  const seen = new Set<string>()
  const baseChannels = (memberships ?? [])
    .filter((m) => {
      if (seen.has(m.channel_id)) return false
      seen.add(m.channel_id)
      return true
    })
    .map((m) => ({
      id: m.channel_id,
      name: (m.channels as unknown as { name: string }).name,
      type: (m.channels as unknown as { type: 'public' | 'private' }).type,
      lastReadAt: m.last_read_at,
    }))

  // Compute unread counts in parallel (one count query per channel)
  const unreadEntries = await Promise.all(
    baseChannels.map(async (c) => {
      const { count } = await supabase
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('channel_id', c.id)
        .gt('created_at', c.lastReadAt)
      return [c.id, count ?? 0] as const
    })
  )
  const unreadMap = new Map(unreadEntries)
  const channels = baseChannels.map((c) => ({ ...c, unreadCount: unreadMap.get(c.id) ?? 0 }))

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-border bg-bg-lifted h-full">
      <div className="px-4 border-b border-border h-[60px] flex flex-col justify-center">
        <div className="text-xs uppercase tracking-wide text-muted">Workspace</div>
        <div className="mt-0.5 font-semibold text-white font-heading">Kochanet</div>
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
