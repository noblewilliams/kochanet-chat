'use client'
import { useEffect, useState } from 'react'
import { useSupabase } from '@/lib/supabase/supabase-provider'

export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'offline'

export function useConnectionState(): ConnectionStatus {
  const supabase = useSupabase()
  const [status, setStatus] = useState<ConnectionStatus>('connecting')

  useEffect(() => {
    const probe = supabase.channel(`connection-probe-${crypto.randomUUID()}`)
    probe.subscribe((s) => {
      if (s === 'SUBSCRIBED') setStatus('connected')
      else if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT') setStatus('reconnecting')
      else if (s === 'CLOSED') setStatus('offline')
    })

    return () => {
      supabase.removeChannel(probe)
    }
  }, [supabase])

  return status
}
