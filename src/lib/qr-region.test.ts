import { describe, expect, it, vi } from 'vitest'
import { findQrNearBottomRight } from './qr-region'

const px = (w: number, h: number) => new Uint8ClampedArray(w * h * 4)

describe('findQrNearBottomRight', () => {
  it('looks at the bottom-right part first and stops as soon as a code is found there', () => {
    const decode = vi.fn((_d: Uint8ClampedArray, w: number, h: number) =>
      w < 600 && h < 400 ? ({ data: 'x' } as never) : null,
    )
    expect(findQrNearBottomRight(decode as never, px(800, 500), 800, 500)).toBe(true)
    expect(decode).toHaveBeenCalledTimes(1)
    // the first look is the bottom-right half of the photo
    expect(decode.mock.calls[0]![1]).toBe(400)
    expect(decode.mock.calls[0]![2]).toBe(250)
  })
  it('falls back to the whole photo, and reports no code when there is none anywhere', () => {
    const none = vi.fn(() => null)
    expect(findQrNearBottomRight(none as never, px(800, 500), 800, 500)).toBe(false)
    // every region and the whole photo are tried, each also at other sizes
    expect(none.mock.calls.length).toBeGreaterThanOrEqual(7)
    const onlyWhole = vi.fn((_d: Uint8ClampedArray, w: number) =>
      w === 800 ? ({} as never) : null,
    )
    expect(findQrNearBottomRight(onlyWhole as never, px(800, 500), 800, 500)).toBe(true)
  })
  it('reads a small, soft code by trying it enlarged', () => {
    // nothing is found at the photo's own size; the bottom-right piece reads once it is made bigger
    const onlyBig = vi.fn((_d: Uint8ClampedArray, w: number) => (w >= 1000 ? ({} as never) : null))
    expect(findQrNearBottomRight(onlyBig as never, px(800, 500), 800, 500)).toBe(true)
  })
})
