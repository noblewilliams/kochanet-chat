import { createClient } from '@/lib/supabase/server'
import { ChannelList } from './channel-list'
import { NewChannelButton } from './new-channel-button'
import { SignOutButton } from './sign-out-button'

export async function Sidebar({ currentUser }: { currentUser: { id: string; name: string } }) {
  const supabase = await createClient()
  const { data: memberships } = await supabase
    .from('channel_members')
    .select('channel_id, last_read_at, channels(id, name, type)')
    .order('joined_at')

  const baseChannels = (memberships ?? []).map((m) => ({
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
      <div className="p-4 border-b border-border">
        <div className="text-xs uppercase tracking-wide text-muted">Workspace</div>
        <div className="mt-1 font-semibold text-white font-heading">Kochanet</div>
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

      <div className="border-t border-border px-3 py-3">
        <div className="text-xs text-muted">Signed in as</div>
        <div className="text-sm text-accent truncate">{currentUser.name}</div>
        <SignOutButton className="mt-2" />
      </div>
    </aside>
  )
}
