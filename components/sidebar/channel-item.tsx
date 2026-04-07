type Channel = { id: string; name: string; type: 'public' | 'private' }

export function ChannelItem({
  channel,
  isActive,
  unreadCount = 0,
}: {
  channel: Channel
  isActive: boolean
  unreadCount?: number
}) {
  return (
    <div
      className={`flex items-center justify-between rounded px-2 py-1.5 text-sm ${
        isActive ? 'bg-hover text-white' : 'text-accent hover:bg-hover/60'
      }`}
    >
      <span className="truncate">
        <span className="text-muted">{channel.type === 'public' ? '#' : '🔒'}</span>{' '}
        {channel.name}
      </span>
      {unreadCount > 0 && (
        <span className="ml-2 rounded-full bg-warning px-1.5 text-[10px] font-semibold text-bg">
          {unreadCount}
        </span>
      )}
    </div>
  )
}
