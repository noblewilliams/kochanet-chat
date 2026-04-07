'use client'
import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { joinChannel } from '@/server/channels'

export function JoinChannelPrompt({
  channel,
}: {
  channel: { id: string; name: string; type: 'public' | 'private' }
}) {
  const [pending, start] = useTransition()
  const router = useRouter()

  function onJoin() {
    start(async () => {
      await joinChannel(channel.id)
      router.refresh()
    })
  }

  return (
    <div className="grid h-full place-items-center">
      <div className="max-w-sm rounded-xl border border-border bg-surface p-6 text-center">
        <h2 className="text-lg font-semibold text-white">Join #{channel.name}?</h2>
        <p className="mt-1 text-sm text-muted">
          This is a public channel. Join to read and send messages.
        </p>
        <button
          onClick={onJoin}
          disabled={pending}
          className="mt-4 rounded-lg bg-accent px-4 py-2 font-semibold text-bg disabled:opacity-60"
        >
          {pending ? 'Joining…' : 'Join'}
        </button>
      </div>
    </div>
  )
}
