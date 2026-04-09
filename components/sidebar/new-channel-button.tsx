'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createChannel } from '@/server/channels'

export function NewChannelButton() {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [type, setType] = useState<'public' | 'private'>('public')
  const [pending, start] = useTransition()
  const router = useRouter()

  function onCreate(e: React.FormEvent) {
    e.preventDefault()
    start(async () => {
      const ch = await createChannel({ name, type })
      setOpen(false)
      setName('')
      setType('public')
      router.push(`/c/${ch.id}`)
    })
  }

  function onClose() {
    setOpen(false)
    setName('')
    setType('public')
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="New channel"
        className="text-muted hover:text-accent text-lg leading-none cursor-pointer"
      >
        +
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
              <h2 className="text-base font-semibold text-white font-heading">Create a channel</h2>
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
            <form onSubmit={onCreate} className="px-5 py-5 space-y-5">
              {/* Channel name */}
              <div>
                <label className="block text-xs font-medium text-muted mb-1.5">Channel name</label>
                <div className="flex items-center gap-2 rounded-lg border border-border bg-bg px-3 py-2.5 focus-within:border-accent transition-colors">
                  <span className="text-muted text-sm">#</span>
                  <input
                    autoFocus
                    value={name}
                    onChange={(e) => setName(e.target.value.toLowerCase().replace(/[^a-z0-9-_]/g, '-'))}
                    placeholder="e.g. design-team"
                    className="flex-1 bg-transparent text-sm text-white placeholder:text-muted/50 focus:outline-none"
                  />
                </div>
                <p className="mt-1.5 text-[11px] text-muted/60">Lowercase letters, numbers, and hyphens only</p>
              </div>

              {/* Channel type */}
              <div>
                <label className="block text-xs font-medium text-muted mb-2">Visibility</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setType('public')}
                    className={`flex items-center gap-2.5 rounded-lg border px-3 py-3 text-left transition-colors cursor-pointer ${
                      type === 'public'
                        ? 'border-accent bg-accent/10 text-white'
                        : 'border-border text-muted hover:border-accent/40'
                    }`}
                  >
                    <div className={`grid h-8 w-8 place-items-center rounded-lg ${type === 'public' ? 'bg-accent/20' : 'bg-surface'}`}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="2" y1="12" x2="22" y2="12" />
                        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                      </svg>
                    </div>
                    <div>
                      <div className="text-sm font-medium">Public</div>
                      <div className="text-[11px] text-muted">Anyone can join</div>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setType('private')}
                    className={`flex items-center gap-2.5 rounded-lg border px-3 py-3 text-left transition-colors cursor-pointer ${
                      type === 'private'
                        ? 'border-accent bg-accent/10 text-white'
                        : 'border-border text-muted hover:border-accent/40'
                    }`}
                  >
                    <div className={`grid h-8 w-8 place-items-center rounded-lg ${type === 'private' ? 'bg-accent/20' : 'bg-surface'}`}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                      </svg>
                    </div>
                    <div>
                      <div className="text-sm font-medium">Private</div>
                      <div className="text-[11px] text-muted">Invite only</div>
                    </div>
                  </button>
                </div>
              </div>

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
                  disabled={pending || !name}
                  className="rounded-lg bg-accent px-5 py-2 text-sm font-semibold text-bg disabled:opacity-50 cursor-pointer transition-opacity"
                >
                  {pending ? 'Creating…' : 'Create channel'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
