'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { useSupabase } from '@/lib/supabase/supabase-provider'

type TypingPayload = { userId: string; name: string }

const TYPING_IDLE_MS = 3000
const TYPING_BROADCAST_THROTTLE_MS = 1500

export function useTyping(channelId: string, me: { userId: string; name: string }) {
  const supabase = useSupabase()
  const [typers, setTypers] = useState<TypingPayload[]>([])
  const channelRef = useRef<RealtimeChannel | null>(null)
  const lastSentRef = useRef<number>(0)
  const clearTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  useEffect(() => {
    const ch = supabase.channel(`typing:${channelId}`, {
      config: { broadcast: { self: false } },
    })
    ch.on('broadcast', { event: 'typing' }, ({ payload }) => {
      const p = payload as TypingPayload
      if (!p?.userId || p.userId === me.userId) return

      setTypers((prev) =>
        prev.some((t) => t.userId === p.userId) ? prev : [...prev, p]
      )

      const existing = clearTimers.current.get(p.userId)
      if (existing) clearTimeout(existing)
      clearTimers.current.set(
        p.userId,
        setTimeout(() => {
          setTypers((prev) => prev.filter((t) => t.userId !== p.userId))
          clearTimers.current.delete(p.userId)
        }, TYPING_IDLE_MS)
      )
    })
    ch.subscribe()
    channelRef.current = ch
    const timers = clearTimers.current
    return () => {
      timers.forEach((t) => clearTimeout(t))
      timers.clear()
      supabase.removeChannel(ch)
    }
  }, [supabase, channelId, me.userId])

  const notifyTyping = useCallback(() => {
    const now = Date.now()
    if (now - lastSentRef.current < TYPING_BROADCAST_THROTTLE_MS) return
    lastSentRef.current = now
    channelRef.current?.send({
      type: 'broadcast',
      event: 'typing',
      payload: { userId: me.userId, name: me.name },
    })
  }, [me.userId, me.name])

  return { typers, notifyTyping }
}
