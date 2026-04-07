'use client'
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createBrowserSupabaseClient } from './browser'
import { refreshSupabaseJwt } from '@/server/session'

const SupabaseContext = createContext<SupabaseClient | null>(null)

// Refresh 10 minutes before the 1-hour JWT expiry
const REFRESH_INTERVAL_MS = 50 * 60 * 1000

export function SupabaseProvider({
  initialJwt,
  children,
}: {
  initialJwt: string | null
  children: React.ReactNode
}) {
  const [jwt, setJwt] = useState<string | null>(initialJwt)
  const client = useMemo(() => createBrowserSupabaseClient(jwt), [jwt])
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!jwt) return
    intervalRef.current = setInterval(async () => {
      const fresh = await refreshSupabaseJwt()
      setJwt(fresh)
    }, REFRESH_INTERVAL_MS)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [jwt])

  // Propagate the new JWT to the realtime channel if already connected
  useEffect(() => {
    if (jwt && client.realtime) {
      client.realtime.setAuth(jwt)
    }
  }, [jwt, client])

  return <SupabaseContext.Provider value={client}>{children}</SupabaseContext.Provider>
}

export function useSupabase(): SupabaseClient {
  const ctx = useContext(SupabaseContext)
  if (!ctx) throw new Error('useSupabase must be used inside <SupabaseProvider>')
  return ctx
}
