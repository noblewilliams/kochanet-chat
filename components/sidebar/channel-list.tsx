'use client'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { ChannelItem } from './channel-item'

type Channel = {
  id: string
  name: string
  type: 'public' | 'private'
  lastReadAt: string
  unreadCount: number
}

export function ChannelList({ channels }: { channels: Channel[] }) {
  const params = useParams<{ channelId?: string }>()
  const active = params?.channelId

  if (channels.length === 0) {
    return <p className="px-2 text-xs text-muted">No channels yet. Create one.</p>
  }

  return (
    <ul className="space-y-0.5">
      {channels.map((c) => (
        <li key={c.id}>
          <Link href={`/c/${c.id}`}>
            <ChannelItem channel={c} isActive={active === c.id} unreadCount={c.unreadCount} />
          </Link>
        </li>
      ))}
    </ul>
  )
}
