'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { useSupabase } from '@/lib/supabase/supabase-provider'
import type { Message, MessageRow } from './types'

const MAX_MESSAGES = 500

export function useMessages(channelId: string, initial: MessageRow[]) {
  const supabase = useSupabase()
  const [messages, setMessages] = useState<Message[]>(initial)
  const lastSeenCreatedAtRef = useRef<string>(
    initial.at(-1)?.created_at ?? new Date(0).toISOString()
  )

  const handleInsert = useCallback((row: MessageRow) => {
    if (row.channel_id !== channelId) return

    setMessages((prev) => {
      // Reconcile optimistic row with server-confirmed one by matching client_id
      if (row.client_id) {
        const idx = prev.findIndex(
          (m) => m._optimistic === 'sending' && m.client_id === row.client_id
        )
        if (idx >= 0) {
          const next = prev.slice()
          next[idx] = { ...row }
          return next
        }
      }
      // Plain insert if not already present
      if (prev.some((m) => m.id === row.id)) return prev
      const next = [...prev, row]
      return next.length > MAX_MESSAGES ? next.slice(-MAX_MESSAGES) : next
    })
    if (row.created_at > lastSeenCreatedAtRef.current) {
      lastSeenCreatedAtRef.current = row.created_at
    }
  }, [channelId])

  const handleUpdate = useCallback((row: MessageRow) => {
    if (row.channel_id !== channelId) return
    setMessages((prev) => prev.map((m) => (m.id === row.id ? { ...m, ...row } : m)))
  }, [channelId])

  useEffect(() => {
    let subscribedOnce = false

    const ch: RealtimeChannel = supabase
      .channel(`messages:${channelId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => handleInsert(payload.new as MessageRow)
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'messages' },
        (payload) => handleUpdate(payload.new as MessageRow)
      )
      .subscribe(async (state) => {
        if (state === 'SUBSCRIBED') {
          if (!subscribedOnce) {
            subscribedOnce = true
            return
          }
          // Re-subscribed after a drop — fill any gap
          const { data: missed } = await supabase
            .from('messages')
            .select('*')
            .eq('channel_id', channelId)
            .gt('created_at', lastSeenCreatedAtRef.current)
            .order('created_at', { ascending: true })
          if (missed && missed.length) {
            setMessages((prev) => {
              const existing = new Set(prev.map((m) => m.id))
              const additions = (missed as MessageRow[]).filter((m) => !existing.has(m.id))
              const next = [...prev, ...additions]
              return next.length > MAX_MESSAGES ? next.slice(-MAX_MESSAGES) : next
            })
            lastSeenCreatedAtRef.current = (missed.at(-1) as MessageRow).created_at
          }
        }
      })

    return () => {
      supabase.removeChannel(ch)
    }
  }, [supabase, channelId, handleInsert, handleUpdate])

  const addOptimistic = useCallback(
    (opts: { clientId: string; body: string; authorId: string }) => {
      const now = new Date().toISOString()
      const opt: Message = {
        id: `opt-${opts.clientId}`,
        channel_id: channelId,
        author_kind: 'user',
        author_id: opts.authorId,
        invoked_by_user_id: null,
        body: opts.body,
        client_id: opts.clientId,
        ai_status: null,
        created_at: now,
        _optimistic: 'sending',
      }
      setMessages((prev) => [...prev, opt])
    },
    [channelId]
  )

  const markOptimisticFailed = useCallback((clientId: string) => {
    setMessages((prev) =>
      prev.map((m) =>
        m._optimistic === 'sending' && m.client_id === clientId
          ? { ...m, _optimistic: 'failed' }
          : m
      )
    )
  }, [])

  return { messages, setMessages, addOptimistic, markOptimisticFailed }
}
