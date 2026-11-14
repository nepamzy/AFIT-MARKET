'use client'
import { useEffect } from 'react'
import { keyBytes } from '@/lib/use-push'
import { syncPushSubscriptionAction } from '@/server/modules/engagement/actions'

const KEY = 'afit-push-sync'
const EVERY_MS = 30 * 60_000

/**
 * Keeps this phone's pop-up address tied to whoever is signed in. People use one phone for several accounts (customer,
 * shop, rider); without this the pop-ups kept going to the account that pressed "Turn on" first. It only works once the
 * person has allowed notifications (it never asks), and it quietly makes the address again if the browser lost it.
 */
export function PushRebind({ publicKey }: { publicKey: string | null }) {
  useEffect(() => {
    if (!publicKey) return
    let live = true
    const run = async () => {
      try {
        if (
          !('serviceWorker' in navigator) ||
          !('PushManager' in window) ||
          !('Notification' in window) ||
          Notification.permission !== 'granted'
        )
          return
        const r = await fetch('/api/notifications/latest', { cache: 'no-store' })
        const j = (await r.json()) as { signedIn?: boolean; viewer?: string }
        if (!live || !j.signedIn || !j.viewer) return
        let last: string | null = null
        try {
          last = sessionStorage.getItem(KEY)
        } catch {
          /* storage may be blocked: then we simply sync every time */
        }
        const [who, at] = (last ?? '').split(':')
        if (who === j.viewer && Date.now() - Number(at) < EVERY_MS) return
        const reg =
          (await navigator.serviceWorker.getRegistration('/sw.js')) ??
          (await navigator.serviceWorker.register('/sw.js'))
        await navigator.serviceWorker.ready
        const sub =
          (await reg.pushManager.getSubscription()) ??
          (await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: keyBytes(publicKey),
          }))
        const k = sub.toJSON()
        const res = await syncPushSubscriptionAction({
          endpoint: k.endpoint,
          p256dh: k.keys?.p256dh,
          auth: k.keys?.auth,
        })
        if (res.ok) {
          try {
            sessionStorage.setItem(KEY, `${j.viewer}:${Date.now()}`)
          } catch {
            /* ignore */
          }
        }
      } catch {
        /* the next page load tries again */
      }
    }
    void run()
    const onVisible = () => {
      if (document.visibilityState === 'visible') void run()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      live = false
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [publicKey])
  return null
}
