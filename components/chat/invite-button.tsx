'use client'
import { useState, useTransition } from 'react'
import { inviteMember } from '@/server/channels'

export function InviteButton({ channelId }: { channelId: string }) {
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setMsg(null)
    start(async () => {
      try {
        await inviteMember({ channelId, email })
        setMsg('Invited!')
        setEmail('')
      } catch (err) {
        setMsg((err as Error).message)
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
          className="fixed inset-0 z-40 grid place-items-center bg-black/60 p-4"
          onClick={() => setOpen(false)}
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={onSubmit}
            className="w-80 rounded-xl border border-border bg-surface p-5 space-y-3"
          >
            <h2 className="font-semibold text-white">Invite teammate</h2>
            <input
              autoFocus
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="teammate@example.com"
              className="w-full rounded-lg border border-border bg-bg p-2 text-white focus:border-accent focus:outline-none"
            />
            {msg && <p className="text-xs text-muted">{msg}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setOpen(false)} className="text-xs text-muted">
                Cancel
              </button>
              <button
                type="submit"
                disabled={pending}
                className="rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-bg disabled:opacity-60"
              >
                {pending ? 'Inviting…' : 'Invite'}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  )
}
