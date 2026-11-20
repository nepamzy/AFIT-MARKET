import { Analytics } from '@vercel/analytics/next'
import { GoogleTag } from '@/components/analytics/google-tag'
import { Tracker } from '@/components/analytics/tracker'
import type { Metadata, Viewport } from 'next'
import { connection } from 'next/server'
import type { ReactNode } from 'react'
import { OfflineBanner } from '@/components/ui/states'
import { RegisterServiceWorker } from '@/components/register-sw'
import { OrderingNotice } from '@/components/domain/ordering-notice'
import { AppBar } from '@/components/app-bar'
import { PushRebind } from '@/components/push-rebind'
import { NotificationSound } from '@/components/notification-sound'
import { pushConfig } from '@/server/modules/engagement/push'
import { ToastProvider } from '@/components/ui/toast'
import './globals.css'

const SITE = process.env.SITE_URL ?? 'https://afit-market.vercel.app'

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: { default: 'AFIT Market: Shop. Order. Receive.', template: '%s | AFIT Market' },
  description: 'Order from vendors for pickup or delivery.',
  openGraph: {
    type: 'website',
    siteName: 'AFIT Market',
    title: 'AFIT Market: Shop. Order. Receive.',
    description: 'Order from campus vendors for pickup or delivery.',
    locale: 'en_NG',
    images: [
      {
        url: '/brand/share.jpg',
        width: 1200,
        height: 630,
        alt: 'AFIT Market: Shop. Order. Receive.',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AFIT Market',
    description: 'Order from campus vendors for pickup or delivery.',
    images: ['/brand/share.jpg'],
  },
  manifest: '/manifest.webmanifest',
  applicationName: 'AFIT Market',
}
export const viewport: Viewport = { themeColor: '#0b2a5c', width: 'device-width', initialScale: 1 }

export default async function RootLayout({ children }: { children: ReactNode }) {
  await connection() // CSP nonces require per-request (dynamic) rendering
  return (
    <html lang="en-NG">
      <body>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-card focus:px-3 focus:py-2"
        >
          Skip to main content
        </a>
        <OrderingNotice />
        <AppBar publicKey={pushConfig()?.publicKey ?? null} />
        <OfflineBanner />
        <NotificationSound />
        <PushRebind publicKey={pushConfig()?.publicKey ?? null} />
        <RegisterServiceWorker />
        <ToastProvider>{children}</ToastProvider>
        <Analytics />
        <GoogleTag />
        <Tracker />
      </body>
    </html>
  )
}
