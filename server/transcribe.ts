'use server'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth/better-auth'
import { groq, STT_MODEL } from '@/lib/ai/groq'

const MAX_AUDIO_BYTES = 25 * 1024 * 1024 // 25 MB — plenty for short voice messages

/**
 * Transcribes a recorded audio blob via Groq's whisper-large-v3-turbo and
 * returns the transcript as plain text. Auth-gated to prevent abuse.
 *
 * Called from the Composer's mic button after MediaRecorder stops.
 */
export async function transcribeAudio(formData: FormData): Promise<string> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) throw new Error('unauthorized')

  const audio = formData.get('audio')
  if (!audio || typeof audio === 'string') {
    throw new Error('no audio file in form data')
  }
  // After the narrowing above, audio is the File branch of FormDataEntryValue
  const file = audio as unknown as File
  if (file.size === 0) {
    throw new Error('audio is empty')
  }
  if (file.size > MAX_AUDIO_BYTES) {
    throw new Error('audio too large (max 25 MB)')
  }

  const result = await groq.audio.transcriptions.create({
    file,
    model: STT_MODEL,
    response_format: 'text',
  })

  // When response_format is 'text', the SDK returns the raw string
  return typeof result === 'string' ? result.trim() : (result as { text: string }).text.trim()
}
