import { openai, AI_MODEL } from './openai'
import { buildContext } from './build-context'
import { serviceRoleClient } from '@/lib/supabase/service-role'

const BATCH_INTERVAL_MS = 80
const BATCH_TOKEN_COUNT = 30

/**
 * Streams an OpenAI response into a placeholder AI message row, batching
 * UPDATEs every ~80ms or every ~30 tokens. Each UPDATE fires a Postgres
 * Changes event, so all channel viewers see the body fill in via the same
 * realtime subscription that handles new human messages.
 *
 * Called from `after()` inside the sendMessage server action so the response
 * to the client is not blocked on OpenAI's stream.
 */
export async function invokeAI(opts: {
  channelId: string
  placeholderId: string
  invokerName: string
}) {
  const supabase = serviceRoleClient()

  try {
    const messages = await buildContext(opts.channelId, opts.invokerName)

    const stream = await openai.chat.completions.create({
      model: AI_MODEL,
      messages,
      stream: true,
    })

    let buffer = ''
    let pendingTokens = 0
    let lastFlush = Date.now()

    const flush = async () => {
      await supabase
        .from('messages')
        .update({ body: buffer })
        .eq('id', opts.placeholderId)
      pendingTokens = 0
      lastFlush = Date.now()
    }

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content ?? ''
      if (!delta) continue
      buffer += delta
      pendingTokens += 1

      const elapsed = Date.now() - lastFlush
      if (pendingTokens >= BATCH_TOKEN_COUNT || elapsed >= BATCH_INTERVAL_MS) {
        await flush()
      }
    }

    // Final flush + mark complete
    await supabase
      .from('messages')
      .update({ body: buffer, ai_status: 'complete' })
      .eq('id', opts.placeholderId)
  } catch (err) {
    console.error('invokeAI failed:', err)
    await supabase
      .from('messages')
      .update({
        body: 'AI failed to respond. Try again in a moment.',
        ai_status: 'error',
      })
      .eq('id', opts.placeholderId)
  }
}
