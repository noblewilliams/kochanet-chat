// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { mentionsAI } from './mention'

describe('mentionsAI', () => {
  it('returns true for lowercase @ai', () => {
    expect(mentionsAI('@ai help me')).toBe(true)
  })
  it('returns true for uppercase @AI', () => {
    expect(mentionsAI('hey @AI what up')).toBe(true)
  })
  it('returns true for mixed case @Ai', () => {
    expect(mentionsAI('@Ai please')).toBe(true)
  })
  it('returns false when ai is part of another word', () => {
    expect(mentionsAI('I am saying hi')).toBe(false)
    expect(mentionsAI('@ainsley was here')).toBe(false)
  })
  it('returns false when there is no @', () => {
    expect(mentionsAI('ai is cool')).toBe(false)
  })
  it('returns true when @ai appears mid-sentence', () => {
    expect(mentionsAI('thanks @ai for that answer')).toBe(true)
  })
  it('returns false for empty string', () => {
    expect(mentionsAI('')).toBe(false)
  })
})
