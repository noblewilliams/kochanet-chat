import OpenAI from 'openai'

/**
 * Groq client. Uses the OpenAI SDK pointed at Groq's OpenAI-compatible
 * endpoint — no separate package needed. Used only for the audio
 * transcription endpoint (whisper-large-v3-turbo).
 *
 * Chat completions still go through OpenAI proper (lib/ai/openai.ts) per
 * the brief's required stack.
 */
export const groq = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: 'https://api.groq.com/openai/v1',
})

export const STT_MODEL = 'whisper-large-v3-turbo'
