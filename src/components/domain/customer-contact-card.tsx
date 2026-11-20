import { riderCustomerContact } from '@/server/modules/riders/contact'

/** For the rider: a button to call the customer, and what the customer is wearing so they can be found at the door. */
export async function CustomerContactCard({ assignmentId }: { assignmentId: string }) {
  const c = await riderCustomerContact(assignmentId)
  if (!c) return null
  const tel = c.phone ? c.phone.replace(/[^0-9+]/g, '') : null
  return (
    <div
      className="space-y-1 rounded-[var(--radius-control)] border border-line bg-brand-50 p-3"
      data-testid="customer-contact"
    >
      <p className="font-bold text-navy-900">The customer{c.name ? `: ${c.name}` : ''}</p>
      {tel ? (
        <p>
          <a
            href={`tel:${tel}`}
            className="touch-target inline-flex items-center rounded-full bg-navy-900 px-4 py-2 font-bold text-white"
          >
            📞 Call {c.phone}
          </a>
        </p>
      ) : (
        <p className="text-sm text-muted">No phone number on file for this customer.</p>
      )}
      <p className="text-sm">
        <strong>Wearing:</strong> {c.clothing ?? 'not said'}
      </p>
    </div>
  )
}
