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

/** Bilinear resize of RGBA pixels (up to make a small, soft code bigger; down for a huge photo). */
function resize(data: Uint8ClampedArray, w: number, h: number, nw: number, nh: number) {
  const out = new Uint8ClampedArray(nw * nh * 4)
  const rx = w / nw
  const ry = h / nh
  for (let y = 0; y < nh; y++) {
    const fy = Math.min(h - 1, Math.max(0, (y + 0.5) * ry - 0.5))
    const y0 = Math.floor(fy)
    const y1 = Math.min(h - 1, y0 + 1)
    const ty = fy - y0
    for (let x = 0; x < nw; x++) {
      const fx = Math.min(w - 1, Math.max(0, (x + 0.5) * rx - 0.5))
      const x0 = Math.floor(fx)
      const x1 = Math.min(w - 1, x0 + 1)
      const tx = fx - x0
      for (let c = 0; c < 4; c++) {
        const a = data[(y0 * w + x0) * 4 + c]!
        const b = data[(y0 * w + x1) * 4 + c]!
        const d = data[(y1 * w + x0) * 4 + c]!
        const e = data[(y1 * w + x1) * 4 + c]!
        out[(y * nw + x) * 4 + c] =
          (a * (1 - tx) + b * tx) * (1 - ty) + (d * (1 - tx) + e * tx) * ty
      }
    }
  }
  return { data: out, width: nw, height: nh }
}

/** Reads a code from a piece of the photo, also trying it bigger and smaller: small or soft codes read better enlarged. */
function decodeAtScales(
  decode: typeof jsQRType,
  piece: { data: Uint8ClampedArray; width: number; height: number },
  opts: { inversionAttempts: 'attemptBoth' },
): boolean {
  if (decode(piece.data, piece.width, piece.height, opts)) return true
  const longest = Math.max(piece.width, piece.height)
  const sizes = new Set<number>()
  for (const target of [2400, 1600, 1000, 640]) {
    if (target !== longest && target >= 400 && Math.abs(target - longest) > 80) sizes.add(target)
  }
  for (const target of sizes) {
    const k = target / longest
    const nw = Math.max(60, Math.round(piece.width * k))
    const nh = Math.max(60, Math.round(piece.height * k))
    if (nw * nh > 6_000_000) continue
    const r = resize(piece.data, piece.width, piece.height, nw, nh)
    if (decode(r.data, r.width, r.height, opts)) return true
  }
  return false
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
    if (decodeAtScales(decode, c, opts)) return true
  }
  return decodeAtScales(decode, { data, width, height }, opts)
}
