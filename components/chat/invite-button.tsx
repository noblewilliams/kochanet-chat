'use client'
import { useState, useTransition, useRef, useEffect } from 'react'
import { inviteMember } from '@/server/channels'

export function InviteButton({ channelId }: { channelId: string }) {
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => inputRef.current?.focus())
      setEmail('')
      setMsg(null)
    }
  }, [open])

  function onClose() {
    setOpen(false)
    setEmail('')
    setMsg(null)
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setMsg(null)
    start(async () => {
      try {
        await inviteMember({ channelId, email })
        setMsg({ text: `${email} has been invited!`, ok: true })
        setEmail('')
      } catch (err) {
        setMsg({ text: (err as Error).message, ok: false })
      }
    })
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Invite teammate"
        title="Invite teammate"
        className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:text-accent hover:bg-hover cursor-pointer transition-colors"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="8.5" cy="7" r="4" />
          <line x1="20" y1="8" x2="20" y2="14" />
          <line x1="23" y1="11" x2="17" y2="11" />
        </svg>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh] bg-black/60 backdrop-blur-sm"
          onClick={onClose}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-xl border border-border bg-bg-lifted shadow-2xl overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div>
                <h2 className="text-base font-semibold text-white font-heading">Invite teammate</h2>
                <p className="text-[11px] text-muted mt-0.5">Add someone to this channel by email</p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="text-muted hover:text-accent cursor-pointer transition-colors"
                aria-label="Close"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {/* Form */}
            <form onSubmit={onSubmit} className="px-5 py-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-muted mb-1.5">Email address</label>
                <div className="flex items-center gap-2 rounded-lg border border-border bg-bg px-3 py-2.5 focus-within:border-accent transition-colors">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted shrink-0">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                    <polyline points="22,6 12,13 2,6" />
                  </svg>
                  <input
                    ref={inputRef}
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="teammate@example.com"
                    className="flex-1 bg-transparent text-sm text-white placeholder:text-muted/50 focus:outline-none"
                  />
                </div>
              </div>

              {/* Feedback message */}
              {msg && (
                <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${
                  msg.ok
                    ? 'bg-success/10 text-success border border-success/20'
                    : 'bg-warning/10 text-warning border border-warning/20'
                }`}>
                  {msg.ok ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="8" x2="12" y2="12" />
                      <line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                  )}
                  <span>{msg.text}</span>
                </div>
              )}

              {/* Actions */}
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg px-4 py-2 text-sm text-muted hover:text-accent cursor-pointer transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={pending || !email}
                  className="rounded-lg bg-accent px-5 py-2 text-sm font-semibold text-bg disabled:opacity-50 cursor-pointer transition-opacity"
                >
                  {pending ? 'Inviting…' : 'Send invite'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
