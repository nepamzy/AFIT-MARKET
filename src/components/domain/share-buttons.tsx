'use client'
import { useState } from 'react'

// Brand marks from Simple Icons (CC0 licence, public domain): https://simpleicons.org
const PATHS = {
  whatsapp:
    'M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z',
  facebook:
    'M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647Z',
  x: 'M14.234 10.162 22.977 0h-2.072l-7.591 8.824L7.251 0H.258l9.168 13.343L.258 24H2.33l8.016-9.318L16.749 24h6.993zm-2.837 3.299-.929-1.329L3.076 1.56h3.182l5.965 8.532.929 1.329 7.754 11.09h-3.182z',
  telegram:
    'M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z',
  tiktok:
    'M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z',
} as const

type Net = keyof typeof PATHS

function Glyph({ net }: { net: Net }) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="currentColor">
      <path d={PATHS[net]} />
    </svg>
  )
}

const BASE =
  'touch-target inline-flex size-11 items-center justify-center rounded-full text-white shadow-sm transition hover:-translate-y-0.5 hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700'

/**
 * "Share" row: WhatsApp, Facebook, X, Telegram and TikTok, plus Copy link. TikTok has no web address for sharing a link, so its
 * button opens the phone's own share sheet (which lists TikTok, Instagram, Snapchat and the rest) and, where the phone has
 * none, copies the link to paste into the app. Colours live in the style sheet (.share-*).
 */
export function ShareButtons({
  url,
  title,
  text,
  heading = 'Share',
}: {
  /** The full address to share, with https://. */
  url: string
  title: string
  text: string
  heading?: string
}) {
  const [note, setNote] = useState('')
  const say = (m: string) => {
    setNote(m)
    setTimeout(() => setNote(''), 3500)
  }
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      return true
    } catch {
      return false
    }
  }
  const native = async (fallbackNote: string) => {
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title, text, url })
      } catch {
        /* the person closed the share sheet */
      }
      return
    }
    say((await copy()) ? fallbackNote : 'Copy the address from the bar above.')
  }
  const u = encodeURIComponent(url)
  const msg = encodeURIComponent(`${text} ${url}`)
  const links: { net: Net; label: string; href: string; cls: string }[] = [
    {
      net: 'whatsapp',
      label: 'Share on WhatsApp',
      href: `https://wa.me/?text=${msg}`,
      cls: 'share-whatsapp',
    },
    {
      net: 'facebook',
      label: 'Share on Facebook',
      href: `https://www.facebook.com/sharer/sharer.php?u=${u}`,
      cls: 'share-facebook',
    },
    {
      net: 'x',
      label: 'Share on X',
      href: `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${u}`,
      cls: 'share-x',
    },
    {
      net: 'telegram',
      label: 'Share on Telegram',
      href: `https://t.me/share/url?url=${u}&text=${encodeURIComponent(text)}`,
      cls: 'share-telegram',
    },
  ]
  return (
    <div className="space-y-2" data-testid="share-buttons">
      <p className="text-sm font-bold text-navy-900">{heading}</p>
      <div className="flex flex-wrap items-center gap-2">
        {links.map((l) => (
          <a
            key={l.net}
            href={l.href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={l.label}
            title={l.label}
            className={`${BASE} ${l.cls}`}
          >
            <Glyph net={l.net} />
          </a>
        ))}
        <button
          type="button"
          aria-label="Share on TikTok"
          title="Share on TikTok"
          className={`${BASE} share-tiktok`}
          onClick={() => void native('Link copied. Paste it in TikTok.')}
        >
          <Glyph net="tiktok" />
        </button>
        <button
          type="button"
          aria-label="Copy link"
          title="Copy link"
          className={`${BASE} share-copy`}
          onClick={async () =>
            say((await copy()) ? 'Link copied.' : 'Copy the address from the bar above.')
          }
        >
          <svg
            viewBox="0 0 24 24"
            width="22"
            height="22"
            aria-hidden="true"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
          </svg>
        </button>
      </div>
      <p role="status" className="min-h-5 text-sm font-medium text-success-700">
        {note}
      </p>
    </div>
  )
}
