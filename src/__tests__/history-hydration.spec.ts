import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick, type Ref } from 'vue'
import type { GenerateImageResult } from '@kongxiangyiren/ld-api'

import { ldApi } from '@/api/ld'
import * as persistedModule from '@/composables/usePersistedList'
import { useGenerationStore, type GenerateMeta, type HistoryEntry } from '@/stores/generation'

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

vi.mock('@/composables/usePersistedList', async () => {
  const { ref } = await import('vue')
  const data = ref<HistoryEntry[]>([])
  const isFinished = ref(false)
  return {
    usePersistedList: () => ({ data, isFinished, set: vi.fn<() => Promise<void>>() }),
    __test: { data, isFinished },
  }
})

const testHooks = (
  persistedModule as unknown as {
    __test: { data: Ref<HistoryEntry[]>; isFinished: Ref<boolean> }
  }
).__test

const meta: GenerateMeta = {
  prompt: 'a cat',
  negativePrompt: '',
  steps: 20,
  cfg: 7.5,
  scheduler: 'dpm',
  mode: 'txt2img',
  modelName: 'Test Model',
  outputSize: { width: 256, height: 256 },
  snapshot: {
    width: 256,
    height: 256,
    aspectRatio: '1:1',
    manualDimensionMode: 'size',
    denoiseStrength: 0.6,
    showProcess: true,
    useOpencl: false,
  },
}

const params = { prompt: 'a cat', width: 256, height: 256, show_diffusion_process: true } as const

function makeEntry(seed: number): HistoryEntry {
  return {
    id: `old-${seed}`,
    dataUrl: 'data:image/png;base64,OLD',
    prompt: 'old',
    negativePrompt: '',
    steps: 20,
    cfg: 7.5,
    seed,
    scheduler: 'dpm',
    width: 256,
    height: 256,
    mode: 'txt2img',
    modelName: 'Test Model',
    createdAt: 1,
    generationTimeMs: 1000,
    firstStepTimeMs: 100,
  }
}

function completeResult(): GenerateImageResult {
  return {
    type: 'complete',
    image: 'RAWRGB',
    seed: 42,
    width: 256,
    height: 256,
    channels: 3,
    format: 'raw',
    generation_time_ms: 2000,
    first_step_time_ms: 200,
  }
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  testHooks.data.value = []
  testHooks.isFinished.value = false
})

describe('generation history hydration', () => {
  it('merges entries generated before IndexedDB finished reading', async () => {
    vi.mocked(ldApi.generateImage).mockResolvedValue(completeResult())

    const store = useGenerationStore()
    await store.generate(params, meta)

    expect(store.current?.seed).toBe(42)
    expect(store.historyReady).toBe(false)
    expect(store.history).toHaveLength(0)

    // IndexedDB 读取完成：旧记录到达，同时把生成期间暂存的新记录合并进来。
    testHooks.data.value = [makeEntry(1)]
    testHooks.isFinished.value = true
    await nextTick()

    expect(store.history.map((entry) => entry.seed)).toEqual([42, 1])
  })
})
