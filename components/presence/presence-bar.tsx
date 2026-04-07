'use client'
import { usePresence } from '@/lib/realtime/use-presence'

export function PresenceBar({
  channelId,
  me,
}: {
  channelId: string
  me: { userId: string; name: string }
}) {
  const online = usePresence(channelId, me)
  return (
    <span className="text-xs text-muted" aria-live="polite">
      {online.length} online
    </span>
  )
}
