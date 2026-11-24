import type { Metadata } from 'next'
import { RiderCodeMaker } from '@/components/domain/rider-code-maker'
import { RiderTeam } from '@/components/domain/rider-team'
import { Card, PageHeader } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/states'
import { Section } from '@/components/ui/section'
import {
  activeRiderCodes,
  getMyVendor,
  listRiderTeam,
} from '@/server/modules/vendors-and-catalogue/vendor-queries'

export const metadata: Metadata = { title: 'My riders' }

export default async function MyRiders() {
  const me = await getMyVendor()
  if (!me) return <EmptyState title="No vendor account yet" />
  const owner = me.staff_role === 'owner'
  // a shop waiting for approval can already add its riders
  const ready = me.status === 'approved' || me.status === 'pending'
  const [team, codes] = ready
    ? await Promise.all([
        listRiderTeam(me.id),
        owner ? activeRiderCodes(me.id) : Promise.resolve([]),
      ])
    : [[], []]
  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Shop', href: '/vendor' }, { label: 'My riders' }]}
        title="My riders"
        subtitle="Your own riders, who deliver only your shop’s orders."
      />
      <Card className="mb-6 space-y-2 text-sm">
        <p>
          <strong>How to add a rider.</strong> Tap <strong>Generate code for a new rider</strong>.
          Give the 6-digit code to the rider. The rider signs up on AFIT Market as a rider and types
          the code on the <strong>last page</strong>, before the account is created. The rider is
          then linked to your shop and appears here. The code works once and lasts 10 minutes.
        </p>
        <p>
          A rider sees and takes only your shop’s orders. For each delivery you can choose which of
          your riders takes it. A shop does not need a rider, but without one customers can only
          pick up. Want to deliver yourself? Sign up as a rider with one of your own codes (or open
          Deliver on AFIT Market in your account and type it there).
        </p>
      </Card>
      {!ready ? (
        <EmptyState title="Not available while your shop is suspended" />
      ) : (
        <div className="space-y-8">
          {owner && (
            <Section id="add" title="Add a rider">
              <RiderCodeMaker vendorId={me.id} active={codes} />
            </Section>
          )}
          <Section id="list" title="Your riders">
            <RiderTeam vendorId={me.id} riders={team} />
          </Section>
        </div>
      )}
    </>
  )
}
