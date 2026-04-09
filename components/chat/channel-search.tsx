'use client'
import { useState, useTransition } from 'react'
import { searchMessages } from '@/server/messages'

export function ChannelSearch({ channelId }: { channelId: string }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [results, setResults] = useState<Array<{ id: string; body: string; created_at: string }>>([])
  const [pending, start] = useTransition()

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    start(async () => {
      const rows = await searchMessages(channelId, q)
      setResults(rows.map((r) => ({ id: r.id, body: r.body, created_at: r.created_at })))
    })
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Search messages"
        title="Search messages"
        className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:text-accent hover:bg-hover cursor-pointer transition-colors"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      </button>
      {open && (
        <div
          className="fixed inset-0 z-40 grid place-items-center bg-black/60 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-xl rounded-xl border border-border bg-surface p-5"
          >
            <form onSubmit={onSubmit} className="flex gap-2">
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search messages…"
                className="flex-1 rounded-lg border border-border bg-bg p-2 text-white focus:border-accent focus:outline-none"
              />
              <button
                type="submit"
                disabled={pending}
                className="rounded-lg bg-accent px-3 font-semibold text-bg"
              >
                {pending ? '…' : 'Go'}
              </button>
            </form>
            <ul className="mt-4 max-h-96 space-y-2 overflow-y-auto">
              {results.length === 0 && q && !pending && (
                <li className="text-sm text-muted">No matches.</li>
              )}
              {results.map((r) => (
                <li key={r.id} className="rounded border border-border p-3">
                  <div className="text-[10px] text-muted">
                    {new Date(r.created_at).toLocaleString()}
                  </div>
                  <div className="mt-1 text-sm text-accent">{r.body}</div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </>
  )
}
