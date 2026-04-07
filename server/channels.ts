'use server'
import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { auth } from '@/lib/auth/better-auth'
import { createClient } from '@/lib/supabase/server'

const createChannelSchema = z.object({
  name: z.string().min(1).max(50),
  type: z.enum(['public', 'private']),
})

export async function createChannel(input: { name: string; type: 'public' | 'private' }) {
  const parsed = createChannelSchema.parse(input)
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) throw new Error('unauthorized')

  const supabase = await createClient()

  const { data: channel, error } = await supabase
    .from('channels')
    .insert({
      name: parsed.name,
      type: parsed.type,
      created_by: session.user.id,
    })
    .select()
    .single()
  if (error) throw error

  // Owner auto-joins as 'owner' role
  const { error: memberErr } = await supabase
    .from('channel_members')
    .insert({
      channel_id: channel.id,
      user_id: session.user.id,
      role: 'owner',
    })
  if (memberErr) throw memberErr

  revalidatePath('/', 'layout')
  return channel
}

export async function joinChannel(channelId: string) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) throw new Error('unauthorized')

  const supabase = await createClient()
  const { error } = await supabase
    .from('channel_members')
    .insert({
      channel_id: channelId,
      user_id: session.user.id,
      role: 'member',
    })
  // 23505 = unique violation = already a member
  if (error && error.code !== '23505') throw error

  revalidatePath('/', 'layout')
}

export async function updateLastRead(channelId: string) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return

  const supabase = await createClient()
  await supabase
    .from('channel_members')
    .update({ last_read_at: new Date().toISOString() })
    .eq('channel_id', channelId)
    .eq('user_id', session.user.id)
}
