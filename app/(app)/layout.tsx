import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth/better-auth'
import { mintSupabaseJwt } from '@/lib/auth/supabase-jwt'
import { SupabaseProvider } from '@/lib/supabase/supabase-provider'
import { Sidebar } from '@/components/sidebar/sidebar'
import { MobileDrawer } from '@/components/sidebar/mobile-drawer'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect('/sign-in')

  const jwt = await mintSupabaseJwt(session.user.id)

  return (
    <SupabaseProvider initialJwt={jwt}>
      <div className="flex h-screen overflow-hidden">
        <MobileDrawer>
          <Sidebar
            currentUser={{
              id: session.user.id,
              name: session.user.name || session.user.email,
            }}
          />
        </MobileDrawer>
        <main className="flex-1 flex flex-col min-w-0">{children}</main>
      </div>
    </SupabaseProvider>
  )
}
