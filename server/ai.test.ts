// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockCount = vi.fn<() => Promise<{ count: number | null }>>()
vi.mock('@/lib/supabase/service-role', () => ({
  serviceRoleClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            gte: () => mockCount(),
          }),
        }),
      }),
    }),
  }),
}))

import { checkAIRateLimit, RateLimitError } from './ai'

describe('checkAIRateLimit', () => {
  beforeEach(() => {
    mockCount.mockReset()
  })

  it('allows a request when the count is below 5', async () => {
    mockCount.mockResolvedValue({ count: 3 })
    await expect(checkAIRateLimit('user-1')).resolves.toBeUndefined()
  })

  it('allows a request when the count is 0', async () => {
    mockCount.mockResolvedValue({ count: 0 })
    await expect(checkAIRateLimit('user-1')).resolves.toBeUndefined()
  })

  it('allows a request when the count is null (no rows yet)', async () => {
    mockCount.mockResolvedValue({ count: null })
    await expect(checkAIRateLimit('user-1')).resolves.toBeUndefined()
  })

  it('throws RateLimitError when the count is 5 or more', async () => {
    mockCount.mockResolvedValue({ count: 5 })
    await expect(checkAIRateLimit('user-1')).rejects.toThrow(RateLimitError)
  })

  it('throws RateLimitError when the count is 10', async () => {
    mockCount.mockResolvedValue({ count: 10 })
    await expect(checkAIRateLimit('user-1')).rejects.toThrow(
      '5 AI invocations per minute max'
    )
  })
})
