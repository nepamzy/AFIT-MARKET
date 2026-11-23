import type jsQRType from 'jsqr'

/**
 * On the new student ID card the QR code is at the BOTTOM RIGHT of the front. So the search starts there (a tighter and tighter
 * look at the bottom-right part of the photo, which is also where a code is easiest to read when the rest of the card is busy),
 * and only then looks at the whole photo. The same function runs in the browser (instant feedback) and on the server (the check
 * that counts).
 */
const REGIONS: [x0: number, y0: number][] = [
  [0.5, 0.5],
  [0.35, 0.35],
  [0.55, 0.3],
  [0.2, 0.2],
  [0.6, 0.6],
  [0.45, 0.6],
]

function crop(data: Uint8ClampedArray, w: number, h: number, x0: number, y0: number) {
  const sx = Math.floor(w * x0)
  const sy = Math.floor(h * y0)
  const cw = w - sx
  const ch = h - sy
  const out = new Uint8ClampedArray(cw * ch * 4)
  for (let y = 0; y < ch; y++) {
    const from = ((sy + y) * w + sx) * 4
    out.set(data.subarray(from, from + cw * 4), y * cw * 4)
  }
  return { data: out, width: cw, height: ch }
}

export function findQrNearBottomRight(
  decode: typeof jsQRType,
  data: Uint8ClampedArray,
  width: number,
  height: number,
): boolean {
  const opts = { inversionAttempts: 'attemptBoth' as const }
  for (const [x0, y0] of REGIONS) {
    const c = crop(data, width, height, x0, y0)
    if (c.width < 60 || c.height < 60) continue
    if (decode(c.data, c.width, c.height, opts)) return true
  }
  return Boolean(decode(data, width, height, opts))
}
