'use client'

import { useEffect } from 'react'

function send(kind: 'visit' | 'app_installed' | 'app_opened', source?: string) {
  const data = JSON.stringify({ kind, source })
  try {
    if (navigator.sendBeacon?.('/api/track', new Blob([data], { type: 'application/json' }))) return
  } catch {
    /* fall through to fetch */
  }
  void fetch('/api/track', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: data,
    keepalive: true,
  }).catch(() => {})
}

/** Where the person came from: a ?src= tag on the link (flyer QR, WhatsApp...) or the site that sent them. */
function sourceOf(): string {
  try {
    const tag = new URLSearchParams(location.search).get('src')
    if (tag) return tag
    const host = document.referrer ? new URL(document.referrer).hostname : ''
    if (!host || host === location.hostname) return 'direct'
    if (/whatsapp|wa\.me/.test(host)) return 'whatsapp'
    if (/instagram/.test(host)) return 'instagram'
    if (/tiktok/.test(host)) return 'tiktok'
    if (/facebook|fb\./.test(host)) return 'facebook'
    if (/twitter|x\.com|t\.co/.test(host)) return 'x'
    if (/google|bing|duckduckgo/.test(host)) return 'search'
    return 'other'
  } catch {
    return 'direct'
  }
}

/**
 * Counts one visit per browser session, installs of the app, and opens of the installed app. Uses sessionStorage only
 * (no cookie, nothing that identifies the person). Renders nothing.
 */
export function Tracker() {
  useEffect(() => {
    const once = (key: string, fn: () => void) => {
      try {
        if (sessionStorage.getItem(key)) return
        sessionStorage.setItem(key, '1')
      } catch {
        /* storage blocked: count it anyway, once per page load */
      }
      fn()
    }
    once('afit-visit', () => send('visit', sourceOf()))
    if (window.matchMedia?.('(display-mode: standalone)').matches)
      once('afit-open', () => send('app_opened'))
    const onInstalled = () => send('app_installed')
    window.addEventListener('appinstalled', onInstalled)
    return () => window.removeEventListener('appinstalled', onInstalled)
  }, [])
  return null
}
