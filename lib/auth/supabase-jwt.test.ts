// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest'
import { jwtVerify } from 'jose'
import { mintSupabaseJwt } from './supabase-jwt'

beforeEach(() => {
  process.env.SUPABASE_JWT_SECRET = 'test-secret-at-least-32-characters-long!'
})

describe('mintSupabaseJwt', () => {
  it('returns a signed JWT with the expected claims', async () => {
    const userId = 'r3kJ8xUserIdInCuidFormat'
    const token = await mintSupabaseJwt(userId)

    expect(typeof token).toBe('string')
    expect(token.split('.')).toHaveLength(3)

    const secret = new TextEncoder().encode(process.env.SUPABASE_JWT_SECRET)
    const { payload } = await jwtVerify(token, secret)

    expect(payload.sub).toBe(userId)
    expect(payload.role).toBe('authenticated')
    expect(payload.app_user_id).toBe(userId)
    expect(payload.exp).toBeGreaterThan(Math.floor(Date.now() / 1000))
  })

  it('sets expiration about 1 hour in the future', async () => {
    const token = await mintSupabaseJwt('cuid_xyz')
    const secret = new TextEncoder().encode(process.env.SUPABASE_JWT_SECRET)
    const { payload } = await jwtVerify(token, secret)

    const now = Math.floor(Date.now() / 1000)
    expect(payload.exp! - now).toBeGreaterThan(3500)
    expect(payload.exp! - now).toBeLessThanOrEqual(3600)
  })

  it('throws if SUPABASE_JWT_SECRET is missing', async () => {
    delete process.env.SUPABASE_JWT_SECRET
    await expect(mintSupabaseJwt('any')).rejects.toThrow()
  })
})
