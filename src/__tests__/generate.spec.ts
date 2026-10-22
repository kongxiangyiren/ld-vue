import { describe, expect, it } from 'vitest'
import type { Module, Status } from '@kongxiangyiren/ld-api'

import {
  aspectRatioToSize,
  buildGenerateParams,
  clampSize,
  resolveOutputSize,
  type BuildParamsSettings,
} from '@/utils/generate'

function makeModel(overrides: Partial<Module> = {}): Module {
  return {
    id: 'model-1',
    name: 'Test Model',
    description: '',
    run_on_cpu: true,
    is_sdxl: false,
    is_anima: false,
    dit_kind: 'sd15',
    is_custom: false,
    generation_size: 512,
    defaults: {
      prompt: '',
      negative_prompt: 'lowres',
      steps: 20,
      cfg: 7.5,
      scheduler: 'dpm',
    },
    resolutions: [],
    ...overrides,
  }
}

function makeStatus(overrides: Partial<Status> = {}): Status {
  return {
    serving_model_id: 'model-1',
    state: 'running',
    message: null,
    error_model_id: null,
    width: 512,
    height: 512,
    ...overrides,
  }
}

const settings: BuildParamsSettings = {
  width: 512,
  height: 512,
  aspectRatio: '1:1',
  manualDimensionMode: 'size',
  negativePrompt: 'lowres',
  steps: 20,
  cfg: 7.5,
  seed: null,
  scheduler: 'dpm',
  denoiseStrength: 0.6,
  showProcess: true,
  useOpencl: false,
}

function baseInput(overrides: Partial<Parameters<typeof buildGenerateParams>[0]> = {}) {
  return {
    mode: 'txt2img' as const,
    generationMode: 'auto' as const,
    prompt: '  a cute cat  ',
    settings,
    model: makeModel(),
    status: makeStatus(),
    selection: { width: 512, height: 512 },
    ...overrides,
  }
}

function flat(result: ReturnType<typeof buildGenerateParams>) {
  return result.params as unknown as Record<string, unknown>
}

describe('aspectRatioToSize', () => {
  it('returns 1024 square for 1:1', () => {
    expect(aspectRatioToSize('1:1')).toEqual({ width: 1024, height: 1024 })
  })

  it('keeps 1024 on the long edge and rounds the short edge up to 8', () => {
    expect(aspectRatioToSize('3:4')).toEqual({ width: 768, height: 1024 })
    expect(aspectRatioToSize('16:9')).toEqual({ width: 1024, height: 576 })
    expect(aspectRatioToSize('2:3')).toEqual({ width: 688, height: 1024 })
  })

  it('falls back to 1:1 for invalid ratios', () => {
    expect(aspectRatioToSize('nope')).toEqual({ width: 1024, height: 1024 })
    expect(aspectRatioToSize('0:1')).toEqual({ width: 1024, height: 1024 })
  })
})

describe('clampSize', () => {
  it('rounds to multiples of 8 and clamps to 64..1536', () => {
    expect(clampSize(513)).toBe(512)
    expect(clampSize(65)).toBe(64)
    expect(clampSize(100)).toBe(104)
    expect(clampSize(2000)).toBe(1536)
    expect(clampSize(Number.NaN)).toBe(512)
  })
})

describe('resolveOutputSize', () => {
  it('uses manual size strategy', () => {
    expect(
      resolveOutputSize({
        mode: 'manual',
        model: null,
        status: null,
        selection: null,
        settings: { ...settings, width: 640, height: 384 },
      }),
    ).toEqual({ width: 640, height: 384 })
  })

  it('uses aspect ratio in manual SDXL mode', () => {
    expect(
      resolveOutputSize({
        mode: 'manual',
        model: null,
        status: null,
        selection: null,
        settings: { ...settings, manualDimensionMode: 'aspect', aspectRatio: '16:9' },
      }),
    ).toEqual({ width: 1024, height: 576 })
  })

  it('uses aspect ratio for SDXL models', () => {
    expect(
      resolveOutputSize({
        mode: 'auto',
        model: makeModel({ is_sdxl: true }),
        status: makeStatus(),
        selection: null,
        settings: { ...settings, aspectRatio: '3:4' },
      }),
    ).toEqual({ width: 768, height: 1024 })
  })

  it('uses the loaded NPU resolution', () => {
    expect(
      resolveOutputSize({
        mode: 'auto',
        model: makeModel({ run_on_cpu: false, resolutions: [[640, 480]] }),
        status: makeStatus({ width: 640, height: 480 }),
        selection: null,
        settings,
      }),
    ).toEqual({ width: 640, height: 480 })
  })

  it('falls back to selection then generation_size for NPU models', () => {
    const model = makeModel({ run_on_cpu: false, generation_size: 640, resolutions: [[640, 640]] })
    expect(
      resolveOutputSize({
        mode: 'auto',
        model,
        status: null,
        selection: { width: 768, height: 768 },
        settings,
      }),
    ).toEqual({ width: 768, height: 768 })

    expect(
      resolveOutputSize({ mode: 'auto', model, status: null, selection: null, settings }),
    ).toEqual({ width: 640, height: 640 })
  })

  it('uses settings size for CPU models', () => {
    expect(
      resolveOutputSize({
        mode: 'auto',
        model: makeModel(),
        status: makeStatus(),
        selection: null,
        settings: { ...settings, width: 700, height: 500 },
      }),
    ).toEqual({ width: 704, height: 504 })
  })
})

describe('buildGenerateParams', () => {
  it('builds a txt2img request for a CPU model', () => {
    const result = buildGenerateParams(baseInput())
    const params = flat(result)

    expect(params.prompt).toBe('a cute cat')
    expect(params.negative_prompt).toBe('lowres')
    expect(params.width).toBe(512)
    expect(params.height).toBe(512)
    expect(params.aspect_ratio).toBeUndefined()
    expect(params.show_diffusion_process).toBe(true)
    expect(params.show_diffusion_stride).toBe(3)
    expect(params.use_opencl).toBe(false)
    expect(result.outputSize).toEqual({ width: 512, height: 512 })
  })

  it('omits seed when empty and sends it when set', () => {
    const randomParams = flat(buildGenerateParams(baseInput()))
    expect(randomParams.seed).toBeUndefined()

    const fixedParams = flat(
      buildGenerateParams(baseInput({ settings: { ...settings, seed: 42 } })),
    )
    expect(fixedParams.seed).toBe(42)
  })

  it('uses aspect_ratio only for SDXL', () => {
    const params = flat(
      buildGenerateParams(
        baseInput({
          model: makeModel({ is_sdxl: true }),
          settings: { ...settings, aspectRatio: '3:4' },
        }),
      ),
    )

    expect(params.aspect_ratio).toBe('3:4')
    expect(params.width).toBeUndefined()
    expect(params.height).toBeUndefined()
  })

  it('adds image and denoise strength for img2img', () => {
    const params = flat(
      buildGenerateParams(
        baseInput({
          mode: 'img2img',
          image: 'BASE64IMAGE',
          settings: { ...settings, denoiseStrength: 0.4 },
        }),
      ),
    )

    expect(params.image).toBe('BASE64IMAGE')
    expect(params.denoise_strength).toBe(0.4)
  })

  it('adds image, mask and denoise strength for inpaint', () => {
    const result = buildGenerateParams(
      baseInput({
        mode: 'inpaint',
        image: 'BASE64IMAGE',
        mask: 'BASE64MASK',
        settings: { ...settings, denoiseStrength: 0.55 },
      }),
    )
    const params = flat(result)

    expect(params.image).toBe('BASE64IMAGE')
    expect(params.mask).toBe('BASE64MASK')
    expect(params.denoise_strength).toBe(0.55)
    expect(params.width).toBe(512)
    expect(params.height).toBe(512)
  })

  it('omits the image for txt2img even if one is passed', () => {
    const params = flat(buildGenerateParams(baseInput({ image: 'BASE64IMAGE' })))
    expect(params.image).toBeUndefined()
    expect(params.denoise_strength).toBeUndefined()
  })

  it('supports manual size and aspect strategies', () => {
    const manualSize = flat(
      buildGenerateParams(
        baseInput({
          generationMode: 'manual',
          model: null,
          status: null,
          selection: null,
          settings: { ...settings, width: 768, height: 512 },
        }),
      ),
    )
    expect(manualSize.width).toBe(768)
    expect(manualSize.height).toBe(512)

    const manualAspect = flat(
      buildGenerateParams(
        baseInput({
          generationMode: 'manual',
          model: null,
          status: null,
          selection: null,
          settings: { ...settings, manualDimensionMode: 'aspect', aspectRatio: '9:16' },
        }),
      ),
    )
    expect(manualAspect.aspect_ratio).toBe('9:16')
    expect(manualAspect.width).toBeUndefined()
  })

  it('omits diffusion preview fields when disabled', () => {
    const params = flat(
      buildGenerateParams(baseInput({ settings: { ...settings, showProcess: false } })),
    )
    expect(params.show_diffusion_process).toBeUndefined()
    expect(params.show_diffusion_stride).toBeUndefined()
  })

  it('enables OpenCL only for CPU models in auto mode', () => {
    const cpu = flat(buildGenerateParams(baseInput({ settings: { ...settings, useOpencl: true } })))
    expect(cpu.use_opencl).toBe(true)

    const npu = flat(
      buildGenerateParams(
        baseInput({
          model: makeModel({ run_on_cpu: false, resolutions: [[512, 512]] }),
          settings: { ...settings, useOpencl: true },
        }),
      ),
    )
    expect(npu.use_opencl).toBe(false)

    const manual = flat(
      buildGenerateParams(
        baseInput({
          generationMode: 'manual',
          model: null,
          settings: { ...settings, useOpencl: true },
        }),
      ),
    )
    expect(manual.use_opencl).toBe(true)
  })

  it('uses the NPU locked resolution instead of settings size', () => {
    const params = flat(
      buildGenerateParams(
        baseInput({
          model: makeModel({ run_on_cpu: false, resolutions: [[640, 480]] }),
          status: makeStatus({ width: 640, height: 480 }),
        }),
      ),
    )
    expect(params.width).toBe(640)
    expect(params.height).toBe(480)
  })
})
