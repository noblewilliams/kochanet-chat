'use server'
import { headers } from 'next/headers'
import { after } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth/better-auth'
import { createClient } from '@/lib/supabase/server'
import { serviceRoleClient } from '@/lib/supabase/service-role'
import { mentionsAI } from '@/lib/utils/mention'
import { checkAIRateLimit, RateLimitError } from './ai'
import { invokeAI } from '@/lib/ai/stream-response'

// Re-export so the Composer can branch on the error name
export { RateLimitError }

const sendMessageSchema = z.object({
  channelId: z.string().uuid(),
  body: z.string().min(1).max(4000),
  clientId: z.string().uuid(),
})

export async function sendMessage(input: {
  channelId: string
  body: string
  clientId: string
}) {
  const parsed = sendMessageSchema.parse(input)

  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) throw new Error('unauthorized')
  const user = session.user

  const supabase = await createClient()

  // 1. Insert the user's message via the user's JWT — RLS enforces membership
  const { data: userMsg, error } = await supabase
    .from('messages')
    .insert({
      channel_id: parsed.channelId,
      author_kind: 'user',
      author_id: user.id,
      body: parsed.body,
      client_id: parsed.clientId,
    })
    .select()
    .single()
  if (error) throw error

  // 2. If @ai is mentioned, rate-limit, insert the placeholder, schedule the stream
  if (mentionsAI(parsed.body)) {
    await checkAIRateLimit(user.id)

    const admin = serviceRoleClient()
    const { data: placeholder, error: phErr } = await admin
      .from('messages')
      .insert({
        channel_id: parsed.channelId,
        author_kind: 'ai',
        author_id: null,
        invoked_by_user_id: user.id,
        body: '',
        ai_status: 'streaming',
      })
      .select()
      .single()
    if (phErr) throw phErr

    after(() =>
      invokeAI({
        channelId: parsed.channelId,
        placeholderId: placeholder.id,
        invokerName: user.name || 'Teammate',
      })
    )
  }

  return { ok: true as const, message: userMsg }
}

export async function loadMessagesBefore(channelId: string, beforeCreatedAt: string, limit = 50) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('messages')
    .select('*')
    .eq('channel_id', channelId)
    .lt('created_at', beforeCreatedAt)
    .order('created_at', { ascending: false })
    .limit(limit)
  return (data ?? []).slice().reverse()
}

/**
 * Searches messages across ALL channels the user is a member of.
 * RLS filters to only channels the user can read.
 * Returns results with channel name resolved.
 */
export async function searchMessages(query: string) {
  if (!query.trim()) return []
  const supabase = await createClient()
  const { data } = await supabase
    .from('messages')
    .select('id, body, created_at, channel_id')
    .ilike('body', `%${query}%`)
    .order('created_at', { ascending: false })
    .limit(30)

  const rows = data ?? []
  if (rows.length === 0) return []

  // Resolve channel names in one batch query
  const channelIds = [...new Set(rows.map((r) => r.channel_id))]
  const { data: channels } = await supabase
    .from('channels')
    .select('id, name')
    .in('id', channelIds)
  const nameById = new Map((channels ?? []).map((c) => [c.id, c.name]))

  return rows.map((r) => ({
    id: r.id,
    body: r.body,
    created_at: r.created_at,
    channel_id: r.channel_id,
    channelName: nameById.get(r.channel_id) ?? 'unknown',
  }))
}
