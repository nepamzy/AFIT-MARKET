'use client'
import { useState } from 'react'
import { ActionForm } from '@/components/forms/action-form'
import { Input, Select } from '@/components/ui/fields'
import type { SettingKind } from '@/server/modules/engagement/settings-catalog'
import { setSettingAction } from '@/server/modules/engagement/actions'

/** A friendly editor for one setting: a switch, an amount with its unit, or a choice. Sends the stored value to the database. */
export function SettingEditor({
  settingKey,
  kind,
  value,
}: {
  settingKey: string
  kind: SettingKind
  value: unknown
}) {
  const start =
    kind.type === 'switch'
      ? value === true
      : kind.type === 'naira'
        ? Number(value) / 100
        : kind.type === 'percent'
          ? Number(value) / 100
          : kind.type === 'choice'
            ? String(value)
            : Number(value)
  const [v, setV] = useState<boolean | number | string>(start)
  const stored =
    kind.type === 'switch'
      ? String(v === true)
      : kind.type === 'naira'
        ? String(Math.round(Number(v) * 100))
        : kind.type === 'percent'
          ? String(Math.round(Number(v) * 100))
          : kind.type === 'choice'
            ? JSON.stringify(String(v))
            : String(Math.round(Number(v)))
  return (
    <ActionForm
      action={setSettingAction}
      submitLabel="Save this change"
      pendingLabel="Saving…"
      className="space-y-3"
    >
      <input type="hidden" name="key" value={settingKey} />
      <input type="hidden" name="value" value={stored} />
      {kind.type === 'switch' && (
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Choose">
          {[true, false].map((on) => (
            <button
              key={String(on)}
              type="button"
              role="radio"
              aria-checked={v === on}
              onClick={() => setV(on)}
              className={`touch-target rounded-[var(--radius-control)] border-2 px-4 font-bold ${v === on ? 'border-navy-900 bg-brand-50 text-navy-900' : 'border-line bg-card text-muted'}`}
            >
              {on ? kind.on : kind.off}
            </button>
          ))}
        </div>
      )}
      {(kind.type === 'naira' || kind.type === 'percent' || kind.type === 'number') && (
        <Input
          label={
            kind.type === 'naira'
              ? 'Amount (₦)'
              : kind.type === 'percent'
                ? 'Percent (%)'
                : `Number of ${kind.unit}`
          }
          name="display"
          type="number"
          inputMode="decimal"
          step={kind.type === 'number' ? 1 : 0.01}
          min={0}
          value={String(v)}
          onChange={(e) => setV(e.target.value === '' ? 0 : Number(e.target.value))}
          required
        />
      )}
      {kind.type === 'choice' && (
        <Select
          label="Choose"
          name="display"
          value={String(v)}
          onChange={(e) => setV(e.target.value)}
        >
          {kind.options.map(([val, label]) => (
            <option key={val} value={val}>
              {label}
            </option>
          ))}
        </Select>
      )}
      <Input
        label="Why are you changing it? (at least 10 letters, kept in the record)"
        name="reason"
        defaultValue="Changed by the owner in Settings"
        required
        minLength={10}
        maxLength={500}
      />
    </ActionForm>
  )
}
