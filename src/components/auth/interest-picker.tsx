'use client'
import { useEffect, useRef, useState } from 'react'
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
        draggable={false}
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

/** How fast a row drifts by itself, in pixels per second. */
const SPEED = 45
/** After a swipe or a drag the row waits this long, then carries on drifting. */
const RESUME_MS = 1600

/**
 * One row of pictures. It drifts sideways by itself (forward, or backward for the second row) and goes on drifting while
 * people tap pictures. A finger swipe or a mouse drag moves it by hand, either way, and it carries on a moment later.
 * The list is shown twice end to end so the loop has no seam; both copies react to taps and share the same picks.
 */
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
  const box = useRef<HTMLDivElement>(null)
  const pos = useRef(0)
  const lastSet = useRef(0)
  const resumeAt = useRef(0)
  const holding = useRef(false)
  const drag = useRef<{ x: number; left: number; moved: boolean } | null>(null)
  const noClick = useRef(false)
  const stopped = useRef(paused)
  useEffect(() => {
    stopped.current = paused
  }, [paused])

  useEffect(() => {
    const el = box.current
    if (!el) return
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const half = () => el.scrollWidth / 2
    const wrap = (v: number) => {
      const h = half()
      if (h <= 0) return v
      if (v >= h) return v - h
      if (v <= 0) return v + h
      return v
    }
    const put = (v: number) => {
      pos.current = wrap(v)
      lastSet.current = pos.current
      el.scrollLeft = pos.current
    }
    // the second row starts in the middle so it can also be swiped the other way at once
    put(reverse ? half() - 1 : 1)
    const onScroll = () => {
      // moved by a hand (a swipe, a drag, the arrow keys), not by us: take over from there and wait a moment
      if (Math.abs(el.scrollLeft - lastSet.current) > 1.5) {
        resumeAt.current = performance.now() + RESUME_MS
        const w = wrap(el.scrollLeft)
        if (w !== el.scrollLeft) put(w)
        else {
          pos.current = el.scrollLeft
          lastSet.current = el.scrollLeft
        }
      }
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    let raf = 0
    let last = performance.now()
    const tick = (t: number) => {
      const dt = Math.min(64, t - last) / 1000
      last = t
      if (!reduced && !stopped.current && !holding.current && t >= resumeAt.current)
        put(pos.current + (reverse ? -1 : 1) * SPEED * dt)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      el.removeEventListener('scroll', onScroll)
    }
  }, [reverse, list.length])

  // a mouse can drag the row; a finger swipes it natively
  const down = (e: React.PointerEvent) => {
    holding.current = true
    if (e.pointerType !== 'mouse') return
    drag.current = { x: e.clientX, left: box.current?.scrollLeft ?? 0, moved: false }
  }
  const move = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d || !box.current) return
    const dx = e.clientX - d.x
    if (Math.abs(dx) > 5) d.moved = true
    if (d.moved) box.current.scrollLeft = d.left - dx
  }
  const up = () => {
    holding.current = false
    if (drag.current?.moved) {
      resumeAt.current = performance.now() + RESUME_MS
      noClick.current = true
      setTimeout(() => (noClick.current = false), 0)
    }
    drag.current = null
  }
  return (
    <div
      ref={box}
      className="afit-marquee py-1.5"
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      onDragStart={(e) => e.preventDefault()}
      onPointerLeave={() => drag.current && up()}
      onClickCapture={(e) => {
        if (noClick.current) {
          e.preventDefault()
          e.stopPropagation()
        }
      }}
    >
      <div className="afit-marquee-track">
        {list.map((c) => (
          <Tile key={c.id} c={c} on={picked.includes(c.id)} toggle={toggle} />
        ))}
        {/* the second copy makes the loop seamless; the keyboard and screen readers only use the first */}
        <span className="flex" aria-hidden="true">
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
