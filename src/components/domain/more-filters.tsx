'use client'

import { useEffect, useRef, type ReactNode } from 'react'

/**
 * The "see all filters" fold. Closed on a phone (so the search stays short), always open on a wide screen.
 * It is a plain <details>, and its inputs are submitted with the form even while it is closed.
 */
export function MoreFilters({
  children,
  defaultOpen,
  label = 'See all filters',
}: {
  children: ReactNode
  defaultOpen: boolean
  label?: string
}) {
  const ref = useRef<HTMLDetailsElement>(null)
  useEffect(() => {
    const wide = window.matchMedia('(min-width: 768px)')
    const sync = () => {
      if (ref.current && wide.matches) ref.current.open = true
    }
    sync()
    wide.addEventListener('change', sync)
    return () => wide.removeEventListener('change', sync)
  }, [])
  return (
    <details ref={ref} open={defaultOpen} className="group col-span-full md:contents">
      <summary className="touch-target flex cursor-pointer list-none items-center gap-1 text-sm font-semibold text-brand-800 md:hidden [&::-webkit-details-marker]:hidden">
        <span className="group-open:hidden">{label}</span>
        <span className="hidden group-open:inline">Show fewer filters</span>
      </summary>
      <div className="mt-3 grid gap-3 md:contents">{children}</div>
    </details>
  )
}
