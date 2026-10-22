import { describe, expect, it } from 'vitest'

import { base64ToBytes, encodedImageMime, previewToDataUrl, toRgba } from '@/utils/image'

function bytesToBase64(bytes: number[]): string {
  return btoa(String.fromCharCode(...bytes))
}

describe('base64ToBytes', () => {
  it('decodes base64 bytes', () => {
    expect([...base64ToBytes(bytesToBase64([0, 127, 255]))]).toEqual([0, 127, 255])
  })
})

describe('toRgba', () => {
  it('converts RGB bytes to RGBA with full alpha', () => {
    const rgba = toRgba(new Uint8Array([1, 2, 3, 4, 5, 6]), 2, 1)
    expect([...rgba]).toEqual([1, 2, 3, 255, 4, 5, 6, 255])
  })

  it('rejects mismatched byte lengths and invalid sizes', () => {
    expect(() => toRgba(new Uint8Array([1, 2, 3]), 2, 1)).toThrow('长度')
    expect(() => toRgba(new Uint8Array(), 0, 1)).toThrow('尺寸')
  })
})

describe('encodedImageMime', () => {
  it('detects PNG and JPEG magic prefixes', () => {
    expect(encodedImageMime('iVBORw0KGgoAAAA')).toBe('image/png')
    expect(encodedImageMime('/9j/4AAQSkZJRg==')).toBe('image/jpeg')
    expect(encodedImageMime('AAAAAAAA')).toBeNull()
  })
})

describe('previewToDataUrl', () => {
  it('passes through encoded preview images', () => {
    expect(previewToDataUrl('iVBORw0KGgoAAAA', 'raw', 512, 512)).toBe(
      'data:image/png;base64,iVBORw0KGgoAAAA',
    )
  })

  it('ignores raw previews whose byte length does not match the output size', () => {
    const raw = bytesToBase64([1, 2, 3, 4, 5, 6])
    expect(previewToDataUrl(raw, 'raw', 512, 512)).toBeNull()
  })

  it('ignores unknown formats and empty payloads', () => {
    expect(previewToDataUrl('AAAA', 'png', 1, 1)).toBeNull()
    expect(previewToDataUrl('', 'raw', 1, 1)).toBeNull()
  })
})
