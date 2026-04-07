import OpenAI from 'openai'

export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

// gpt-4o-mini for cost on a take-home; swap to 'gpt-4o' for higher quality
export const AI_MODEL = 'gpt-4o-mini'
