'use client'
import { useRouter } from 'next/navigation'
import { signOut } from '@/lib/auth/client'

export function SignOutButton({ className }: { className?: string }) {
  const router = useRouter()
  async function onClick() {
    await signOut()
    router.push('/sign-in')
    router.refresh()
  }
  return (
    <button
      onClick={onClick}
      className={`text-xs text-muted underline hover:text-accent ${className ?? ''}`}
    >
      Sign out
    </button>
  )
}
