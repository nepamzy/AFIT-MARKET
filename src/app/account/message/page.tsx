import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { LetterReveal } from '@/components/domain/letter-reveal'
import { PageHeader } from '@/components/ui/card'
import { getPrivateLetter, myProfile } from '@/server/modules/customer/queries'

export const metadata: Metadata = { title: 'Message from bestie' }

/**
 * A private letter for one person. The database returns it only to the signed-in owner of the recipient's confirmed
 * email address; everyone else gets the ordinary "not found" page, so the page does not reveal that a letter exists.
 */
export default async function MessagePage() {
  const letter = await getPrivateLetter()
  if (!letter) notFound()
  const profile = await myProfile()
  const first = profile.displayName?.trim().split(/\s+/)[0] || null
  return (
    <>
      <PageHeader
        title="Message from bestie"
        breadcrumbs={[{ label: 'My account', href: '/account' }, { label: 'Message from bestie' }]}
      />
      <LetterReveal name={first} title={letter.title} body={letter.body} sender={letter.sender} />
    </>
  )
}
