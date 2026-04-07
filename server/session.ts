'use server'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth/better-auth'
import { mintSupabaseJwt } from '@/lib/auth/supabase-jwt'

/**
 * Mints a fresh Supabase JWT from the current BetterAuth session.
 * Called by SupabaseProvider on the browser to refresh tokens before expiry.
 * Returns null if there's no active session.
 */
export async function refreshSupabaseJwt(): Promise<string | null> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return null
  return mintSupabaseJwt(session.user.id)
}
