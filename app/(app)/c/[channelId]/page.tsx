import { notFound } from 'next/navigation'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth/better-auth'
import { createClient } from '@/lib/supabase/server'
import { ChatView } from '@/components/chat/chat-view'
import { JoinChannelPrompt } from '@/components/chat/join-channel-prompt'
import { updateLastRead } from '@/server/channels'

export default async function ChannelPage({
  params,
}: {
  params: Promise<{ channelId: string }>
}) {
  const { channelId } = await params

  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return notFound()

  const supabase = await createClient()

  // Fetch channel + membership in parallel (both needed for access check)
  const [{ data: channel, error }, { data: myMembership }] = await Promise.all([
    supabase.from('channels').select('id, name, type').eq('id', channelId).single(),
    supabase
      .from('channel_members')
      .select('user_id, last_read_at')
      .eq('channel_id', channelId)
      .eq('user_id', session.user.id)
      .maybeSingle(),
  ])
  if (error || !channel) return notFound()

  if (!myMembership) {
    if (channel.type === 'public') {
      return <JoinChannelPrompt channel={channel} />
    }
    return notFound()
  }

  // Capture priorLastReadAt BEFORE bumping it for the "new messages" divider
  const priorLastReadAt = myMembership.last_read_at

  // Run remaining queries + updateLastRead in parallel
  const [{ data: initialMessages }, { data: memberRows }] = await Promise.all([
    supabase
      .from('messages')
      .select('*')
      .eq('channel_id', channelId)
      .order('created_at', { ascending: false })
      .limit(50),
    supabase.from('channel_members').select('user_id').eq('channel_id', channelId),
    updateLastRead(channelId),
  ])

  const messages = (initialMessages ?? []).slice().reverse()

  const userIds = (memberRows ?? []).map((r) => r.user_id)
  const { data: users } = userIds.length
    ? await supabase.from('user').select('id, name').in('id', userIds)
    : { data: [] as Array<{ id: string; name: string }> }

  const memberList = (users ?? []).map((u) => ({ id: u.id, name: u.name }))

  return (
    <ChatView
      channel={channel}
      initialMessages={messages}
      priorLastReadAt={priorLastReadAt}
      members={memberList}
      currentUser={{ id: session.user.id, name: session.user.name || session.user.email }}
    />
  )
}
