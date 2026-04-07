/**
 * Detects whether a message body contains an `@ai` mention.
 *
 * Matches `@ai` (case-insensitive) only when it appears at the start of the
 * string or preceded by whitespace, AND followed by a word boundary, so that
 * substrings like `saying`, `@ainsley`, or `chairman` don't false-positive.
 */
const AI_MENTION_REGEX = /(^|\s)@ai\b/i

export function mentionsAI(body: string): boolean {
  if (!body) return false
  return AI_MENTION_REGEX.test(body)
}
