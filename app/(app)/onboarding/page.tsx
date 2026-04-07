export default function OnboardingPage() {
  return (
    <div className="grid h-full place-items-center p-6">
      <div className="max-w-sm rounded-xl border border-border bg-surface p-6 text-center">
        <div className="text-3xl">👋</div>
        <h2 className="mt-2 text-lg font-semibold text-white">Welcome to Kochanet Chat</h2>
        <p className="mt-2 text-sm text-muted">
          You&apos;re not in any channels yet. Click the{' '}
          <span className="text-accent font-semibold">+</span> in the sidebar to create one,
          then invite teammates.
        </p>
      </div>
    </div>
  )
}
