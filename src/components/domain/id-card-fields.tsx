'use client'
import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'

const MAX_SIDE = 1600

/** Shrinks the chosen picture on the device to a JPEG small enough to send on mobile data but still readable. */
async function shrink(file: File): Promise<string> {
  const bmp = await createImageBitmap(file)
  const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height))
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(bmp.width * scale))
  c.height = Math.max(1, Math.round(bmp.height * scale))
  const g = c.getContext('2d')
  if (!g) throw new Error('no canvas')
  g.fillStyle = 'white'
  g.fillRect(0, 0, c.width, c.height)
  g.drawImage(bmp, 0, 0, c.width, c.height)
  for (const q of [0.85, 0.75, 0.62, 0.5]) {
    const url = c.toDataURL('image/jpeg', q)
    if (url.length < 880_000) return url
  }
  return c.toDataURL('image/jpeg', 0.4)
}

function Side({ name, title, hint }: { name: 'idFront' | 'idBack'; title: string; hint: string }) {
  const [data, setData] = useState('')
  const [note, setNote] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const choose = async (file: File | undefined) => {
    setNote(null)
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setNote('Please choose a picture (JPG, PNG or WebP).')
      return
    }
    try {
      setData(await shrink(file))
    } catch {
      setNote('We could not read that picture. Try another one.')
    }
  }
  return (
    <div className="space-y-2">
      <p className="font-semibold">{title}</p>
      <p className="text-sm text-muted">{hint}</p>
      {data ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={data}
          alt={`${title}: preview`}
          className="max-h-48 rounded-[var(--radius-control)] border border-line"
        />
      ) : (
        <div className="grid h-28 place-items-center rounded-[var(--radius-control)] border-2 border-dashed border-line text-sm text-muted">
          No picture yet
        </div>
      )}
      <input type="hidden" name={name} value={data} />
      <input
        ref={input}
        type="file"
        accept="image/*"
        className="sr-only"
        aria-label={title}
        onChange={(e) => void choose(e.target.files?.[0])}
      />
      <Button type="button" variant="secondary" onClick={() => input.current?.click()}>
        {data ? 'Change picture' : 'Take or choose a picture'}
      </Button>
      {note && (
        <p role="alert" className="text-sm font-medium text-danger-700">
          {note}
        </p>
      )}
    </div>
  )
}

/** Two pictures of the new AFIT student ID card. They are sent with the form as idFront and idBack. */
export function IdCardFields() {
  return (
    <fieldset
      className="space-y-4 rounded-[var(--radius-control)] border border-line p-3"
      data-testid="id-card-fields"
    >
      <legend className="px-1 text-sm font-bold text-navy-900">
        Your AFIT student ID card (required)
      </legend>
      <p className="text-sm text-muted">
        Send two clear pictures of your new ID card so an administrator can check you are a student.
        Only administrators can see them.
      </p>
      <Side
        name="idFront"
        title="Front of the card"
        hint="The side with the QR code. Lay the card flat, in good light, with all four corners showing."
      />
      <Side
        name="idBack"
        title="Back of the card"
        hint="The side with the normal writing. Make sure every word can be read."
      />
    </fieldset>
  )
}
