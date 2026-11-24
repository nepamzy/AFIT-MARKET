import type { Metadata } from 'next'
import { ButtonLink } from '@/components/ui/button'
import { Card, PageHeader } from '@/components/ui/card'

export const metadata: Metadata = { title: 'Application successful' }
export const dynamic = 'force-dynamic'

/** Shown to a new shop owner right after the e-mail is confirmed: the application is in and the shop is theirs to set up. */
export default function ShopApplied() {
  return (
    <>
      <PageHeader title="Application successful" subtitle="Welcome to your shop on AFIT Market" />
      <Card className="max-w-xl space-y-4">
        <p className="text-lg font-semibold">
          Your email is confirmed and your application has been sent. 🎉
        </p>
        <p>
          Your shop is ready for you to fill in. Sign in to open your shop dashboard and add the
          details that make it yours:
        </p>
        <ul className="list-disc space-y-1 pl-6">
          <li>your shop banner and opening hours</li>
          <li>your items and their prices</li>
          <li>your payout account (this is essential, so we can pay you)</li>
        </ul>
        <p
          role="note"
          className="rounded-[var(--radius-control)] border-l-4 border-gold-500 bg-gold-50 px-3 py-2 font-semibold"
        >
          You can set everything up now, but customers cannot see your shop or order from it until
          we give the final approval. We will email you as soon as that happens.
        </p>
        <ButtonLink href="/login?next=%2Fvendor" variant="gold">
          Sign in to my shop
        </ButtonLink>
      </Card>
    </>
  )
}
