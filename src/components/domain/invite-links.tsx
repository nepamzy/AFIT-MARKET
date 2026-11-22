'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'

/** Copy one invitation link, or send it on WhatsApp. */
export function InviteLinkActions({ url, label }: { url: string; label: string | null }) {
  const [copied, setCopied] = useState(false)
  const message = `${label ? `Hello ${label}. ` : ''}You are invited to sell on AFIT Market (beta). This personal link works once: ${url}`
  return (
    <span className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        variant="secondary"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
          } catch {
            /* the link is also shown in full, so it can be copied by hand */
          }
        }}
      >
        {copied ? 'Copied' : 'Copy link'}
      </Button>
      <a
        className="font-semibold text-brand-700 underline"
        href={`https://wa.me/?text=${encodeURIComponent(message)}`}
        target="_blank"
        rel="noopener"
      >
        Send on WhatsApp
      </a>
    </span>
  )
}

/** Every unused link in one box, one per line, ready to copy into a spreadsheet or a message. */
export function CopyAllLinks({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="space-y-2">
      <textarea
        readOnly
        value={text}
        rows={6}
        className="w-full rounded-[var(--radius-control)] border border-line bg-card p-2 font-mono text-xs"
        aria-label="All unused invitation links"
      />
      <Button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(text)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
          } catch {
            /* select the text above and copy it by hand */
          }
        }}
      >
        {copied ? 'Copied' : 'Copy all unused links'}
      </Button>
    </div>
  )
}
