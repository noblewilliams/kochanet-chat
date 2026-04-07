'use client'
import { useEffect, useState } from 'react'
import { useSupabase } from '@/lib/supabase/supabase-provider'

export type PresenceUser = { userId: string; name: string }

export function usePresence(channelId: string, me: PresenceUser) {
  const supabase = useSupabase()
  const [online, setOnline] = useState<PresenceUser[]>([])

  useEffect(() => {
    const ch = supabase.channel(`presence:${channelId}`, {
      config: { presence: { key: me.userId } },
    })

    ch.on('presence', { event: 'sync' }, () => {
      const state = ch.presenceState<PresenceUser>()
      const users: PresenceUser[] = []
      for (const key of Object.keys(state)) {
        const entry = state[key][0]
        if (entry) users.push(entry)
      }
      setOnline(users)
    }).subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await ch.track(me)
      }
    })

    return () => {
      supabase.removeChannel(ch)
    }
  }, [supabase, channelId, me.userId, me.name])

  return online
}
