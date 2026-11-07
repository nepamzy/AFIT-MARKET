import type { Metadata } from 'next'
import { AddRiderForm, RiderCards } from '@/components/domain/vendor-riders-form'
import { Card, PageHeader } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/states'
import { Section } from '@/components/ui/section'
import {
  getMyVendor,
  listVendorRiders,
} from '@/server/modules/vendors-and-catalogue/vendor-queries'

export const metadata: Metadata = { title: 'My riders' }

export default async function MyRiders() {
  const me = await getMyVendor()
  if (!me) return <EmptyState title="No vendor account yet" />
  const owner = me.staff_role === 'owner'
  const ready = me.status === 'approved'
  const riders = ready ? await listVendorRiders(me.id) : []
  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Shop', href: '/vendor' }, { label: 'My riders' }]}
        title="My riders"
        subtitle="Your own riders, who deliver only your shop’s orders."
      />
      <Card className="mb-6 space-y-2 text-sm">
        <p>
          <strong>How it works.</strong> You create the rider’s account here (name, e-mail, phone).
          You get a temporary password and a one-time <strong>5-digit rider code</strong>, shown
          once.
        </p>
        <p>
          Give the rider the e-mail, the password and the code. When the rider{' '}
          <strong>signs in</strong> and types the code in the “Shop rider code” boxes, the account
          becomes a rider account <strong>linked to your shop</strong>. The code works once and only
          for that account. For another rider, create another account.
        </p>
        <p>
          A rider linked to your shop sees and takes only your shop’s orders. You vouch for them:
          there is no separate administrator approval. Remove a rider at any time and their rider
          access stops.
        </p>
      </Card>
      {!ready ? (
        <EmptyState title="Available once your shop is approved" />
      ) : (
        <div className="space-y-8">
          {owner && (
            <Section id="add" title="Create a rider account">
              <Card>
                <AddRiderForm vendorId={me.id} />
              </Card>
            </Section>
          )}
          <Section id="list" title="Your riders">
            <RiderCards vendorId={me.id} riders={riders} />
          </Section>
        </div>
      )}
    </>
  )
}
