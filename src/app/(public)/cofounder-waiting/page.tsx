import type { Metadata } from 'next'
import { ButtonLink } from '@/components/ui/button'
import { Card, PageHeader } from '@/components/ui/card'

export const metadata: Metadata = { title: 'Waiting for access', robots: { index: false } }

export default function CofounderWaiting() {
  return (
    <>
      <PageHeader title="Your account is ready" />
      <Card className="max-w-xl space-y-3">
        <p>
          The founder switches on your co-founder access. Once that is done, sign in again and you
          will land in your own area. You can also use AFIT Market as a customer in the meantime.
        </p>
        <ButtonLink href="/products">Browse AFIT Market</ButtonLink>
      </Card>
    </>
  )
}
