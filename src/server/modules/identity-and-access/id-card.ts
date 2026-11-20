import 'server-only'
import { createSupabaseServerClient } from '@/lib/supabase/server'

const JPEG_URL = /^data:image\/jpeg;base64,([A-Za-z0-9+/]+={0,2})$/

export type IdCardParse = { ok: true; front: Buffer; back: Buffer } | { ok: false; error: string }

const decode = (v: FormDataEntryValue | null): Buffer | null => {
  const m = JPEG_URL.exec(String(v ?? ''))
  if (!m) return null
  const buf = Buffer.from(m[1]!, 'base64')
  // a real JPEG of a readable card: not tiny, not huge, and starts with the JPEG marker
  if (buf.length < 2000 || buf.length > 650_000 || buf[0] !== 0xff || buf[1] !== 0xd8) return null
  return buf
}

/** The two ID card pictures posted by IdCardFields (already shrunk on the phone). */
export function parseIdCard(fd: FormData): IdCardParse {
  const front = decode(fd.get('idFront'))
  const back = decode(fd.get('idBack'))
  if (!front || !back)
    return {
      ok: false,
      error:
        'Please add both pictures of your AFIT student ID card: the front (with the QR code) and the back (with the writing).',
    }
  return { ok: true, front, back }
}

/** Keeps the applicant's own card. Only the applicant can write it, and only administrators can read it. */
export async function saveIdCard(kind: 'vendor' | 'rider', card: { front: Buffer; back: Buffer }) {
  const sb = await createSupabaseServerClient()
  return sb.rpc('save_my_id_card', {
    p_kind: kind,
    p_front: '\\x' + card.front.toString('hex'),
    p_back: '\\x' + card.back.toString('hex'),
  })
}
