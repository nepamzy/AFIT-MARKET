'use client'
import { useState } from 'react'
import { artKind, productArtSvg } from '@/lib/art/scenes'
import { cn } from '@/components/ui/cn'
import type { CategoryChoice } from '@/components/domain/vendor-choices'

/** The least a new person must pick before they can go on. Only a reference: nothing is hidden or switched on by it. */
export const MIN_PICKS = 3

const fallback = (c: CategoryChoice) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(productArtSvg(artKind(c.name, c.slug), c.name))}`

function Tile({
  c,
  on,
  toggle,
  hidden = false,
}: {
  c: CategoryChoice
  on: boolean
  toggle: (id: string) => void
  hidden?: boolean
}) {
  const [broken, setBroken] = useState(false)
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-hidden={hidden || undefined}
      tabIndex={hidden ? -1 : undefined}
      onClick={() => toggle(c.id)}
      className={cn(
        'group relative mx-1.5 w-36 shrink-0 overflow-hidden rounded-[var(--radius-card)] border-2 bg-white text-left shadow-[var(--shadow-card)] transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-gold-400/70',
        on ? 'border-brand-700 ring-2 ring-brand-700' : 'border-line hover:border-brand-600',
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={broken ? fallback(c) : `/categories/${c.slug}.webp`}
        alt=""
        width={360}
        height={360}
        loading="lazy"
        decoding="async"
        onError={() => setBroken(true)}
        className="aspect-square w-full object-cover"
      />
      <span className="block px-2 py-1.5 text-sm font-bold leading-tight text-navy-900">
        {c.name}
      </span>
      {on && (
        <span
          aria-hidden="true"
          className="absolute right-1.5 top-1.5 grid size-7 place-items-center rounded-full bg-brand-700 text-sm font-extrabold text-white"
        >
          ✓
        </span>
      )}
    </button>
  )
}

function Row({
  list,
  picked,
  toggle,
  reverse,
  paused,
}: {
  list: CategoryChoice[]
  picked: string[]
  toggle: (id: string) => void
  reverse?: boolean
  paused: boolean
}) {
  // a few seconds per picture, so a long list does not race past
  const style = { ['--afit-marquee-s' as string]: `${Math.max(24, list.length * 6)}s` }
  return (
    <div className="afit-marquee py-1.5" data-paused={paused ? '1' : undefined}>
      <div className="afit-marquee-track" data-reverse={reverse ? '1' : undefined} style={style}>
        {list.map((c) => (
          <Tile key={c.id} c={c} on={picked.includes(c.id)} toggle={toggle} />
        ))}
        {/* a second copy makes the loop seamless; the keyboard and screen readers only use the first */}
        <span className="afit-marquee-copy flex" aria-hidden="true">
          {list.map((c) => (
            <Tile key={c.id} c={c} on={picked.includes(c.id)} toggle={toggle} hidden />
          ))}
        </span>
      </div>
    </div>
  )
}

/**
 * "What would you like to shop?": every live category as a picture, in two rows moving sideways in opposite directions.
 * The list comes from the categories in the database, never from a fixed list here. At least MIN_PICKS must be chosen.
 */
export function InterestPicker({
  categories,
  picked,
  onChange,
}: {
  categories: CategoryChoice[]
  picked: string[]
  onChange: (ids: string[]) => void
}) {
  const [paused, setPaused] = useState(false)
  const toggle = (id: string) =>
    onChange(picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id])
  const top = categories.filter((_, i) => i % 2 === 0)
  const bottom = categories.filter((_, i) => i % 2 === 1)
  const left = Math.max(0, MIN_PICKS - picked.length)
  return (
    <div className="space-y-3" data-testid="interest-picker">
      <p className="text-sm text-muted">
        Tap what you would like to shop. We only use this to know what you like; you can still
        browse everything.
      </p>
      <div className="-mx-4 sm:mx-0">
        <Row list={top} picked={picked} toggle={toggle} paused={paused} />
        {bottom.length > 0 && (
          <Row list={bottom} picked={picked} toggle={toggle} reverse paused={paused} />
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p role="status" className="font-semibold text-navy-900" data-testid="interest-count">
          {left > 0
            ? `Picked ${picked.length}. Pick ${left} more to continue.`
            : `Picked ${picked.length}. You can continue.`}
        </p>
        <button
          type="button"
          onClick={() => setPaused((p) => !p)}
          aria-pressed={paused}
          className="touch-target rounded-[var(--radius-control)] border border-line px-3 text-sm font-semibold text-navy-900 hover:bg-brand-50"
        >
          {paused ? 'Move the pictures' : 'Stop the movement'}
        </button>
      </div>
    </div>
  )
}
