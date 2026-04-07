import { config as loadEnv } from 'dotenv'
loadEnv({ path: '.env.local' })

const TEST_USERS = [
  { email: 'alice@kochanet.test', password: 'alice-test-password-1!', name: 'Alice Chen' },
  { email: 'bob@kochanet.test', password: 'bob-test-password-1!', name: 'Bob Martinez' },
]

async function main() {
  // Dynamic imports so env vars are loaded before BetterAuth's Pool is constructed
  const { auth } = await import('../lib/auth/better-auth')
  const { serviceRoleClient } = await import('../lib/supabase/service-role')

  async function ensureUser(u: typeof TEST_USERS[number]): Promise<string> {
    const admin = serviceRoleClient()
    const { data: existing } = await admin
      .from('user')
      .select('id')
      .eq('email', u.email)
      .maybeSingle()
    if (existing) {
      console.log(`  ${u.email} already exists (id=${existing.id})`)
      return existing.id
    }

    const res = await auth.api.signUpEmail({
      body: { email: u.email, password: u.password, name: u.name },
    })
    if (!res || !('user' in res) || !res.user) {
      throw new Error(`Failed to sign up ${u.email}: ${JSON.stringify(res)}`)
    }
    console.log(`  created ${u.email} (id=${res.user.id})`)
    return res.user.id
  }

  console.log('Seeding users…')
  const [aliceId, bobId] = await Promise.all(TEST_USERS.map(ensureUser))

  const admin = serviceRoleClient()

  console.log('Seeding channels…')
  const channels = [
    { name: 'general', type: 'public' as const, created_by: aliceId },
    { name: 'engineering', type: 'public' as const, created_by: aliceId },
  ]

  for (const c of channels) {
    const { data: existing } = await admin
      .from('channels')
      .select('id')
      .eq('name', c.name)
      .maybeSingle()
    let id = existing?.id
    if (!id) {
      const { data } = await admin.from('channels').insert(c).select('id').single()
      id = data!.id
      console.log(`  created #${c.name} (id=${id})`)
    } else {
      console.log(`  #${c.name} already exists (id=${id})`)
    }

    await admin
      .from('channel_members')
      .upsert(
        [
          { channel_id: id, user_id: aliceId, role: 'owner' },
          { channel_id: id, user_id: bobId, role: 'member' },
        ],
        { onConflict: 'channel_id,user_id' }
      )
  }

  console.log('Seeding messages in #engineering…')
  const { data: engChan } = await admin
    .from('channels')
    .select('id')
    .eq('name', 'engineering')
    .single()
  if (engChan) {
    const { count } = await admin
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('channel_id', engChan.id)
    if ((count ?? 0) === 0) {
      const seedMessages = [
        { author_id: aliceId, body: 'Deployment failed again — third time today.' },
        { author_id: bobId, body: 'Same error as yesterday?' },
        { author_id: aliceId, body: 'Yeah, something about Docker networking.' },
        { author_id: bobId, body: "I'll take a look in 10." },
      ]
      for (const m of seedMessages) {
        await admin.from('messages').insert({
          channel_id: engChan.id,
          author_kind: 'user',
          ...m,
        })
      }
      console.log(`  inserted ${seedMessages.length} seed messages`)
    } else {
      console.log(`  #engineering already has ${count} messages, skipping seed`)
    }
  }

  console.log('\n✓ Seed complete. Test credentials:')
  for (const u of TEST_USERS) {
    console.log(`  ${u.email} / ${u.password}`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
