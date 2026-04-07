export function Sidebar({ currentUser }: { currentUser: { id: string; name: string } }) {
  return (
    <aside className="w-64 shrink-0 border-r border-border bg-bg-lifted p-4">
      <div className="text-xs uppercase tracking-wide text-muted">Workspace</div>
      <div className="mt-1 font-semibold text-white">Kochanet</div>
      <div className="mt-6 text-xs text-muted">Signed in as</div>
      <div className="text-sm text-accent">{currentUser.name}</div>
    </aside>
  )
}
