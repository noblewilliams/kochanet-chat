'use client'
import { useEffect, useState } from 'react'

export type MentionCandidate =
  | { kind: 'ai'; handle: 'ai'; label: 'ai'; hint: string }
  | { kind: 'user'; handle: string; label: string; hint: string }

export function MentionAutocomplete({
  query,
  members,
  onSelect,
  onDismiss,
}: {
  query: string
  members: { id: string; name: string }[]
  onSelect: (handle: string) => void
  onDismiss: () => void
}) {
  const candidates: MentionCandidate[] = [
    { kind: 'ai', handle: 'ai', label: 'ai', hint: 'Summon the assistant' },
    ...members.map((m) => ({
      kind: 'user' as const,
      handle: m.name.toLowerCase().replace(/\s+/g, '.'),
      label: m.name,
      hint: '@' + m.name.toLowerCase().replace(/\s+/g, '.'),
    })),
  ]

  const q = query.toLowerCase()
  const filtered = candidates.filter(
    (c) => c.handle.includes(q) || c.label.toLowerCase().includes(q)
  )

  const [index, setIndex] = useState(0)
  useEffect(() => setIndex(0), [query])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onDismiss()
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        setIndex((i) => Math.min(i + 1, filtered.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setIndex((i) => Math.max(i - 1, 0))
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        if (filtered[index]) {
          e.preventDefault()
          onSelect(filtered[index].handle)
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [filtered, index, onDismiss, onSelect])

  if (filtered.length === 0) return null

  return (
    <div className="absolute bottom-full left-0 mb-2 w-64 rounded-lg border border-border bg-surface p-1.5 shadow-2xl z-30">
      <div className="px-2 py-1 text-[10px] uppercase tracking-wider text-muted">
        Mentions
      </div>
      <ul>
        {filtered.map((c, i) => (
          <li key={c.handle}>
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault()
                onSelect(c.handle)
              }}
              className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm ${
                i === index ? 'bg-hover text-white' : 'text-accent'
              }`}
            >
              <div
                className={`grid h-5 w-5 place-items-center rounded-full text-[10px] font-semibold ${
                  c.kind === 'ai'
                    ? 'bg-gradient-to-br from-accent to-accent-deep text-bg'
                    : 'bg-surface text-accent'
                }`}
              >
                {c.kind === 'ai' ? '✦' : c.label.slice(0, 1).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="truncate text-xs font-semibold">{c.label}</div>
                <div className="truncate text-[10px] text-muted">{c.hint}</div>
              </div>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
