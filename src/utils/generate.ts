import type { GenerateImageParams, Module, Scheduler, Status } from '@kongxiangyiren/ld-api'

/** 手动模式（8808 不可用）下的尺寸策略。 */
export type ManualDimensionMode = 'size' | 'aspect'

export interface SchedulerOption {
  value: Scheduler
  label: string
}

export const SCHEDULER_OPTIONS: SchedulerOption[] = [
  { value: 'dpm', label: 'DPM++ 2M' },
  { value: 'dpm_karras', label: 'DPM++ 2M + Karras' },
  { value: 'dpm_sde', label: 'DPM++ 2M SDE' },
  { value: 'dpm_sde_karras', label: 'DPM++ 2M SDE + Karras' },
  { value: 'euler_a', label: 'Euler A' },
  { value: 'euler_a_karras', label: 'Euler A + Karras' },
  { value: 'euler', label: 'Euler' },
  { value: 'euler_karras', label: 'Euler + Karras' },
  { value: 'lcm', label: 'LCM' },
]

export const ASPECT_RATIOS = ['1:1', '4:3', '3:4', '16:9', '9:16', '3:2', '2:3'] as const

/** 每 N 步取一次中间预览，控制手机与局域网的传输量。 */
export const PREVIEW_STRIDE = 3

export function schedulerLabel(value: Scheduler): string {
  return SCHEDULER_OPTIONS.find((option) => option.value === value)?.label ?? value
}

export function toMultipleOf8(value: number): number {
  return Math.max(8, Math.round(Math.max(0, value) / 8) * 8)
}

export function clampSize(value: number): number {
  const size = Number.isFinite(value) ? toMultipleOf8(value) : 512
  return Math.min(1536, Math.max(64, size))
}

export interface OutputSize {
  width: number
  height: number
}

/**
 * SDXL 的 aspect_ratio 规则：长边固定 1024，短边按比例计算后向上取 8 的倍数。
 * @see https://ld-guide.chino.icu/zh/models/sdxl-aspect-ratio
 */
export function aspectRatioToSize(ratio: string): OutputSize {
  const match = /^(\d+):(\d+)$/.exec(ratio.trim())
  if (!match) return { width: 1024, height: 1024 }

  const width = Number(match[1])
  const height = Number(match[2])
  if (!width || !height) return { width: 1024, height: 1024 }
  if (width === height) return { width: 1024, height: 1024 }

  const longEdge = 1024
  const shortEdge =
    Math.ceil((longEdge * Math.min(width, height)) / Math.max(width, height) / 8) * 8
  return width > height
    ? { width: longEdge, height: shortEdge }
    : { width: shortEdge, height: longEdge }
}

export interface OutputSizeSettings {
  width: number
  height: number
  aspectRatio: string
  manualDimensionMode: ManualDimensionMode
}

export interface OutputSizeInput {
  mode: 'auto' | 'manual'
  model: Module | null
  status: Status | null
  selection: { width: number; height: number } | null
  settings: OutputSizeSettings
}

export function resolveOutputSize(input: OutputSizeInput): OutputSize {
  const { mode, model, status, selection, settings } = input

  if (mode === 'manual') {
    return settings.manualDimensionMode === 'aspect'
      ? aspectRatioToSize(settings.aspectRatio)
      : { width: clampSize(settings.width), height: clampSize(settings.height) }
  }

  if (model?.is_sdxl) return aspectRatioToSize(settings.aspectRatio)

  if (model && model.resolutions.length > 0) {
    return {
      width: status?.width ?? selection?.width ?? model.generation_size,
      height: status?.height ?? selection?.height ?? model.generation_size,
    }
  }

  return { width: clampSize(settings.width), height: clampSize(settings.height) }
}

export interface BuildParamsSettings extends OutputSizeSettings {
  negativePrompt: string
  steps: number
  cfg: number
  seed: number | null
  scheduler: Scheduler
  denoiseStrength: number
  showProcess: boolean
  useOpencl: boolean
}

export interface BuildParamsInput {
  mode: 'txt2img' | 'img2img' | 'inpaint'
  generationMode: 'auto' | 'manual'
  prompt: string
  settings: BuildParamsSettings
  model: Module | null
  status: Status | null
  selection: { width: number; height: number } | null
  image?: string
  mask?: string
}

export interface BuiltParams {
  params: GenerateImageParams
  outputSize: OutputSize
}

export function buildGenerateParams(input: BuildParamsInput): BuiltParams {
  const { mode, generationMode, settings, model, status, selection } = input
  const outputSize = resolveOutputSize({
    mode: generationMode,
    model,
    status,
    selection,
    settings,
  })

  const useAspectRatio =
    generationMode === 'manual'
      ? settings.manualDimensionMode === 'aspect'
      : model?.is_sdxl === true

  const useOpencl =
    generationMode === 'manual'
      ? settings.useOpencl
      : model?.run_on_cpu === true && settings.useOpencl

  const base = {
    prompt: input.prompt.trim(),
    negative_prompt: settings.negativePrompt,
    steps: settings.steps,
    cfg: settings.cfg,
    scheduler: settings.scheduler,
    use_opencl: useOpencl,
  }

  // 留空 = 随机：不发送 seed 字段，交给后端随机。
  const seedPart = settings.seed === null ? {} : { seed: settings.seed }

  const diffusion = settings.showProcess
    ? { show_diffusion_process: true as const, show_diffusion_stride: PREVIEW_STRIDE }
    : {}

  const imagePart =
    (mode === 'img2img' || mode === 'inpaint') && input.image
      ? mode === 'inpaint' && input.mask
        ? {
            image: input.image,
            mask: input.mask,
            denoise_strength: settings.denoiseStrength,
          }
        : { image: input.image, denoise_strength: settings.denoiseStrength }
      : {}

  const params = useAspectRatio
    ? { ...base, ...seedPart, aspect_ratio: settings.aspectRatio, ...diffusion, ...imagePart }
    : {
        ...base,
        ...seedPart,
        width: outputSize.width,
        height: outputSize.height,
        ...diffusion,
        ...imagePart,
      }

  // 动态拼装的字段组合无法让 TS 关联判别联合类型；字段已由单测逐分支校验。
  return { params: params as GenerateImageParams, outputSize }
}
