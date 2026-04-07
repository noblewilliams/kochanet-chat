export function TypingIndicator({ typers }: { typers: { name: string }[] }) {
  if (typers.length === 0) return <div className="h-4" />
  const names = typers.map((t) => t.name)
  const label =
    names.length === 1
      ? `${names[0]} is typing…`
      : names.length === 2
      ? `${names[0]} and ${names[1]} are typing…`
      : `${names.length} people are typing…`

  return (
    <div className="flex h-4 items-center gap-2 px-5 text-xs text-muted" aria-live="polite">
      <span className="flex gap-1">
        <span className="h-1 w-1 rounded-full bg-accent pulse-dot" />
        <span className="h-1 w-1 rounded-full bg-accent pulse-dot" style={{ animationDelay: '0.2s' }} />
        <span className="h-1 w-1 rounded-full bg-accent pulse-dot" style={{ animationDelay: '0.4s' }} />
      </span>
      <span>{label}</span>
    </div>
  )
}
