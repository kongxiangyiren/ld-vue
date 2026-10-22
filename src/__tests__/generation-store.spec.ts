import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { GenerateImageParams, GenerateImageResult } from '@kongxiangyiren/ld-api'

import { ldApi } from '@/api/ld'
import { useGenerationStore, type GenerateMeta } from '@/stores/generation'
import { useDeviceStore } from '@/stores/device'
import { previewToDataUrl, rawRgbToDataUrl } from '@/utils/image'

vi.mock('@/api/ld', () => ({
  ldApi: {
    tokenize: vi.fn<(...args: unknown[]) => unknown>(),
    generateImage: vi.fn<(...args: unknown[]) => unknown>(),
  },
  ldDevice: {
    getInfo: vi.fn<(...args: unknown[]) => unknown>(),
    getModels: vi.fn<(...args: unknown[]) => unknown>(),
    getStatus: vi.fn<(...args: unknown[]) => unknown>(),
    selectModel: vi.fn<(...args: unknown[]) => unknown>(),
    stop: vi.fn<(...args: unknown[]) => unknown>(),
  },
}))

vi.mock('@/utils/image', () => ({
  previewToDataUrl: vi.fn<() => string>(() => 'data:image/png;base64,PREVIEW'),
  rawRgbToDataUrl: vi.fn<() => string>(() => 'data:image/png;base64,RESULT'),
}))

const params: GenerateImageParams = {
  prompt: 'a cat',
  width: 512,
  height: 512,
  show_diffusion_process: true,
}

const meta: GenerateMeta = {
  prompt: 'a cat',
  negativePrompt: 'lowres',
  steps: 20,
  cfg: 7.5,
  scheduler: 'dpm',
  mode: 'txt2img',
  modelName: 'Test Model',
  outputSize: { width: 512, height: 512 },
  snapshot: {
    width: 512,
    height: 512,
    aspectRatio: '1:1',
    manualDimensionMode: 'size',
    denoiseStrength: 0.6,
    showProcess: true,
    useOpencl: false,
  },
}

function completeResult(overrides: Partial<GenerateImageResult> = {}): GenerateImageResult {
  return {
    type: 'complete',
    image: 'RAWRGB',
    seed: 42,
    width: 512,
    height: 512,
    channels: 3,
    format: 'raw',
    generation_time_ms: 4200,
    first_step_time_ms: 380,
    ...overrides,
  }
}

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
  vi.clearAllMocks()
})

describe('useGenerationStore', () => {
  it('streams progress and stores the completed image', async () => {
    vi.mocked(ldApi.generateImage).mockImplementation(async (_params, options) => {
      options?.onProgress?.({
        type: 'progress',
        step: 5,
        total_steps: 20,
        image: 'PREVIEW',
        format: 'raw',
      })
      return completeResult()
    })

    const store = useGenerationStore()
    await store.generate(params, meta)

    expect(store.phase).toBe('idle')
    expect(store.previewUrl).toBeNull()
    expect(store.step).toBe(5)
    expect(store.totalSteps).toBe(20)
    expect(previewToDataUrl).toHaveBeenCalledWith('PREVIEW', 'raw', 512, 512)
    expect(rawRgbToDataUrl).toHaveBeenCalledWith('RAWRGB', 512, 512)

    expect(store.current).toMatchObject({
      dataUrl: 'data:image/png;base64,RESULT',
      seed: 42,
      width: 512,
      height: 512,
      prompt: 'a cat',
      modelName: 'Test Model',
      generationTimeMs: 4200,
      firstStepTimeMs: 380,
    })
    expect(store.history).toHaveLength(1)
    expect(useDeviceStore().probe).toBe('ok')
  })

  it('keeps only the latest 20 images in history', async () => {
    let index = 0
    vi.mocked(ldApi.generateImage).mockImplementation(async () => {
      index += 1
      return completeResult({ seed: index })
    })

    const store = useGenerationStore()
    for (let run = 0; run < 21; run += 1) {
      await store.generate(params, meta)
    }

    expect(store.history).toHaveLength(20)
    expect(store.history[0]?.seed).toBe(21)
    expect(store.history[19]?.seed).toBe(2)
  })

  it('exposes error events and marks the API probe as failed', async () => {
    vi.mocked(ldApi.generateImage).mockRejectedValue({ type: 'error', message: '模型未加载' })

    const store = useGenerationStore()
    await store.generate(params, meta)

    expect(store.phase).toBe('error')
    expect(store.error).toBe('模型未加载')
    expect(store.current).toBeNull()
    expect(store.history).toHaveLength(0)
    expect(useDeviceStore().probe).toBe('fail')
  })

  it('cancels a running generation without an error', async () => {
    vi.mocked(ldApi.generateImage).mockImplementation((_params, options) => {
      return new Promise<GenerateImageResult>((_resolve, reject) => {
        options?.signal?.addEventListener('abort', () => {
          reject(new DOMException('Aborted', 'AbortError'))
        })
      })
    })

    const store = useGenerationStore()
    const pending = store.generate(params, meta)
    await Promise.resolve()

    expect(store.phase).toBe('running')
    store.cancel()
    await pending

    expect(store.phase).toBe('idle')
    expect(store.error).toBeNull()
    expect(store.history).toHaveLength(0)
  })

  it('treats any rejection after cancel as a cancellation', async () => {
    vi.mocked(ldApi.generateImage).mockImplementation((_params, options) => {
      return new Promise<GenerateImageResult>((_resolve, reject) => {
        options?.signal?.addEventListener('abort', () => {
          // 某些浏览器在 abort 后让流正常结束，ld-api 会抛这个普通 Error。
          reject(new Error('Stream ended without completion event'))
        })
      })
    })

    const store = useGenerationStore()
    const pending = store.generate(params, meta)
    await Promise.resolve()

    store.cancel()
    await pending

    expect(store.phase).toBe('idle')
    expect(store.error).toBeNull()
  })

  it('shows a history entry and removes it from the list', async () => {
    vi.mocked(ldApi.generateImage).mockResolvedValue(completeResult())
    const store = useGenerationStore()
    await store.generate(params, meta)

    const entry = store.history[0]
    if (!entry) throw new Error('history entry missing')

    store.remove(entry.id)
    expect(store.history).toHaveLength(0)

    store.show(entry)
    expect(store.current?.id).toBe(entry.id)
  })

  it('reports persisted history readiness and clears all entries', async () => {
    vi.mocked(ldApi.generateImage).mockResolvedValue(completeResult())
    const store = useGenerationStore()
    await store.generate(params, meta)

    expect(store.historyReady).toBe(true)
    expect(store.history).toHaveLength(1)

    store.clearHistory()
    expect(store.history).toHaveLength(0)
  })
})
