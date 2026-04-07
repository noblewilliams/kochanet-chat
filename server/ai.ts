import { serviceRoleClient } from '@/lib/supabase/service-role'

export class RateLimitError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RateLimitError'
  }
}

/**
 * Enforces 5 AI invocations per user per rolling minute. Counts AI message
 * rows attributed to this user within the last 60 seconds. Throws
 * RateLimitError if the limit has been reached.
 */
export async function checkAIRateLimit(userId: string): Promise<void> {
  const supabase = serviceRoleClient()
  const oneMinuteAgo = new Date(Date.now() - 60_000).toISOString()

  const { count } = await supabase
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('author_kind', 'ai')
    .eq('invoked_by_user_id', userId)
    .gte('created_at', oneMinuteAgo)

  if ((count ?? 0) >= 5) {
    throw new RateLimitError('5 AI invocations per minute max')
  }
}
