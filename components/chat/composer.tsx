'use client'
import { useState, useRef, useTransition } from 'react'
import { sendMessage } from '@/server/messages'
import type { ConnectionStatus } from '@/lib/realtime/use-connection-state'

const STATUS_LABEL: Record<ConnectionStatus, { text: string; color: string }> = {
  connecting: { text: 'connecting', color: 'text-warning' },
  connected: { text: 'connected', color: 'text-success' },
  reconnecting: { text: 'reconnecting', color: 'text-warning' },
  offline: { text: 'offline', color: 'text-warning' },
}

export function Composer({
  channelId,
  connStatus = 'connected',
  onOptimisticSend,
  onOptimisticFail,
  onTyping,
}: {
  channelId: string
  connStatus?: ConnectionStatus
  onOptimisticSend?: (opts: { clientId: string; body: string }) => void
  onOptimisticFail?: (clientId: string) => void
  onTyping?: () => void
}) {
  const [value, setValue] = useState('')
  const [pending, start] = useTransition()
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const statusLabel = STATUS_LABEL[connStatus]

  function handleSend() {
    const body = value.trim()
    if (!body || pending) return

    const clientId = crypto.randomUUID()
    onOptimisticSend?.({ clientId, body })
    setValue('')
    textareaRef.current?.focus()

    start(async () => {
      try {
        await sendMessage({ channelId, body, clientId })
      } catch (err) {
        console.error('sendMessage failed', err)
        const name = (err as Error).name
        if (name === 'RateLimitError') {
          alert("You're invoking the AI too often. Wait a minute and try again.")
        }
        onOptimisticFail?.(clientId)
      }
    })
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="border-t border-border bg-bg p-4">
      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => {
            setValue(e.target.value)
            onTyping?.()
          }}
          onKeyDown={onKeyDown}
          rows={1}
          placeholder="Message…"
          aria-label="Message input"
          className="flex-1 resize-none rounded-lg border border-border bg-surface px-4 py-3 text-white placeholder:text-muted focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent/20"
        />
        <button
          type="button"
          aria-label="Voice input (coming in Phase 12)"
          disabled
          className="grid h-[42px] w-[42px] place-items-center rounded-lg bg-accent text-bg disabled:opacity-60"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="2" width="6" height="12" rx="3" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" y1="19" x2="12" y2="23" />
            <line x1="8" y1="23" x2="16" y2="23" />
          </svg>
        </button>
        <button
          type="button"
          onClick={handleSend}
          disabled={!value.trim() || pending}
          aria-label="Send message"
          className="grid h-[42px] w-[42px] place-items-center rounded-lg bg-accent text-bg disabled:opacity-60"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="5" y1="12" x2="19" y2="12" />
            <polyline points="12 5 19 12 12 19" />
          </svg>
        </button>
      </div>
      <div className="mt-2 flex justify-between text-[10px] text-muted">
        <span>
          <kbd className="text-accent">↵</kbd> send · <kbd className="text-accent">shift+↵</kbd> newline
        </span>
        <span className={statusLabel.color} aria-live="polite">
          ● {statusLabel.text}
        </span>
      </div>
    </div>
  )
}
