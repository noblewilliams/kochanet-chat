const VERBS = [
  'thinking',
  'analyzing',
  'pondering',
  'considering',
  'reasoning',
  'working',
  'composing',
  'formulating',
  'searching',
  'processing',
] as const

/**
 * Picks a stable verb from the pool based on a message id, so every viewer
 * sees the same verb for a given message (deterministic from id, no client
 * randomness).
 */
export function thinkingVerbFor(messageId: string): (typeof VERBS)[number] {
  let hash = 0
  for (let i = 0; i < messageId.length; i++) {
    hash = (hash * 31 + messageId.charCodeAt(i)) | 0
  }
  return VERBS[Math.abs(hash) % VERBS.length]
}
