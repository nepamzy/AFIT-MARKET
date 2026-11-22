import jpeg from 'jpeg-js'
import jsQR from 'jsqr'
import { findQrNearBottomRight } from '@/lib/qr-region'

/** A Nigerian mobile number, typed as 0803 123 4567 or +234 803 123 4567. Returns the number as +234XXXXXXXXXX, or null. */
export function normalizePhone(v: string): string | null {
  const d = v.replace(/[\s()-]/g, '')
  const m = /^(?:\+234|234|0)([789][01]\d{8})$/.exec(d)
  return m ? `+234${m[1]}` : null
}

/**
 * Only the NEW student ID card has a QR code on the front. True when a QR code can be read in this JPEG. Decoded here on the
 * server so it cannot be skipped by editing the page.
 */
export function jpegHasQr(buf: Buffer): boolean {
  try {
    const img = jpeg.decode(buf, { useTArray: true, formatAsRGBA: true, maxMemoryUsageInMB: 256 })
    // the code is at the bottom right of the front: look there first (see qr-region.ts)
    return findQrNearBottomRight(jsQR, new Uint8ClampedArray(img.data), img.width, img.height)
  } catch {
    return false
  }
}
