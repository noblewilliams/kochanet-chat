'use client'
import { Fragment, useEffect, useRef } from 'react'
import type { MessageRow } from '@/lib/supabase/types'
import { useMessages } from '@/lib/realtime/use-messages'
import { useTyping } from '@/lib/realtime/use-typing'
import { useConnectionState } from '@/lib/realtime/use-connection-state'
import { Composer } from './composer'
import { AIThinking } from './ai-thinking'
import { AIMessageBody } from './ai-message-body'
import { ChannelSearch } from './channel-search'
import { InviteButton } from './invite-button'
import { EmptyChannel } from './empty-channel'
import { TypingIndicator } from '@/components/presence/typing-indicator'
import { PresenceBar } from '@/components/presence/presence-bar'

type Member = { id: string; name: string }
type Channel = { id: string; name: string; type: 'public' | 'private' }

export function ChatView({
  channel,
  initialMessages,
  priorLastReadAt,
  members,
  currentUser,
}: {
  channel: Channel
  initialMessages: MessageRow[]
  priorLastReadAt: string
  members: Member[]
  currentUser: { id: string; name: string }
}) {
  const { messages, addOptimistic, markOptimisticFailed } = useMessages(
    channel.id,
    initialMessages
  )
  const { typers, notifyTyping } = useTyping(channel.id, {
    userId: currentUser.id,
    name: currentUser.name,
  })
  const connStatus = useConnectionState()

  const nameById = new Map(members.map((m) => [m.id, m.name]))

  const scrollRef = useRef<HTMLDivElement>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const stickToBottomRef = useRef(true)

  function onScroll() {
    const el = scrollRef.current
    if (!el) return
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120
    stickToBottomRef.current = nearBottom
  }

  useEffect(() => {
    if (stickToBottomRef.current) {
      endRef.current?.scrollIntoView({ block: 'end' })
    }
  }, [messages.length, messages.at(-1)?.body])

  return (
    <>
      <header className="flex items-center justify-between border-b border-border bg-bg-lifted px-5 md:pl-5 pl-14 h-[60px]">
        <div>
          <h1 className="font-semibold text-white font-heading">
            <span className="text-muted">{channel.type === 'public' ? '#' : '🔒'}</span>{' '}
            {channel.name}
          </h1>
          <PresenceBar
            channelId={channel.id}
            me={{ userId: currentUser.id, name: currentUser.name }}
          />
        </div>
        <div className="flex items-center gap-2">
          <ChannelSearch channelId={channel.id} />
          <InviteButton channelId={channel.id} />
        </div>
      </header>

      <div
        ref={scrollRef}
        onScroll={onScroll}
        className={`flex-1 overflow-y-auto px-5 py-4 ${messages.length === 0 ? 'flex flex-col' : ''}`}
        aria-live="polite"
        aria-label="Messages"
      >
        {messages.length === 0 ? (
          <EmptyChannel channelName={channel.name} />
        ) : (
          <ul className="space-y-3">
            {messages.map((m, i) => {
              const showDivider =
                priorLastReadAt &&
                m.created_at > priorLastReadAt &&
                (i === 0 || messages[i - 1].created_at <= priorLastReadAt) &&
                m.author_id !== currentUser.id
              return (
                <Fragment key={m.id}>
                  {showDivider && (
                    <li className="flex items-center gap-3 py-2" aria-label="New messages">
                      <div className="flex-1 h-px bg-accent/40" />
                      <span className="text-[10px] uppercase tracking-wider text-accent">
                        New messages
                      </span>
                      <div className="flex-1 h-px bg-accent/40" />
                    </li>
                  )}
                  <li className="flex gap-3">
                    {m.author_kind === 'ai' ? (
                      <div className="h-8 w-8 shrink-0 rounded-full bg-gradient-to-br from-accent to-accent-deep grid place-items-center text-bg font-bold">
                        ✦
                      </div>
                    ) : (
                      <div className="h-8 w-8 shrink-0 rounded-full bg-surface grid place-items-center text-xs font-semibold text-accent">
                        {(nameById.get(m.author_id ?? '') ?? '?').slice(0, 1).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <span className="text-sm font-semibold text-white">
                          {m.author_kind === 'ai'
                            ? 'ai'
                            : nameById.get(m.author_id ?? '') ?? 'Unknown'}
                        </span>
                        <span className="text-[10px] text-muted">
                          {new Date(m.created_at).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                        {m._optimistic === 'sending' && (
                          <span className="text-[10px] text-muted">sending…</span>
                        )}
                        {m._optimistic === 'failed' && (
                          <span className="text-[10px] text-warning">failed</span>
                        )}
                      </div>
                      {m.author_kind === 'ai' ? (
                        m.ai_status === 'streaming' && m.body === '' ? (
                          <AIThinking messageId={m.id} />
                        ) : (
                          <AIMessageBody
                            body={m.body}
                            isStreaming={m.ai_status === 'streaming'}
                          />
                        )
                      ) : (
                        <div className="mt-0.5 text-sm text-accent whitespace-pre-wrap break-words">
                          {m.body}
                        </div>
                      )}
                    </div>
                  </li>
                </Fragment>
              )
            })}
          </ul>
        )}
        <div ref={endRef} />
      </div>

      <TypingIndicator typers={typers} />
      <Composer
        channelId={channel.id}
        members={members}
        connStatus={connStatus}
        onOptimisticSend={(o) => addOptimistic({ ...o, authorId: currentUser.id })}
        onOptimisticFail={markOptimisticFailed}
        onTyping={notifyTyping}
      />
    </>
  )
}
