import { ActionForm } from '@/components/forms/action-form'
import { AutoReadyChoice } from '@/components/domain/auto-ready-choice'
import { saveAutoReadyAction } from '@/server/modules/vendors-and-catalogue/actions'

export function AutoReadyForm({
  vendorId,
  enabled,
  minutes,
  disabled,
}: {
  vendorId: string
  enabled: boolean
  minutes: number | null
  disabled: boolean
}) {
  if (disabled) return <p className="text-muted">Available once your shop is approved.</p>
  return (
    <ActionForm action={saveAutoReadyAction} submitLabel="Save" pendingLabel="Saving…">
      <input type="hidden" name="vendorId" value={vendorId} />
      <AutoReadyChoice defaultEnabled={enabled} defaultMinutes={minutes ?? 60} />
    </ActionForm>
  )
}
