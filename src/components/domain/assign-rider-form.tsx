import { Button } from '@/components/ui/button'
import { assignRiderAction } from '@/server/modules/vendors-and-catalogue/actions'
import type { RiderTeamMember } from '@/server/modules/vendors-and-catalogue/vendor-queries'

/** For a delivery that is ready: the shop chooses which of its riders takes it (or leaves it open to all of them). */
export function AssignRiderForm({
  orderId,
  riders,
  current,
}: {
  orderId: string
  riders: RiderTeamMember[]
  current: string | null | undefined
}) {
  if (riders.length === 0)
    return <p className="text-sm text-muted">No rider yet. Add one under My riders.</p>
  return (
    <form action={assignRiderAction} className="space-y-2" data-testid="assign-rider">
      <input type="hidden" name="orderId" value={orderId} />
      <label className="block text-sm font-semibold" htmlFor={`rider-${orderId}`}>
        Who delivers this?
      </label>
      <select
        id={`rider-${orderId}`}
        name="riderId"
        defaultValue={current ?? ''}
        className="touch-target w-full rounded-[var(--radius-control)] border border-line-strong bg-white px-3"
      >
        <option value="">Any of my riders</option>
        {riders.map((r) => (
          <option key={r.rider_id} value={r.rider_id}>
            {r.name}
            {r.on_shift ? ' (on shift)' : ''}
          </option>
        ))}
      </select>
      <Button type="submit" variant="secondary">
        Save
      </Button>
    </form>
  )
}
