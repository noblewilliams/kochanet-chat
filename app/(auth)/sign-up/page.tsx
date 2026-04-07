'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { signUp } from '@/lib/auth/client'

export default function SignUpPage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const res = await signUp.email({ email, password, name })
    setBusy(false)
    if (res.error) {
      setError(res.error.message || 'Sign-up failed')
      return
    }
    router.push('/')
    router.refresh()
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <label className="block">
        <span className="text-xs text-muted">Display name</span>
        <input
          type="text"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1 w-full rounded-lg border border-border bg-bg p-2 text-white focus:border-accent focus:outline-none"
        />
      </label>
      <label className="block">
        <span className="text-xs text-muted">Email</span>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1 w-full rounded-lg border border-border bg-bg p-2 text-white focus:border-accent focus:outline-none"
        />
      </label>
      <label className="block">
        <span className="text-xs text-muted">Password (min 8)</span>
        <input
          type="password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-1 w-full rounded-lg border border-border bg-bg p-2 text-white focus:border-accent focus:outline-none"
        />
      </label>
      {error && <p className="text-sm text-warning">{error}</p>}
      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-lg bg-accent p-2 font-semibold text-bg disabled:opacity-60"
      >
        {busy ? 'Creating…' : 'Create account'}
      </button>
      <p className="text-center text-xs text-muted">
        Already have one? <a href="/sign-in" className="text-accent underline">Sign in</a>
      </p>
    </form>
  )
}
