export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen grid place-items-center p-6">
      <div className="w-full max-w-sm rounded-xl border border-border bg-surface p-6 shadow-2xl">
        <div className="mb-6 text-center">
          <h1 className="text-xl font-bold text-white font-heading">Kochanet Chat</h1>
          <p className="mt-1 text-sm text-muted">Team workspace with an AI teammate</p>
        </div>
        {children}
      </div>
    </main>
  )
}
