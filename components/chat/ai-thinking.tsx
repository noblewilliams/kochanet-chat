import { thinkingVerbFor } from '@/lib/utils/thinking-verbs'

export function AIThinking({ messageId }: { messageId: string }) {
  const verb = thinkingVerbFor(messageId)
  return (
    <div
      className="mt-1.5 flex items-center gap-2 text-sm italic text-accent"
      aria-label={`AI is ${verb}`}
    >
      <span>{verb}</span>
      <span className="flex gap-1">
        <span className="h-1.5 w-1.5 rounded-full bg-accent pulse-dot" />
        <span
          className="h-1.5 w-1.5 rounded-full bg-accent pulse-dot"
          style={{ animationDelay: '0.2s' }}
        />
        <span
          className="h-1.5 w-1.5 rounded-full bg-accent pulse-dot"
          style={{ animationDelay: '0.4s' }}
        />
      </span>
    </div>
  )
}
