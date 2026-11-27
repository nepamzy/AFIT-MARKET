import type { Metadata } from 'next'
import { SignUpForm } from '@/components/auth/forms'
import { ButtonLink } from '@/components/ui/button'
import { Card, PageHeader } from '@/components/ui/card'
import { checkCofounderInvite } from '@/server/modules/cofounder/signup-link'

export const metadata: Metadata = {
  title: 'Co-founder sign-up',
  robots: { index: false, follow: false },
}
export const dynamic = 'force-dynamic'

/** The co-founder's personal sign-up link. It works once. Nothing is switched on until the founder grants access. */
export default async function CofounderJoin({ params }: { params: Promise<{ token: string }> }) {
  const token = (await params).token
  if (!(await checkCofounderInvite(token)))
    return (
      <>
        <PageHeader title="This link cannot be used" />
        <Card className="max-w-xl space-y-3">
          <p>
            This co-founder sign-up link is missing, already used or cancelled. Ask the founder for
            a new one.
          </p>
          <ButtonLink href="/">Go to AFIT Market</ButtonLink>
        </Card>
      </>
    )
  return (
    <>
      <PageHeader
        title="Co-founder sign-up"
        subtitle="Create your account with your normal details. The founder then switches on your access."
      />
      <Card className="max-w-2xl">
        <SignUpForm cofounderInvite={token} />
      </Card>
    </>
  )
}
