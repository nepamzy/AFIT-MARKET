'use client'
import { useState } from 'react'

/**
 * A private letter: first a closed envelope with the person's name, then, on a tap, the letter on stationery paper.
 * Plain CSS only (colours are in globals.css); the motion is switched off for people who ask their device for less movement.
 */
export function LetterReveal({
  name,
  title,
  body,
  sender,
}: {
  name: string | null
  title: string | null
  body: string
  sender: string
}) {
  const [open, setOpen] = useState(false)
  const lines = body.split('\n').filter((l) => l.trim() !== '')
  return (
    <div className="letter-wrap mx-auto max-w-xl rounded-[var(--radius-card)] px-4 py-8 sm:px-8">
      {!open ? (
        <div className="flex flex-col items-center text-center">
          <p className="letter-accent text-xs font-bold uppercase tracking-[0.14em]">
            A letter just for you
          </p>
          <div
            className="relative my-6 h-[200px] w-[300px] max-w-full drop-shadow-xl"
            aria-hidden="true"
          >
            <div className="letter-env-body absolute inset-0 rounded-[10px]" />
            <div className="letter-env-flap absolute inset-x-0 top-0 h-[110px] rounded-t-[10px]" />
            <div className="letter-seal absolute left-1/2 top-[92px] flex size-[46px] -translate-x-1/2 items-center justify-center rounded-full text-xl shadow-md">
              ♥
            </div>
            <p className="letter-env-to absolute inset-x-0 bottom-5 font-serif text-base italic">
              {name ? `For ${name}` : 'For you'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="touch-target rounded-full bg-navy-900 px-8 py-3 font-bold text-white hover:bg-navy-800"
          >
            Tap to open
          </button>
          <p className="mt-4 text-sm text-muted">Only you can see this ♥</p>
        </div>
      ) : (
        <article className="letter-paper relative rounded-md px-6 py-7 pl-8 shadow-xl motion-safe:animate-[letter-in_0.6s_ease-out]">
          <span
            className="letter-spine absolute inset-y-0 left-0 w-1.5 rounded-l-md"
            aria-hidden="true"
          />
          <span
            className="letter-accent absolute right-4 top-3 text-lg opacity-70"
            aria-hidden="true"
          >
            ♥ ♡
          </span>
          {title && <h2 className="letter-ink mb-2 font-serif text-xl font-bold">{title}</h2>}
          <p className="letter-accent mb-3 font-serif text-2xl italic">
            {name ? `Dear ${name},` : 'Dear you,'}
          </p>
          <div className="letter-ink font-serif text-[17px] leading-8">
            {lines.map((l, i) => (
              <p key={i}>{l}</p>
            ))}
          </div>
          <p className="letter-accent mt-4 text-right font-serif text-2xl italic">
            &mdash; {sender} ♥
          </p>
        </article>
      )}
    </div>
  )
}
