export default function ChannelLoading() {
  return (
    <>
      {/* Header skeleton */}
      <header className="flex items-center justify-between border-b border-border bg-bg-lifted px-5 py-3 md:pl-5 pl-14">
        <div>
          <div className="h-5 w-36 rounded bg-surface animate-pulse" />
          <div className="mt-1.5 h-3 w-16 rounded bg-surface/60 animate-pulse" />
        </div>
        <div className="flex items-center gap-2">
          <div className="h-8 w-20 rounded-md bg-surface animate-pulse" />
          <div className="h-8 w-20 rounded-md bg-surface animate-pulse" />
        </div>
      </header>

      {/* Messages skeleton */}
      <div className="flex-1 overflow-y-auto px-5 py-4">
        <ul className="space-y-3">
          {[0.6, 0.4, 0.8, 0.3, 0.5, 0.7].map((w, i) => (
            <li key={i} className="flex gap-3">
              <div className="h-8 w-8 shrink-0 rounded-full bg-surface animate-pulse" />
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                  <div className="h-3.5 w-16 rounded bg-surface animate-pulse" />
                  <div className="h-2.5 w-12 rounded bg-surface/50 animate-pulse" />
                </div>
                <div
                  className="mt-1.5 h-3.5 rounded bg-surface/60 animate-pulse"
                  style={{ width: `${w * 100}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      </div>

      {/* Static composer shell — matches real composer visually */}
      <div className="border-t border-border bg-bg px-4 py-3 h-[96px] flex flex-col justify-center">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <input
              type="text"
              disabled
              placeholder="Message…"
              className="w-full rounded-lg border border-border bg-surface px-4 text-[14px] text-white placeholder:text-muted h-[44px] disabled:opacity-60"
              style={{ fontSize: '14px' }}
            />
          </div>
          <div className="grid h-[44px] w-[44px] place-items-center rounded-lg bg-accent text-bg opacity-60">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="2" width="6" height="12" rx="3" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
          </div>
          <div className="grid h-[44px] w-[44px] place-items-center rounded-lg bg-accent text-bg opacity-60">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          </div>
        </div>
        <div className="mt-2 flex justify-between text-[10px] text-muted">
          <span>
            <kbd className="text-accent">↵</kbd> send · <kbd className="text-accent">shift+↵</kbd> newline · <kbd className="text-accent">@</kbd> mention
          </span>
        </div>
      </div>
    </>
  )
}
