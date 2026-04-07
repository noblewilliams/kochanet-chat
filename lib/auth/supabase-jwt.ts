import { SignJWT } from 'jose'

/**
 * Mints a Supabase-compatible JWT from a BetterAuth user id, signed with
 * SUPABASE_JWT_SECRET. The JWT carries:
 *
 * - `sub`: the BetterAuth user id (standard JWT subject claim)
 * - `role`: 'authenticated' (Supabase RLS uses this to distinguish from anon)
 * - `app_user_id`: our custom claim that RLS policies read via
 *   `current_setting('request.jwt.claims', true)::jsonb ->> 'app_user_id'`
 *
 * Token expires in 1 hour. The browser-side SupabaseProvider refreshes via
 * a server action before expiry.
 *
 * @throws if SUPABASE_JWT_SECRET is not set in the environment
 */
export async function mintSupabaseJwt(betterAuthUserId: string): Promise<string> {
  const secretValue = process.env.SUPABASE_JWT_SECRET
  if (!secretValue) {
    throw new Error('SUPABASE_JWT_SECRET is not set')
  }
  const secret = new TextEncoder().encode(secretValue)

  return new SignJWT({
    sub: betterAuthUserId,
    role: 'authenticated',
    app_user_id: betterAuthUserId,
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(secret)
}
