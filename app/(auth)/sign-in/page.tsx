'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { signIn } from '@/lib/auth/client'

export default function SignInPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const res = await signIn.email({ email, password })
    setBusy(false)
    if (res.error) {
      setError(res.error.message || 'Sign-in failed')
      return
    }
    router.push('/')
    router.refresh()
  }

  async function onGitHub() {
    await signIn.social({ provider: 'github', callbackURL: '/' })
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
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
        <span className="text-xs text-muted">Password</span>
        <input
          type="password"
          required
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
        {busy ? 'Signing in…' : 'Sign in'}
      </button>

      <div className="relative py-2 text-center">
        <div className="absolute inset-x-0 top-1/2 h-px bg-border" />
        <span className="relative bg-surface px-2 text-xs text-muted">or</span>
      </div>

      <button
        type="button"
        onClick={onGitHub}
        className="w-full rounded-lg border border-border p-2 text-accent hover:bg-hover"
      >
        Continue with GitHub
      </button>

      <p className="text-center text-xs text-muted">
        No account? <a href="/sign-up" className="text-accent underline">Sign up</a>
      </p>
    </form>
  )
}
