import { describe, expect, it } from 'vitest'

import type { HistoryEntry } from '@/stores/generation'
import { DEFAULT_SETTINGS, type Settings } from '@/stores/settings'
import { applyEntryToSettings, entryMaskImage, entryReferenceImage } from '@/utils/history'

function makeEntry(overrides: Partial<HistoryEntry> = {}): HistoryEntry {
  return {
    id: 'entry-1',
    dataUrl: 'data:image/png;base64,RESULT',
    prompt: 'a cat',
    negativePrompt: 'lowres',
    steps: 28,
    cfg: 6.5,
    seed: 1234,
    scheduler: 'euler_a',
    width: 768,
    height: 1024,
    mode: 'txt2img',
    modelName: 'Test Model',
    createdAt: 1,
    generationTimeMs: 2000,
    firstStepTimeMs: 200,
    ...overrides,
  }
}

function makeSettings(): Settings {
  return { ...DEFAULT_SETTINGS }
}

describe('applyEntryToSettings', () => {
  it('restores prompt and generation parameters', () => {
    const config = makeSettings()
    config.seed = null

    applyEntryToSettings(
      config,
      makeEntry({
        snapshot: {
          width: 640,
          height: 480,
          aspectRatio: '4:3',
          manualDimensionMode: 'aspect',
          denoiseStrength: 0.35,
          showProcess: false,
          useOpencl: true,
        },
      }),
    )

    expect(config.prompt).toBe('a cat')
    expect(config.negativePrompt).toBe('lowres')
    expect(config.steps).toBe(28)
    expect(config.cfg).toBe(6.5)
    expect(config.seed).toBe(1234)
    expect(config.scheduler).toBe('euler_a')
    expect(config.width).toBe(640)
    expect(config.height).toBe(480)
    expect(config.aspectRatio).toBe('4:3')
    expect(config.manualDimensionMode).toBe('aspect')
    expect(config.denoiseStrength).toBe(0.35)
    expect(config.showProcess).toBe(false)
    expect(config.useOpencl).toBe(true)
  })

  it('falls back to the actual output size for entries without a snapshot', () => {
    const config = makeSettings()
    applyEntryToSettings(config, makeEntry({ width: 512, height: 768 }))
    expect(config.width).toBe(512)
    expect(config.height).toBe(768)
  })
})

describe('entryReferenceImage', () => {
  const dataUrl = 'data:image/png;base64,UE5H'

  it('rebuilds the upload model from an img2img history entry', () => {
    const reference = entryReferenceImage(
      makeEntry({ mode: 'img2img', inputImage: { dataUrl, name: 'ref.png' } }),
    )

    expect(reference).toEqual({ base64: 'UE5H', dataUrl, name: 'ref.png' })
  })

  it('rebuilds the base image for inpaint history entries', () => {
    const reference = entryReferenceImage(
      makeEntry({ mode: 'inpaint', inputImage: { dataUrl, name: 'base.png' } }),
    )

    expect(reference?.name).toBe('base.png')
    expect(reference?.base64).toBe('UE5H')
  })

  it('returns null for txt2img or missing images', () => {
    expect(entryReferenceImage(makeEntry())).toBeNull()
    expect(entryReferenceImage(makeEntry({ mode: 'img2img' }))).toBeNull()
  })
})

describe('entryMaskImage', () => {
  const maskUrl = 'data:image/png;base64,TUFTSw=='

  it('returns the saved mask for inpaint entries', () => {
    expect(
      entryMaskImage(
        makeEntry({ mode: 'inpaint', inputMask: { dataUrl: maskUrl, name: 'mask.png' } }),
      ),
    ).toBe(maskUrl)
  })

  it('returns null when the mask belongs to a different mode', () => {
    expect(
      entryMaskImage(
        makeEntry({ mode: 'img2img', inputMask: { dataUrl: maskUrl, name: 'mask.png' } }),
      ),
    ).toBeNull()
  })
})
