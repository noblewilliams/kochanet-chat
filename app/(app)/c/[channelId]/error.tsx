'use client'
export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="grid h-full place-items-center p-6">
      <div className="max-w-md text-center">
        <h2 className="text-lg font-semibold text-white">Something broke</h2>
        <p className="mt-2 text-sm text-muted">{error.message}</p>
        <button
          onClick={reset}
          className="mt-4 rounded bg-accent px-3 py-1.5 text-sm font-semibold text-bg"
        >
          Try again
        </button>
      </div>
    </div>
  )
}
