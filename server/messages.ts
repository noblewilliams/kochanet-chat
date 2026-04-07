'use server'
import { headers } from 'next/headers'
import { z } from 'zod'
import { auth } from '@/lib/auth/better-auth'
import { createClient } from '@/lib/supabase/server'

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

  // AI branch is added in Phase 11 — @ai detection, placeholder insert,
  // after() scheduling

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

export async function searchMessages(channelId: string, query: string) {
  if (!query.trim()) return []
  const supabase = await createClient()
  const { data } = await supabase
    .from('messages')
    .select('*')
    .eq('channel_id', channelId)
    .ilike('body', `%${query}%`)
    .order('created_at', { ascending: false })
    .limit(50)
  return data ?? []
}
