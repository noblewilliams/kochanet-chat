export function EmptyChannel({ channelName }: { channelName: string }) {
  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="max-w-sm text-center">
        {/* Fun illustration: chat bubbles floating */}
        <div className="mx-auto mb-6 w-48 h-40 relative">
          {/* Large bubble */}
          <div className="absolute left-6 top-8 w-28 h-16 rounded-2xl bg-surface/60 border border-border flex items-center justify-center">
            <div className="flex gap-1.5">
              <span className="h-2 w-2 rounded-full bg-accent/40 pulse-dot" />
              <span className="h-2 w-2 rounded-full bg-accent/40 pulse-dot" style={{ animationDelay: '0.2s' }} />
              <span className="h-2 w-2 rounded-full bg-accent/40 pulse-dot" style={{ animationDelay: '0.4s' }} />
            </div>
          </div>
          {/* Small bubble top-right */}
          <div className="absolute right-2 top-0 w-14 h-10 rounded-xl bg-accent/10 border border-accent/20" />
          {/* Small bubble bottom-left */}
          <div className="absolute left-0 bottom-4 w-12 h-8 rounded-xl bg-accent/10 border border-accent/20" />
          {/* Tiny dot accents */}
          <div className="absolute right-8 bottom-0 w-3 h-3 rounded-full bg-accent/20" />
          <div className="absolute right-20 top-2 w-2 h-2 rounded-full bg-accent/15" />
          {/* AI sparkle */}
          <div className="absolute right-0 bottom-12 w-10 h-10 rounded-full bg-gradient-to-br from-accent/20 to-accent-deep/20 border border-accent/30 grid place-items-center text-accent/60 text-sm">
            ✦
          </div>
        </div>

        <h2 className="text-lg font-semibold text-white font-heading">
          Welcome to #{channelName}
        </h2>
        <p className="mt-2 text-sm text-muted leading-relaxed">
          This is the very beginning of the conversation.
          Send a message to get started, or type{' '}
          <span className="text-accent font-medium">@ai</span>{' '}
          to summon the assistant.
        </p>
        <div className="mt-4 flex items-center justify-center gap-4 text-[11px] text-muted">
          <span className="flex items-center gap-1">
            <kbd className="rounded bg-surface px-1.5 py-0.5 text-accent text-[10px]">↵</kbd>
            send
          </span>
          <span className="flex items-center gap-1">
            <kbd className="rounded bg-surface px-1.5 py-0.5 text-accent text-[10px]">@ai</kbd>
            ask AI
          </span>
        </div>
      </div>
    </div>
  )
}
