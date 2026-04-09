'use client'
import { useState, useTransition, useEffect, useRef } from 'react'
import { searchMessages } from '@/server/messages'

export function ChannelSearch({ channelId }: { channelId: string }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [results, setResults] = useState<Array<{ id: string; body: string; created_at: string }>>([])
  const [pending, start] = useTransition()
  const [searched, setSearched] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Keyboard shortcut: Cmd/Ctrl+K to open
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen(true)
      }
      if (e.key === 'Escape' && open) {
        setOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  // Auto-focus when opened
  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => inputRef.current?.focus())
      setQ('')
      setResults([])
      setSearched(false)
    }
  }, [open])

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!q.trim()) return
    start(async () => {
      const rows = await searchMessages(channelId, q)
      setResults(rows.map((r) => ({ id: r.id, body: r.body, created_at: r.created_at })))
      setSearched(true)
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
          className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] bg-black/60 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg rounded-xl border border-border bg-bg-lifted shadow-2xl overflow-hidden animate-in fade-in"
          >
            {/* Search input bar */}
            <form onSubmit={onSubmit} className="flex items-center gap-3 px-4 py-3 border-b border-border">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted shrink-0">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search messages…"
                className="flex-1 bg-transparent text-[14px] text-white placeholder:text-muted focus:outline-none"
              />
              {q && (
                <button
                  type="button"
                  onClick={() => { setQ(''); setResults([]); setSearched(false); inputRef.current?.focus() }}
                  className="text-muted hover:text-accent text-xs cursor-pointer"
                >
                  Clear
                </button>
              )}
              <kbd className="hidden sm:inline-flex items-center rounded bg-surface px-1.5 py-0.5 text-[10px] text-muted border border-border">
                esc
              </kbd>
            </form>

            {/* Results */}
            <div className="max-h-[50vh] overflow-y-auto">
              {pending && (
                <div className="flex items-center justify-center py-8">
                  <div className="flex gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-accent/40 pulse-dot" />
                    <span className="h-2 w-2 rounded-full bg-accent/40 pulse-dot" style={{ animationDelay: '0.2s' }} />
                    <span className="h-2 w-2 rounded-full bg-accent/40 pulse-dot" style={{ animationDelay: '0.4s' }} />
                  </div>
                </div>
              )}

              {!pending && searched && results.length === 0 && (
                <div className="py-8 text-center">
                  <div className="text-2xl mb-2">🔍</div>
                  <p className="text-sm text-muted">No messages found for &quot;{q}&quot;</p>
                </div>
              )}

              {!pending && !searched && !q && (
                <div className="py-8 text-center">
                  <p className="text-sm text-muted">Type to search through messages in this channel</p>
                </div>
              )}

              {!pending && !searched && q && (
                <div className="py-6 text-center">
                  <p className="text-sm text-muted">
                    Press <kbd className="mx-1 rounded bg-surface px-1.5 py-0.5 text-[11px] text-accent border border-border">↵ Enter</kbd> to search
                  </p>
                </div>
              )}

              {!pending && results.length > 0 && (
                <>
                  <div className="px-4 py-2 text-[10px] uppercase tracking-wider text-muted border-b border-border/50">
                    {results.length} result{results.length !== 1 ? 's' : ''}
                  </div>
                  <ul>
                    {results.map((r) => (
                      <li
                        key={r.id}
                        className="px-4 py-3 hover:bg-hover/50 cursor-pointer border-b border-border/30 last:border-0 transition-colors"
                        onClick={() => setOpen(false)}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted shrink-0">
                            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                          </svg>
                          <span className="text-[10px] text-muted">
                            {new Date(r.created_at).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                            {' '}
                            {new Date(r.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <p className="text-sm text-accent leading-relaxed line-clamp-2">{r.body}</p>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-4 py-2 border-t border-border text-[10px] text-muted">
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1">
                  <kbd className="rounded bg-surface px-1 py-0.5 border border-border">↑</kbd>
                  <kbd className="rounded bg-surface px-1 py-0.5 border border-border">↓</kbd>
                  navigate
                </span>
                <span className="flex items-center gap-1">
                  <kbd className="rounded bg-surface px-1 py-0.5 border border-border">↵</kbd>
                  select
                </span>
              </div>
              <span className="flex items-center gap-1">
                <kbd className="rounded bg-surface px-1 py-0.5 border border-border">⌘K</kbd>
                search
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
