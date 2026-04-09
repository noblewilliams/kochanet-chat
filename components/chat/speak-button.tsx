'use client'
import { useState } from 'react'

export function SpeakButton({ text }: { text: string }) {
  const [speaking, setSpeaking] = useState(false)

  function speak() {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return
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
      title={speaking ? 'Stop' : 'Read aloud'}
      className="inline-flex items-center justify-center h-5 w-5 rounded text-muted hover:text-accent cursor-pointer transition-colors align-middle ml-1.5"
    >
      {speaking ? (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="none">
          <rect x="6" y="6" width="12" height="12" rx="1" />
        </svg>
      ) : (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
          <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
        </svg>
      )}
    </button>
  )
}
