'use client'
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { pushWords, usePush } from '@/lib/use-push'

type InstallEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}
type Perm = 'granted' | 'prompt' | 'denied' | 'unknown'

const standalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches ||
  (navigator as unknown as { standalone?: boolean }).standalone === true

/** One place for alerts, the app and location: the same three things for riders, shops and customers. */
export function PhoneSettings({ publicKey }: { publicKey: string | null }) {
  const push = usePush(publicKey)
  const wasInstalled = useSyncExternalStore(
    () => () => undefined,
    () => standalone(),
    () => false,
  )
  const [justInstalled, setInstalled] = useState(false)
  const installed = wasInstalled || justInstalled
  const [prompt, setPrompt] = useState<InstallEvent | null>(null)
  const [perm, setPerm] = useState<Perm>('unknown')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault()
      setPrompt(e as InstallEvent)
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', () => setInstalled(true))
    let status: PermissionStatus | null = null
    void (async () => {
      try {
        status = (await navigator.permissions?.query({ name: 'geolocation' })) ?? null
        if (status) {
          setPerm(status.state as Perm)
          status.onchange = () => status && setPerm(status.state as Perm)
        }
      } catch {
        /* no permissions API: the button just stays */
      }
    })()
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      if (status) status.onchange = null
    }
  }, [])

  const install = useCallback(async () => {
    if (!prompt) {
      setMsg(
        'In your browser menu choose “Add to Home screen” (on iPhone: Share, then “Add to Home Screen”).',
      )
      return
    }
    await prompt.prompt()
    const c = await prompt.userChoice.catch(() => null)
    if (c?.outcome === 'accepted') setInstalled(true)
    setPrompt(null)
  }, [prompt])

  const askLocation = () => {
    setMsg('')
    if (!('geolocation' in navigator)) {
      setMsg('This browser cannot give a location.')
      return
    }
    setBusy(true)
    navigator.geolocation.getCurrentPosition(
      () => {
        setPerm('granted')
        setBusy(false)
      },
      (err) => {
        setPerm(err.code === 1 ? 'denied' : 'prompt')
        setBusy(false)
        // an installed app on some phones cannot show the question: the website in the browser can
        if (err.code === 1 && installed)
          setMsg(
            'The app could not ask for your location. Open the website in your browser to allow it.',
          )
      },
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 0 },
    )
  }
  const openWeb = () => window.open(`${window.location.origin}/account/phone`, '_blank', 'noopener')

  return (
    <div className="space-y-5">
      <Card className="space-y-2">
        <h2 className="text-lg font-extrabold text-navy-900">Phone alerts</h2>
        <p className="text-sm text-muted">
          Get a buzz on this phone when an order moves. {pushWords(push.phase)}.
        </p>
        {push.phase === 'on' ? (
          <Button type="button" variant="secondary" onClick={push.turnOff}>
            Turn off alerts
          </Button>
        ) : push.phase === 'unsupported' || push.phase === 'blocked' ? (
          <p role="status" className="text-sm">
            {pushWords(push.phase)}
          </p>
        ) : (
          <Button
            type="button"
            variant="gold"
            onClick={push.turnOn}
            disabled={push.phase === 'working'}
          >
            Turn on alerts
          </Button>
        )}
        {push.error && (
          <p role="alert" className="text-sm text-danger-700">
            {push.error}
          </p>
        )}
      </Card>
      <Card className="space-y-2">
        <h2 className="text-lg font-extrabold text-navy-900">The app</h2>
        {installed ? (
          <p className="font-semibold">✓ The app is on this phone.</p>
        ) : (
          <Button type="button" variant="gold" onClick={install}>
            Download app
          </Button>
        )}
      </Card>
      <Card className="space-y-2">
        <h2 className="text-lg font-extrabold text-navy-900">Location</h2>
        <p className="text-sm text-muted">
          Riders use this to show where they are; shops and customers only need it for delivery
          screens.
        </p>
        {perm === 'granted' ? (
          <p className="font-semibold">✓ Location is allowed.</p>
        ) : (
          <Button type="button" variant="gold" onClick={askLocation} disabled={busy}>
            {busy ? 'Waiting for your phone…' : '📍 Allow location'}
          </Button>
        )}
        {perm === 'denied' && (
          <p className="rounded-[var(--radius-control)] bg-warning-50 px-3 py-2 text-sm text-warning-700">
            Location is blocked. Tap the lock or settings icon next to the address bar, choose Site
            settings, set Location to Allow, then tap the button again.
          </p>
        )}
        {installed && perm !== 'granted' && (
          <Button type="button" variant="secondary" onClick={openWeb}>
            Open the website in my browser
          </Button>
        )}
        {msg && (
          <p role="status" className="text-sm">
            {msg}
          </p>
        )}
      </Card>
    </div>
  )
}
