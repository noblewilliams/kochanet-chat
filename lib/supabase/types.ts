// Hand-written DB row types. Could be replaced by `supabase gen types typescript`
// against the linked project, but the manual version is small enough to maintain
// alongside the migrations.

export type ChannelRow = {
  id: string
  name: string
  type: 'public' | 'private'
  created_by: string
  created_at: string
}

export type ChannelMemberRow = {
  channel_id: string
  user_id: string
  role: 'owner' | 'member'
  joined_at: string
  last_read_at: string
}

export type MessageRow = {
  id: string
  channel_id: string
  author_kind: 'user' | 'ai'
  author_id: string | null
  invoked_by_user_id: string | null
  body: string
  client_id: string | null
  ai_status: 'streaming' | 'complete' | 'error' | null
  created_at: string
}

export type UserRow = {
  id: string
  name: string
  email: string
}
