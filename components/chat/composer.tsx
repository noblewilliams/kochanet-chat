'use client'
import { useState, useRef, useTransition } from 'react'
import { sendMessage } from '@/server/messages'
import type { ConnectionStatus } from '@/lib/realtime/use-connection-state'
import { MentionAutocomplete } from './mention-autocomplete'

const STATUS_LABEL: Record<ConnectionStatus, { text: string; color: string }> = {
  connecting: { text: 'connecting', color: 'text-warning' },
  connected: { text: 'connected', color: 'text-success' },
  reconnecting: { text: 'reconnecting', color: 'text-warning' },
  offline: { text: 'offline', color: 'text-warning' },
}

type SpeechRecognitionLike = {
  continuous: boolean
  interimResults: boolean
  lang: string
  onresult: ((event: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null
  onerror: (() => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
}

export function Composer({
  channelId,
  members = [],
  connStatus = 'connected',
  onOptimisticSend,
  onOptimisticFail,
  onTyping,
}: {
  channelId: string
  members?: { id: string; name: string }[]
  connStatus?: ConnectionStatus
  onOptimisticSend?: (opts: { clientId: string; body: string }) => void
  onOptimisticFail?: (clientId: string) => void
  onTyping?: () => void
}) {
  const [value, setValue] = useState('')
  const [pending, start] = useTransition()
  const [mentionQuery, setMentionQuery] = useState<string | null>(null)
  const [recording, setRecording] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const statusLabel = STATUS_LABEL[connStatus]

  function computeMention(text: string, caret: number): string | null {
    const slice = text.slice(0, caret)
    const match = slice.match(/(?:^|\s)@([\w.]*)$/)
    return match ? match[1] : null
  }

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const v = e.target.value
    setValue(v)
    onTyping?.()
    const caret = e.target.selectionStart ?? v.length
    setMentionQuery(computeMention(v, caret))
  }

  function insertMention(handle: string) {
    const ta = textareaRef.current
    if (!ta) return
    const caret = ta.selectionStart ?? value.length
    const before = value.slice(0, caret)
    const after = value.slice(caret)
    const replaced = before.replace(/@([\w.]*)$/, `@${handle} `)
    const newValue = replaced + after
    setValue(newValue)
    setMentionQuery(null)
    requestAnimationFrame(() => {
      ta.focus()
      const pos = replaced.length
      ta.setSelectionRange(pos, pos)
    })
  }

  function handleSend() {
    const body = value.trim()
    if (!body || pending) return

    const clientId = crypto.randomUUID()
    onOptimisticSend?.({ clientId, body })
    setValue('')
    setMentionQuery(null)
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
    if (mentionQuery !== null) return // popover handles keys
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  function startVoiceInput() {
    const w = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionLike
      webkitSpeechRecognition?: new () => SpeechRecognitionLike
    }
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition
    if (!SR) {
      alert('Voice input is not supported in this browser. Try Chrome, Edge, or Safari.')
      return
    }
    const rec = new SR()
    rec.continuous = false
    rec.interimResults = true
    rec.lang = 'en-US'

    let finalTranscript = ''
    rec.onresult = (event) => {
      let interim = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i]
        if (res.isFinal) finalTranscript += res[0].transcript
        else interim += res[0].transcript
      }
      const combined = `${finalTranscript}${interim}`.trim()
      if (combined) setValue(combined)
    }
    rec.onerror = () => setRecording(false)
    rec.onend = () => setRecording(false)
    rec.start()
    recognitionRef.current = rec
    setRecording(true)
  }

  function stopVoiceInput() {
    recognitionRef.current?.stop()
    setRecording(false)
  }

  return (
    <div className="border-t border-border bg-bg p-4">
      <div className="flex items-end gap-2">
        <div className="relative flex-1">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={handleChange}
            onKeyDown={onKeyDown}
            rows={1}
            placeholder="Message…"
            aria-label="Message input"
            className="w-full resize-none rounded-lg border border-border bg-surface px-4 py-3 text-white placeholder:text-muted focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent/20"
          />
          {mentionQuery !== null && (
            <MentionAutocomplete
              query={mentionQuery}
              members={members}
              onSelect={insertMention}
              onDismiss={() => setMentionQuery(null)}
            />
          )}
        </div>
        <button
          type="button"
          onClick={recording ? stopVoiceInput : startVoiceInput}
          aria-label={recording ? 'Stop voice input' : 'Start voice input'}
          className={`grid h-[42px] w-[42px] place-items-center rounded-lg text-bg ${
            recording ? 'bg-warning' : 'bg-accent'
          }`}
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
          <kbd className="text-accent">↵</kbd> send · <kbd className="text-accent">shift+↵</kbd> newline · <kbd className="text-accent">@</kbd> mention
        </span>
        <span className={statusLabel.color} aria-live="polite">
          ● {statusLabel.text}
        </span>
      </div>
    </div>
  )
}
