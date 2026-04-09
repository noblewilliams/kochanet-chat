'use client'
import { useState, useRef, useTransition } from 'react'
import { sendMessage } from '@/server/messages'
import { transcribeAudio } from '@/server/transcribe'
import type { ConnectionStatus } from '@/lib/realtime/use-connection-state'
import { MentionAutocomplete } from './mention-autocomplete'

const STATUS_LABEL: Record<ConnectionStatus, { text: string; color: string }> = {
  connecting: { text: 'connecting', color: 'text-warning' },
  connected: { text: 'connected', color: 'text-success' },
  reconnecting: { text: 'reconnecting', color: 'text-warning' },
  offline: { text: 'offline', color: 'text-warning' },
}

type RecordState = 'idle' | 'recording' | 'transcribing'

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
  const [recordState, setRecordState] = useState<RecordState>('idle')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
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

  async function startRecording() {
    if (recordState !== 'idle') return
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      alert('Voice input requires a modern browser with microphone access.')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      // Pick a mime type the browser supports — Chrome/Edge default to webm/opus
      const candidates = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/mp4',
        'audio/ogg;codecs=opus',
      ]
      const mimeType = candidates.find((m) => MediaRecorder.isTypeSupported(m)) || ''
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)
      recorderRef.current = recorder
      chunksRef.current = []

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      recorder.onstop = async () => {
        // Tear down the mic stream
        streamRef.current?.getTracks().forEach((t) => t.stop())
        streamRef.current = null

        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' })
        chunksRef.current = []

        if (blob.size === 0) {
          setRecordState('idle')
          return
        }

        setRecordState('transcribing')
        try {
          const ext = (recorder.mimeType || 'audio/webm').split(';')[0].split('/')[1] || 'webm'
          const file = new File([blob], `recording.${ext}`, { type: blob.type })
          const formData = new FormData()
          formData.append('audio', file)
          const transcript = await transcribeAudio(formData)
          if (transcript) {
            setValue((prev) => (prev ? `${prev} ${transcript}` : transcript))
            requestAnimationFrame(() => textareaRef.current?.focus())
          }
        } catch (err) {
          console.error('transcribe failed', err)
          alert(`Transcription failed: ${(err as Error).message}`)
        } finally {
          setRecordState('idle')
        }
      }

      recorder.start()
      setRecordState('recording')
    } catch (err) {
      console.error('mic permission / start failed', err)
      alert('Could not start voice recording. Check microphone permission.')
      setRecordState('idle')
    }
  }

  function stopRecording() {
    const rec = recorderRef.current
    if (rec && rec.state !== 'inactive') {
      rec.stop()
    }
  }

  function onMicClick() {
    if (recordState === 'recording') stopRecording()
    else if (recordState === 'idle') startRecording()
    // 'transcribing' = ignore clicks until done
  }

  const micLabel =
    recordState === 'recording'
      ? 'Stop recording'
      : recordState === 'transcribing'
      ? 'Transcribing…'
      : 'Start voice input'

  const micBg =
    recordState === 'recording'
      ? 'bg-warning'
      : recordState === 'transcribing'
      ? 'bg-muted'
      : 'bg-accent'

  return (
    <div className="border-t border-border bg-bg px-4 py-3">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={handleChange}
            onKeyDown={onKeyDown}
            rows={1}
            placeholder={recordState === 'transcribing' ? 'Transcribing…' : 'Message…'}
            aria-label="Message input"
            disabled={recordState === 'transcribing'}
            className="w-full resize-none rounded-lg border border-border bg-surface px-4 py-2.5 text-white placeholder:text-muted focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent/20 disabled:opacity-60 h-[42px]"
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
          onClick={onMicClick}
          disabled={recordState === 'transcribing'}
          aria-label={micLabel}
          className={`grid h-[42px] w-[42px] place-items-center rounded-lg text-bg disabled:opacity-60 ${micBg}`}
        >
          {recordState === 'transcribing' ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="animate-spin">
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="2" width="6" height="12" rx="3" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
          )}
        </button>
        <button
          type="button"
          onClick={handleSend}
          disabled={!value.trim() || pending || recordState === 'transcribing'}
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
