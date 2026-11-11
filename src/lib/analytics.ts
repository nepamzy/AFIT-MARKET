/** Android, iPhone/iPad, computer or other, from the browser's own description. Nothing else from it is kept. */
export function deviceOf(ua: string): 'android' | 'ios' | 'desktop' | 'other' {
  if (/android/i.test(ua)) return 'android'
  if (/iphone|ipad|ipod/i.test(ua)) return 'ios'
  if (/windows|macintosh|linux|cros/i.test(ua)) return 'desktop'
  return 'other'
}

/** A short lowercase tag such as `whatsapp`, `flyer` or `direct`. Anything odd becomes `other`. */
export function cleanSource(raw: string | undefined): string {
  const s = (raw ?? '').trim().toLowerCase()
  return /^[a-z0-9_-]{1,40}$/.test(s) ? s : s ? 'other' : 'direct'
}
