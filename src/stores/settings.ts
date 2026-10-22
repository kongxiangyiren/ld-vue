import { useLocalStorage } from '@vueuse/core'
import { defineStore } from 'pinia'
import type { Module, Scheduler } from '@kongxiangyiren/ld-api'

import type { ManualDimensionMode } from '@/utils/generate'

export interface Settings {
  prompt: string
  negativePrompt: string
  steps: number
  cfg: number
  seed: number | null
  scheduler: Scheduler
  width: number
  height: number
  aspectRatio: string
  denoiseStrength: number
  showProcess: boolean
  useOpencl: boolean
  /** 8808 不可用时展示的模型名称（不参与请求）。 */
  manualModelName: string
  manualDimensionMode: ManualDimensionMode
}

export const DEFAULT_SETTINGS: Settings = {
  prompt: 'a cute cat sitting on a windowsill, soft morning light, highly detailed',
  negativePrompt:
    'lowres, bad anatomy, bad hands, text, error, missing fingers, extra digit, fewer digits, cropped, worst quality, low quality, jpeg artifacts, signature, watermark, username, blurry',
  steps: 20,
  cfg: 7.5,
  seed: null,
  scheduler: 'dpm',
  width: 512,
  height: 512,
  aspectRatio: '1:1',
  denoiseStrength: 0.6,
  showProcess: true,
  useOpencl: false,
  manualModelName: '自定义模型',
  manualDimensionMode: 'size',
}

export const useSettingsStore = defineStore('settings', () => {
  const config = useLocalStorage<Settings>(
    'ld-vue:settings:v1',
    { ...DEFAULT_SETTINGS },
    {
      mergeDefaults: true,
    },
  )

  // 旧版本用 -1 表示随机；现在随机是「留空」（null），请求里不再发送 seed 字段。
  if (
    config.value.seed !== null &&
    (!Number.isFinite(config.value.seed) || config.value.seed < 0)
  ) {
    config.value.seed = null
  }

  function reset() {
    config.value = { ...DEFAULT_SETTINGS }
  }

  /**
   * 加载模型后应用模型默认参数。
   * 提示词只在模型列表提供了非空默认值时才覆盖（正向、反向分别判断）。
   */
  function applyModelDefaults(model: Module) {
    const { defaults } = model
    if (defaults.prompt.trim()) config.value.prompt = defaults.prompt
    if (defaults.negative_prompt.trim()) config.value.negativePrompt = defaults.negative_prompt
    config.value.steps = defaults.steps
    config.value.cfg = defaults.cfg
    config.value.scheduler = defaults.scheduler
  }

  return { config, reset, applyModelDefaults }
})
