'use client'
import { useState } from 'react'
import { AUTO_READY_CHOICES } from '@/lib/auto-ready'

/**
 * "Automatic ready": the shop ticks the box and picks a time. Orders it has accepted then become "ready" by themselves, counted
 * from the moment the customer paid. Used when applying (onboarding) and later in Shop settings.
 */
export function AutoReadyChoice({
  defaultEnabled = false,
  defaultMinutes = 60,
}: {
  defaultEnabled?: boolean
  defaultMinutes?: number
}) {
  const [on, setOn] = useState(defaultEnabled)
  return (
    <fieldset className="space-y-3 rounded-[var(--radius-control)] border border-line p-4">
      <legend className="px-1 font-bold">Automatic ready (optional)</legend>
      <div className="space-y-1 text-sm">
        <p>
          Switch this on and your orders become <strong>“ready”</strong> by themselves, so you do
          not have to press the button each time. The time is counted from the moment the customer{' '}
          <strong>paid</strong>.
        </p>
        <p>
          <strong>Example:</strong> an order is paid at 12:00 pm and you chose 1 hour. It shows
          “ready” at 1:00 pm. If you accept it after that time, it becomes ready right away.
        </p>
        <p>
          You still <strong>accept or decline</strong> every order yourself. Customers and riders
          are told the order is ready, so only choose a time you can really keep. You can change it
          or switch it off any time in Shop settings.
        </p>
      </div>
      <label className="flex min-h-11 cursor-pointer items-center gap-3">
        <input
          type="checkbox"
          name="autoReady"
          className="size-6"
          checked={on}
          onChange={(e) => setOn(e.target.checked)}
        />
        <span className="font-semibold">Mark my orders ready automatically</span>
      </label>
      {on && (
        <label className="block space-y-1">
          <span className="font-semibold">Ready after</span>
          <select
            name="autoReadyMinutes"
            defaultValue={String(defaultMinutes)}
            className="block min-h-11 w-full rounded-[var(--radius-control)] border-2 border-line-strong bg-white px-3"
          >
            {AUTO_READY_CHOICES.map((c) => (
              <option key={c.minutes} value={c.minutes}>
                {c.label} after payment
              </option>
            ))}
          </select>
        </label>
      )}
    </fieldset>
  )
}
