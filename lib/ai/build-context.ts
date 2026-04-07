import { serviceRoleClient } from '@/lib/supabase/service-role'
import { SYSTEM_PROMPT } from './system-prompt'

export type OpenAIMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string }

const CONTEXT_WINDOW = 30

export async function buildContext(
  channelId: string,
  invokerName: string
): Promise<OpenAIMessage[]> {
  const supabase = serviceRoleClient()

  // 1. Last N messages in the channel (descending, then reverse)
  const { data: rows } = await supabase
    .from('messages')
    .select('author_kind, author_id, body, ai_status')
    .eq('channel_id', channelId)
    .order('created_at', { ascending: false })
    .limit(CONTEXT_WINDOW)

  const ordered = ((rows ?? []) as Array<{
    author_kind: 'user' | 'ai'
    author_id: string | null
    body: string
    ai_status: 'streaming' | 'complete' | 'error' | null
  }>).slice().reverse()

  // 2. Resolve author display names from BetterAuth's user table (one batch query)
  const authorIds = Array.from(
    new Set(
      ordered
        .filter((r) => r.author_kind === 'user' && r.author_id)
        .map((r) => r.author_id!)
    )
  )

  let nameById = new Map<string, string>()
  if (authorIds.length) {
    const { data: users } = await supabase
      .from('user')
      .select('id, name')
      .in('id', authorIds)
    nameById = new Map(
      ((users ?? []) as Array<{ id: string; name: string }>).map((u) => [u.id, u.name])
    )
  }
  const displayName = (id: string | null) => (id && nameById.get(id)) || 'Unknown'

  // 3. Format each message for OpenAI
  const messages: OpenAIMessage[] = ordered
    .map((row): OpenAIMessage | null => {
      if (row.author_kind === 'ai') {
        return row.ai_status === 'complete'
          ? { role: 'assistant', content: row.body }
          : null
      }
      return {
        role: 'user',
        content: `${displayName(row.author_id)}: ${row.body}`,
      }
    })
    .filter((m): m is OpenAIMessage => m !== null)

  // 4. System prompt with invoker name appended
  const system = `${SYSTEM_PROMPT}\n\nYou were just summoned by ${invokerName}. Address your response to them when it makes sense.`

  return [{ role: 'system', content: system }, ...messages]
}
