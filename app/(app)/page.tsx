import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export default async function AppIndex() {
  const supabase = await createClient()
  const { data: memberships } = await supabase
    .from('channel_members')
    .select('channel_id')
    .order('joined_at')
    .limit(1)

  const first = memberships?.[0]
  if (first) {
    redirect(`/c/${first.channel_id}`)
  }

  redirect('/onboarding')
}
