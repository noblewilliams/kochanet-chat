import { notFound } from 'next/navigation'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth/better-auth'
import { createClient } from '@/lib/supabase/server'
import { ChatView } from '@/components/chat/chat-view'

export default async function ChannelPage({
  params,
}: {
  params: Promise<{ channelId: string }>
}) {
  const { channelId } = await params

  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return notFound()

  const supabase = await createClient()

  const { data: channel, error } = await supabase
    .from('channels')
    .select('id, name, type')
    .eq('id', channelId)
    .single()
  if (error || !channel) return notFound()

  const { data: initialMessages } = await supabase
    .from('messages')
    .select('*')
    .eq('channel_id', channelId)
    .order('created_at', { ascending: false })
    .limit(50)

  const messages = (initialMessages ?? []).slice().reverse()

  // Two-step member fetch: membership rows then user names (no FK between them)
  const { data: memberRows } = await supabase
    .from('channel_members')
    .select('user_id')
    .eq('channel_id', channelId)

  const userIds = (memberRows ?? []).map((r) => r.user_id)
  const { data: users } = userIds.length
    ? await supabase.from('user').select('id, name').in('id', userIds)
    : { data: [] as Array<{ id: string; name: string }> }

  const memberList = (users ?? []).map((u) => ({ id: u.id, name: u.name }))

  return (
    <ChatView
      channel={channel}
      initialMessages={messages}
      members={memberList}
      currentUser={{ id: session.user.id, name: session.user.name || session.user.email }}
    />
  )
}
