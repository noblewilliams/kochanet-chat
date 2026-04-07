'use client'
import { useState } from 'react'
import type { MessageRow } from '@/lib/supabase/types'
import { Composer } from './composer'

type Member = { id: string; name: string }
type Channel = { id: string; name: string; type: 'public' | 'private' }

export function ChatView({
  channel,
  initialMessages,
  members,
  currentUser,
}: {
  channel: Channel
  initialMessages: MessageRow[]
  members: Member[]
  currentUser: { id: string; name: string }
}) {
  const [messages] = useState(initialMessages)
  const nameById = new Map(members.map((m) => [m.id, m.name]))

  return (
    <>
      <header className="flex items-center justify-between border-b border-border bg-bg-lifted px-5 py-3">
        <div>
          <h1 className="font-semibold text-white">
            <span className="text-muted">{channel.type === 'public' ? '#' : '🔒'}</span>{' '}
            {channel.name}
          </h1>
          <p className="text-xs text-muted">{members.length} member(s)</p>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-5 py-4">
        {messages.length === 0 ? (
          <p className="text-center text-muted">No messages yet. Say hi.</p>
        ) : (
          <ul className="space-y-3">
            {messages.map((m) => (
              <li key={m.id} className="flex gap-3">
                <div className="h-8 w-8 shrink-0 rounded-full bg-surface grid place-items-center text-xs font-semibold text-accent">
                  {m.author_kind === 'ai'
                    ? '✦'
                    : (nameById.get(m.author_id ?? '') ?? '?').slice(0, 1).toUpperCase()}
                </div>
                <div>
                  <div className="text-sm font-semibold text-white">
                    {m.author_kind === 'ai' ? 'ai' : nameById.get(m.author_id ?? '') ?? 'Unknown'}
                  </div>
                  <div className="text-sm text-accent">{m.body}</div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Composer channelId={channel.id} />
    </>
  )
}
