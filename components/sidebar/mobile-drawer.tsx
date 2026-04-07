'use client'
import { useState } from 'react'

export function MobileDrawer({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        aria-label="Open navigation"
        onClick={() => setOpen(true)}
        className="md:hidden fixed top-3 left-3 z-30 rounded-lg bg-surface p-2 text-accent"
      >
        ☰
      </button>
      {open && (
        <div className="md:hidden fixed inset-0 z-40 flex" onClick={() => setOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} className="h-full">
            {children}
          </div>
          <div className="flex-1 bg-black/60" />
        </div>
      )}
      <div className="hidden md:block h-full">{children}</div>
    </>
  )
}
