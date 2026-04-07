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
      router.push(`/c/${ch.id}`)
    })
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="New channel"
        className="text-muted hover:text-accent text-lg leading-none"
      >
        +
      </button>
      {open && (
        <div
          className="fixed inset-0 z-40 grid place-items-center bg-black/50"
          onClick={() => setOpen(false)}
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={onCreate}
            className="w-80 rounded-xl border border-border bg-surface p-5 space-y-3"
          >
            <h2 className="font-semibold text-white">New channel</h2>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="channel-name"
              className="w-full rounded-lg border border-border bg-bg p-2 text-white focus:border-accent focus:outline-none"
            />
            <div className="flex gap-4 text-sm text-accent">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={type === 'public'}
                  onChange={() => setType('public')}
                />
                Public
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={type === 'private'}
                  onChange={() => setType('private')}
                />
                Private
              </label>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded px-3 py-1.5 text-sm text-muted hover:text-accent"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={pending || !name}
                className="rounded bg-accent px-3 py-1.5 text-sm font-semibold text-bg disabled:opacity-50"
              >
                {pending ? 'Creating…' : 'Create'}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  )
}
