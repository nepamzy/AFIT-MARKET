import type { Metadata } from 'next'
import { PhoneSettings } from '@/components/domain/phone-settings'
import { PageHeader } from '@/components/ui/card'
import { pushConfig } from '@/server/modules/engagement/push'

export const metadata: Metadata = { title: 'Alerts and location' }

export default function PhonePage() {
  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'My account', href: '/account' }, { label: 'Alerts and location' }]}
        title="Alerts and location"
        subtitle="Turn on phone alerts, get the app, and allow your location."
      />
      <PhoneSettings publicKey={pushConfig()?.publicKey ?? null} />
    </>
  )
}
