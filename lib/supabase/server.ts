import { createServerClient } from '@supabase/ssr'
import { headers, cookies } from 'next/headers'
import { auth } from '@/lib/auth/better-auth'
import { mintSupabaseJwt } from '@/lib/auth/supabase-jwt'

/**
 * Creates a Supabase client for server components, server actions, and route
 * handlers. Automatically attaches a minted Supabase JWT derived from the
 * current BetterAuth session, so RLS sees the right user via the custom
 * `app_user_id` claim.
 *
 * If there's no BetterAuth session, the returned client is unauthenticated —
 * queries will hit RLS with no app_user_id and get filtered accordingly.
 */
export async function createClient() {
  const session = await auth.api.getSession({ headers: await headers() })
  const jwt = session ? await mintSupabaseJwt(session.user.id) : null
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (list) => {
          try {
            list.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Called from a Server Component — safe to ignore.
          }
        },
      },
      global: jwt
        ? { headers: { Authorization: `Bearer ${jwt}` } }
        : undefined,
    }
  )
}
