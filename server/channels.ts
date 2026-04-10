'use server'
import { headers } from 'next/headers'
import { after } from 'next/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { auth } from '@/lib/auth/better-auth'
import { createClient } from '@/lib/supabase/server'
import { serviceRoleClient } from '@/lib/supabase/service-role'

const createChannelSchema = z.object({
  name: z.string().min(1).max(50),
  type: z.enum(['public', 'private']),
})

export async function createChannel(input: { name: string; type: 'public' | 'private' }) {
  const parsed = createChannelSchema.parse(input)
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) throw new Error('unauthorized')

  // Use service-role for channel creation to avoid an RLS race condition:
  // the channels SELECT policy for private channels requires a channel_members
  // row, but we can't insert the membership until we know the channel id.
  // With the user-scoped client, .insert().select() fails because the
  // membership doesn't exist yet at SELECT time.
  const admin = serviceRoleClient()

  const { data: channel, error } = await admin
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
  const { error: memberErr } = await admin
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

  after(() => {
    revalidatePath('/', 'layout')
  })
}

export async function inviteMember(input: { channelId: string; email: string }) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) throw new Error('unauthorized')

  // Use service role to look up the invitee (BetterAuth's user table is
  // un-RLS'd, but we go through service role for consistency) and to insert
  // the membership row on behalf of the invitee (the inviter doesn't have
  // RLS permission to insert another user's row).
  const admin = serviceRoleClient()

  const { data: user } = await admin
    .from('user')
    .select('id')
    .eq('email', input.email)
    .maybeSingle()

  if (!user) {
    throw new Error('No user with that email. Ask them to sign up first.')
  }

  const { error } = await admin.from('channel_members').insert({
    channel_id: input.channelId,
    user_id: user.id,
    role: 'member',
  })
  // 23505 = already a member; treat as success
  if (error && error.code !== '23505') throw error
}
