import { createClient } from '@supabase/supabase-js'

/**
 * The service-role Supabase client bypasses RLS entirely.
 *
 * **ONLY** import this from server-side AI code (`lib/ai/stream-response.ts`,
 * `server/ai.ts`, `supabase/seed.ts`). Every other path must use the
 * user-scoped clients in `lib/supabase/server.ts` or `lib/supabase/browser.ts`.
 *
 * Any new import of this module is a privilege boundary expansion and should
 * be reviewed accordingly.
 */
export function serviceRoleClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    }
  )
}
