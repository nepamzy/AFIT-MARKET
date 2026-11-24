import { ActionForm } from '@/components/forms/action-form'
import { Checkbox, Input, Textarea } from '@/components/ui/fields'
import { AutoReadyChoice } from '@/components/domain/auto-ready-choice'
import { VendorChoices, type VendorChoicesState } from '@/components/domain/vendor-choices'
import { submitApplicationAction } from '@/server/modules/vendors-and-catalogue/actions'
import type { Category } from '@/server/modules/vendors-and-catalogue/types'

const pct = (bps: number) => `${(bps / 100).toFixed(bps % 100 === 0 ? 0 : 1)}%`

export function ApplicationForm({
  categories,
  commissionBps,
  defaults,
}: {
  categories: Category[]
  commissionBps: number
  /** what the person already chose when signing up */
  defaults?: Partial<VendorChoicesState>
}) {
  return (
    <ActionForm
      action={submitApplicationAction}
      submitLabel="Submit application"
      pendingLabel="Sending…"
    >
      <Input label="Business name" name="businessName" required minLength={2} maxLength={80} />
      <VendorChoices categories={categories} defaults={defaults} showStudentNote askIdCard />
      <Input
        label="Contact phone"
        name="phone"
        type="tel"
        required
        inputMode="tel"
        hint="Used only by administrators to reach you."
      />
      <Textarea
        label="What do you sell?"
        name="description"
        required
        minLength={10}
        maxLength={500}
      />
      <Input
        label="Your delivery fee (₦)"
        name="deliveryFee"
        required
        inputMode="numeric"
        defaultValue="500"
        hint="What you charge for one delivery. The most allowed is ₦500. You can lower it later."
      />
      <Input
        label="Where will customers collect orders?"
        name="pickup"
        required
        minLength={3}
        maxLength={200}
        hint="Describe the pickup spot in words. Do not enter coordinates."
      />
      <AutoReadyChoice />
      <p
        id="commission-terms"
        className="rounded-[var(--radius-control)] bg-brand-50 px-3 py-2 text-sm"
      >
        <strong>Commission:</strong> AFIT Market keeps {pct(commissionBps)} of the total of each
        completed order (items after any product discount, plus the delivery fee when delivery is
        chosen). You can see every order&apos;s commission on your Earnings page. Add your payout
        account there once you are approved: it is where your money is paid.
      </p>
      <Checkbox
        label={`I agree to follow AFIT Market vendor rules, to keep my menu and prices accurate, and to the ${pct(commissionBps)} commission described above.`}
        name="accept"
        aria-describedby="commission-terms"
        required
      />
    </ActionForm>
  )
}
