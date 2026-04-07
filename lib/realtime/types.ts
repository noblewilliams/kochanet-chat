import type { MessageRow } from '@/lib/supabase/types'

export type OptimisticStatus = 'sending' | 'failed'

export type Message = MessageRow & {
  _optimistic?: OptimisticStatus
}

export { type MessageRow }
