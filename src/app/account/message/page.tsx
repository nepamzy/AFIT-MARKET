import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Card, PageHeader } from '@/components/ui/card'
import { getPrivateLetter } from '@/server/modules/customer/queries'

export const metadata: Metadata = { title: 'Message from bestie' }

/**
 * A private letter for one person. The database returns it only to the signed-in owner of the recipient's confirmed
 * email address; everyone else gets the ordinary "not found" page, so the page does not reveal that a letter exists.
 */
export default async function MessagePage() {
  const letter = await getPrivateLetter()
  if (!letter) notFound()
  return (
    <>
      <PageHeader
        title="Message from bestie"
        breadcrumbs={[{ label: 'My account', href: '/account' }, { label: 'Message from bestie' }]}
      />
      <Card className="max-w-2xl space-y-5 p-6 md:p-8">
        {letter.title && <h2 className="text-xl font-bold">{letter.title}</h2>}
        <p className="whitespace-pre-line text-lg leading-relaxed">{letter.body}</p>
        <p className="text-lg font-bold">&mdash; {letter.sender}</p>
      </Card>
    </>
  )
}
