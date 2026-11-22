'use client'
import { useRef, useState } from 'react'
import { ActionForm } from '@/components/forms/action-form'
import { Button } from '@/components/ui/button'
import { saveBannerAction } from '@/server/modules/vendors-and-catalogue/actions'

const WIDTH = 1280

/** Shrinks the chosen picture on the device to a wide JPEG, small enough to send on mobile data. */
async function shrink(file: File): Promise<string> {
  const bmp = await createImageBitmap(file)
  const scale = Math.min(1, WIDTH / bmp.width)
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(bmp.width * scale))
  c.height = Math.max(1, Math.round(bmp.height * scale))
  const g = c.getContext('2d')
  if (!g) throw new Error('no canvas')
  g.fillStyle = 'white'
  g.fillRect(0, 0, c.width, c.height)
  g.drawImage(bmp, 0, 0, c.width, c.height)
  for (const q of [0.82, 0.7, 0.55, 0.4]) {
    const url = c.toDataURL('image/jpeg', q)
    if (url.length < 420_000) return url
  }
  return c.toDataURL('image/jpeg', 0.3)
}

/** The shop's banner: choose a picture, see it, save. Without one, a shop picture is drawn for the shop. */
export function BannerField({
  vendorId,
  slug,
  disabled,
}: {
  vendorId: string
  slug: string
  disabled: boolean
}) {
  const [preview, setPreview] = useState<string | null>(null)
  const [remove, setRemove] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const choose = async (file: File | undefined) => {
    setNote(null)
    if (!file) return
    if (!file.type.startsWith('image/'))
      return setNote('Please choose a picture (JPG, PNG or WebP).')
    try {
      setPreview(await shrink(file))
      setRemove(false)
    } catch {
      setNote('We could not read that picture. Try another one.')
    }
  }
  const showing = remove
    ? `/api/vendors/${slug}/banner?fresh&d=1`
    : (preview ?? `/api/vendors/${slug}/banner?fresh`)
  return (
    <ActionForm action={saveBannerAction} submitLabel="Save banner" hideSubmit={disabled}>
      <input type="hidden" name="vendorId" value={vendorId} />
      <input type="hidden" name="banner" value={preview ?? ''} />
      <input type="hidden" name="removeBanner" value={remove ? '1' : ''} />
      <fieldset disabled={disabled} className="space-y-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={showing}
          alt="Your shop banner"
          className="aspect-[16/5] w-full max-w-2xl rounded-[var(--radius-card)] border border-line object-cover"
        />
        <input
          ref={input}
          type="file"
          accept="image/*"
          className="sr-only"
          aria-label="Choose a banner picture"
          onChange={(e) => void choose(e.target.files?.[0])}
        />
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" onClick={() => input.current?.click()}>
            Choose a banner picture
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              setPreview(null)
              setRemove(true)
            }}
          >
            Use the drawn one
          </Button>
        </div>
        <p className="text-sm text-muted">
          A wide picture works best. If you add none, we draw a shop front for you. Press Save
          banner to keep your choice.
        </p>
        {note && (
          <p role="alert" className="font-medium text-danger-700">
            {note}
          </p>
        )}
      </fieldset>
    </ActionForm>
  )
}
