'use client'
import { useState } from 'react'

export function SpeakButton({ text }: { text: string }) {
  const [speaking, setSpeaking] = useState(false)

  function speak() {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      alert('Text-to-speech is not supported in this browser.')
      return
    }
    const utter = new SpeechSynthesisUtterance(text)
    utter.rate = 1
    utter.onend = () => setSpeaking(false)
    utter.onerror = () => setSpeaking(false)
    speechSynthesis.cancel()
    speechSynthesis.speak(utter)
    setSpeaking(true)
  }

  function stop() {
    speechSynthesis.cancel()
    setSpeaking(false)
  }

  return (
    <button
      type="button"
      onClick={speaking ? stop : speak}
      aria-label={speaking ? 'Stop reading' : 'Read AI response aloud'}
      className="text-[10px] text-muted hover:text-accent underline"
    >
      {speaking ? '■ stop' : '▶ read aloud'}
    </button>
  )
}
