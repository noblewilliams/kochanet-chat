import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Browser-side Supabase client. Takes a JWT (minted server-side from the
 * BetterAuth session) and attaches it to all requests + the realtime
 * connection.
 *
 * Re-created whenever the JWT is refreshed (handled by SupabaseProvider).
 */
export function createBrowserSupabaseClient(jwt: string | null): SupabaseClient {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: jwt ? { headers: { Authorization: `Bearer ${jwt}` } } : undefined,
    }
  )
}
