import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { Models } from '@kongxiangyiren/ld-api'

import { ldApi, ldDevice } from '@/api/ld'
import { useDeviceStore } from '@/stores/device'
import { DEFAULT_SETTINGS, useSettingsStore } from '@/stores/settings'

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

const info = { app: 'localdream' as const, version: '2.8.1', protocol: 1 as const, device: 'Pixel' }

const models: Models = {
  use_img2img: true,
  upscalers: [],
  models: [
    {
      id: 'model-1',
      name: 'Test Model',
      description: '测试模型',
      run_on_cpu: true,
      is_sdxl: false,
      is_anima: false,
      dit_kind: 'sd15',
      is_custom: false,
      generation_size: 512,
      defaults: {
        prompt: '',
        negative_prompt: 'lowres',
        steps: 24,
        cfg: 6,
        scheduler: 'euler_a',
      },
      resolutions: [],
    },
  ],
}

const status = {
  serving_model_id: 'model-1',
  state: 'running' as const,
  message: null,
  error_model_id: null,
  width: 512,
  height: 512,
}

function resolveSuccessfully() {
  vi.mocked(ldDevice.getInfo).mockResolvedValue(info)
  vi.mocked(ldDevice.getModels).mockResolvedValue(models)
  vi.mocked(ldDevice.getStatus).mockResolvedValue(status)
}

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
  vi.clearAllMocks()
})

describe('useDeviceStore', () => {
  it('starts in checking mode and upgrades to auto when 8808 responds', async () => {
    resolveSuccessfully()
    const device = useDeviceStore()

    expect(device.mode).toBe('checking')

    await device.refresh()

    expect(device.mode).toBe('auto')
    expect(device.checked).toBe(true)
    expect(device.connected).toBe(true)
    expect(device.running).toBe(true)
    expect(device.servingModel?.id).toBe('model-1')
    expect(device.modelName).toBe('Test Model')
    expect(device.selection).toEqual({ modelId: 'model-1', width: 512, height: 512 })
  })

  it('falls back to manual mode and probes 8081 when 8808 is unreachable', async () => {
    vi.mocked(ldDevice.getInfo).mockRejectedValue(new TypeError('Failed to fetch'))
    vi.mocked(ldDevice.getModels).mockRejectedValue(new TypeError('Failed to fetch'))
    vi.mocked(ldDevice.getStatus).mockRejectedValue(new TypeError('Failed to fetch'))
    vi.mocked(ldApi.tokenize).mockResolvedValue({ count: 1, max_length: 77, overflow_offset: -1 })

    const device = useDeviceStore()
    await device.refresh()

    expect(device.mode).toBe('manual')
    expect(device.checked).toBe(true)
    expect(device.error).toContain('8808')
    await vi.waitFor(() => expect(device.probe).toBe('ok'))
  })

  it('marks the 8081 probe as failed when tokenize rejects', async () => {
    vi.mocked(ldApi.tokenize).mockRejectedValue(new TypeError('Failed to fetch'))
    const device = useDeviceStore()

    await device.checkApi()

    expect(device.probe).toBe('fail')
  })

  it('loads a model with the requested resolution and applies its defaults', async () => {
    resolveSuccessfully()
    const device = useDeviceStore()
    const settings = useSettingsStore()
    await device.refresh()

    vi.mocked(ldDevice.selectModel).mockResolvedValue({ ok: true })
    const loaded = await device.loadModel('model-1', 640, 480)

    expect(loaded).toBe(true)
    expect(ldDevice.selectModel).toHaveBeenCalledWith('model-1', 640, 480)
    expect(device.selection).toEqual({ modelId: 'model-1', width: 640, height: 480 })
    expect(settings.config.steps).toBe(24)
    expect(settings.config.scheduler).toBe('euler_a')
    // 模型的 prompt 为空时不覆盖用户提示词；反向提示词非空则应用。
    expect(settings.config.prompt).toBe(DEFAULT_SETTINGS.prompt)
    expect(settings.config.negativePrompt).toBe('lowres')
  })

  it('applies model-provided positive and negative prompts when switching models', async () => {
    const baseModel = models.models[0]
    if (!baseModel) throw new Error('test model missing')

    vi.mocked(ldDevice.getInfo).mockResolvedValue(info)
    vi.mocked(ldDevice.getStatus).mockResolvedValue(status)
    vi.mocked(ldDevice.getModels).mockResolvedValue({
      ...models,
      models: [
        {
          ...baseModel,
          defaults: {
            ...baseModel.defaults,
            prompt: 'model sample prompt',
            negative_prompt: 'model bad prompt',
          },
        },
      ],
    })

    const device = useDeviceStore()
    const settings = useSettingsStore()
    await device.refresh()

    settings.config.prompt = 'user prompt'
    settings.config.negativePrompt = 'user negative'
    vi.mocked(ldDevice.selectModel).mockResolvedValue({ ok: true })

    await device.loadModel('model-1', 512, 512)

    expect(settings.config.prompt).toBe('model sample prompt')
    expect(settings.config.negativePrompt).toBe('model bad prompt')
  })

  it('reports a model loading error', async () => {
    resolveSuccessfully()
    const device = useDeviceStore()
    await device.refresh()

    vi.mocked(ldDevice.selectModel).mockResolvedValue({ ok: false })

    const loaded = await device.loadModel('model-1', 512, 512)
    expect(loaded).toBe(false)
    expect(device.error).toContain('拒绝')
  })

  it('stops the serving model', async () => {
    resolveSuccessfully()
    const device = useDeviceStore()
    await device.refresh()

    vi.mocked(ldDevice.stop).mockResolvedValue({ ok: true })
    vi.mocked(ldDevice.getStatus).mockResolvedValue({
      serving_model_id: null,
      state: 'idle',
      message: null,
      error_model_id: null,
      width: null,
      height: null,
    })

    const stopped = await device.stopModel()

    expect(stopped).toBe(true)
    expect(ldDevice.stop).toHaveBeenCalledWith('model-1')
    expect(device.status?.state).toBe('idle')
  })

  it('degrades to manual mode when the status poll loses 8808', async () => {
    resolveSuccessfully()
    const device = useDeviceStore()
    await device.refresh()

    vi.mocked(ldDevice.getStatus).mockRejectedValue(new TypeError('Failed to fetch'))
    vi.mocked(ldApi.tokenize).mockResolvedValue({ count: 1, max_length: 77, overflow_offset: -1 })

    await device.refreshStatus()

    expect(device.mode).toBe('manual')
    expect(device.connected).toBe(false)
    await vi.waitFor(() => expect(device.probe).toBe('ok'))
  })
})
