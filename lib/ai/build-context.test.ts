// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

const rowsMock = vi.fn()
const usersMock = vi.fn()

vi.mock('@/lib/supabase/service-role', () => ({
  serviceRoleClient: () => ({
    from: (table: string) => {
      if (table === 'messages') {
        return {
          select: () => ({
            eq: () => ({
              order: () => ({
                limit: () => rowsMock(),
              }),
            }),
          }),
        }
      }
      if (table === 'user') {
        return {
          select: () => ({
            in: () => usersMock(),
          }),
        }
      }
      throw new Error(`unexpected table ${table}`)
    },
  }),
}))

vi.mock('./system-prompt', () => ({
  SYSTEM_PROMPT: 'SYS',
}))

import { buildContext } from './build-context'

describe('buildContext', () => {
  beforeEach(() => {
    rowsMock.mockReset()
    usersMock.mockReset()
  })

  it('formats human messages with author name prefix, includes system prompt and invoker name', async () => {
    rowsMock.mockResolvedValue({
      data: [
        { author_kind: 'user', author_id: 'u-bob', body: 'Hi @ai', ai_status: null },
        { author_kind: 'user', author_id: 'u-alice', body: 'Hey', ai_status: null },
      ],
    })
    usersMock.mockResolvedValue({
      data: [
        { id: 'u-alice', name: 'Alice' },
        { id: 'u-bob', name: 'Bob' },
      ],
    })

    const msgs = await buildContext('chan-1', 'Bob')

    expect(msgs[0].role).toBe('system')
    expect(msgs[0].content).toContain('SYS')
    expect(msgs[0].content).toContain('Bob')

    expect(msgs[1]).toEqual({ role: 'user', content: 'Alice: Hey' })
    expect(msgs[2]).toEqual({ role: 'user', content: 'Bob: Hi @ai' })
  })

  it('includes only completed AI messages (not streaming/error placeholders)', async () => {
    rowsMock.mockResolvedValue({
      data: [
        { author_kind: 'ai', author_id: null, body: 'partial...', ai_status: 'streaming' },
        { author_kind: 'ai', author_id: null, body: 'Done answer', ai_status: 'complete' },
        { author_kind: 'user', author_id: 'u-alice', body: 'Q?', ai_status: null },
      ],
    })
    usersMock.mockResolvedValue({ data: [{ id: 'u-alice', name: 'Alice' }] })

    const msgs = await buildContext('chan-1', 'Alice')

    expect(msgs).toHaveLength(3) // system + user + completed assistant
    expect(msgs[1]).toEqual({ role: 'user', content: 'Alice: Q?' })
    expect(msgs[2]).toEqual({ role: 'assistant', content: 'Done answer' })
  })

  it('falls back to "Unknown" when an author_id has no matching user row', async () => {
    rowsMock.mockResolvedValue({
      data: [
        { author_kind: 'user', author_id: 'u-ghost', body: 'hello', ai_status: null },
      ],
    })
    usersMock.mockResolvedValue({ data: [] })

    const msgs = await buildContext('chan-1', 'Nobody')
    expect(msgs[1]).toEqual({ role: 'user', content: 'Unknown: hello' })
  })
})
