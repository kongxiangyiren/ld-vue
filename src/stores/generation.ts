import { computed, shallowRef, watch } from 'vue'
import { defineStore } from 'pinia'
import type { GenerateImageParams, Scheduler } from '@kongxiangyiren/ld-api'

import { ldApi } from '@/api/ld'
import { usePersistedList } from '@/composables/usePersistedList'
import { useDeviceStore } from '@/stores/device'
import { describeError, isAbortError } from '@/utils/error'
import { previewToDataUrl, rawRgbToDataUrl } from '@/utils/image'
import type { ManualDimensionMode } from '@/utils/generate'
import type { UploadedImage } from '@/utils/upload'

export type GenerationPhase = 'idle' | 'running' | 'error'
export type GenerationMode = 'txt2img' | 'img2img' | 'inpaint'

export interface GenerationSnapshot {
  width: number
  height: number
  aspectRatio: string
  manualDimensionMode: ManualDimensionMode
  denoiseStrength: number
  showProcess: boolean
  useOpencl: boolean
}

/** 图生图参考图；只存 dataURL 与文件名，重做时再拆出 base64。 */
export interface HistoryInputImage {
  dataUrl: string
  name: string
}

export interface HistoryEntry {
  id: string
  dataUrl: string
  prompt: string
  negativePrompt: string
  steps: number
  cfg: number
  seed: number
  scheduler: Scheduler
  width: number
  height: number
  mode: GenerationMode
  modelName: string
  createdAt: number
  generationTimeMs: number
  firstStepTimeMs: number
  snapshot?: GenerationSnapshot
  inputImage?: HistoryInputImage
  /** 局部重画的蒙版（dataURL，白色为重绘区域）。 */
  inputMask?: HistoryInputImage
}

export interface GenerateMeta {
  prompt: string
  negativePrompt: string
  steps: number
  cfg: number
  scheduler: Scheduler
  mode: GenerationMode
  modelName: string
  /** 预期输出尺寸，用于解码扩散过程预览。 */
  outputSize: { width: number; height: number }
  snapshot: GenerationSnapshot
  inputImage?: HistoryInputImage
  inputMask?: HistoryInputImage
}

/** 画廊「重做/局部重画」暂存给生成页的素材。 */
export interface StagedImageInput {
  mode: 'img2img' | 'inpaint'
  image: UploadedImage
  maskDataUrl?: string
}

const MAX_HISTORY = 20

export const useGenerationStore = defineStore('generation', () => {
  const phase = shallowRef<GenerationPhase>('idle')
  const step = shallowRef(0)
  const totalSteps = shallowRef(0)
  const previewUrl = shallowRef<string | null>(null)
  const current = shallowRef<HistoryEntry | null>(null)
  const error = shallowRef<string | null>(null)

  // 生成图片存 IndexedDB，刷新页面后仍可查看；没有 IndexedDB 时退回内存。
  const { data: history, isFinished: historyReady } =
    usePersistedList<HistoryEntry>('ld-vue:history:v1')

  // IndexedDB 读取完成前生成的记录先暂存，等读取完成后合并，避免被初始数据覆盖。
  const pendingHistory = shallowRef<HistoryEntry[]>([])

  watch(historyReady, (ready) => {
    if (!ready || pendingHistory.value.length === 0) return

    const pending = pendingHistory.value
    pendingHistory.value = []
    const existingIds = new Set(history.value.map((entry) => entry.id))
    history.value = [
      ...pending.filter((entry) => !existingIds.has(entry.id)),
      ...history.value,
    ].slice(0, MAX_HISTORY)
  })

  const busy = computed(() => phase.value === 'running')

  /** 画廊「重做 / 局部重画」时暂存素材，由对应生成页挂载时取走。 */
  const stagedInput = shallowRef<StagedImageInput | null>(null)

  function stageInput(input: StagedImageInput) {
    stagedInput.value = input
  }

  function takeStagedInput(): StagedImageInput | null {
    const input = stagedInput.value
    stagedInput.value = null
    return input
  }

  let controller: AbortController | null = null

  function cancel() {
    controller?.abort()
    controller = null
    if (phase.value === 'running') {
      phase.value = 'idle'
      previewUrl.value = null
    }
  }

  async function generate(params: GenerateImageParams, meta: GenerateMeta): Promise<void> {
    cancel()

    const device = useDeviceStore()
    const requestController = new AbortController()
    controller = requestController

    phase.value = 'running'
    step.value = 0
    totalSteps.value = Math.max(1, meta.steps)
    previewUrl.value = null
    current.value = null
    error.value = null

    try {
      const result = await ldApi.generateImage(params, {
        signal: requestController.signal,
        onProgress: (event) => {
          step.value = event.step
          totalSteps.value = event.total_steps || meta.steps
          if (!event.image) return

          const preview = previewToDataUrl(
            event.image,
            event.format,
            meta.outputSize.width,
            meta.outputSize.height,
          )
          if (preview) previewUrl.value = preview
        },
      })

      const entry: HistoryEntry = {
        id: `${Date.now()}-${result.seed}`,
        dataUrl: rawRgbToDataUrl(result.image, result.width, result.height),
        prompt: meta.prompt,
        negativePrompt: meta.negativePrompt,
        steps: meta.steps,
        cfg: meta.cfg,
        seed: result.seed,
        scheduler: meta.scheduler,
        width: result.width,
        height: result.height,
        mode: meta.mode,
        modelName: meta.modelName,
        createdAt: Date.now(),
        generationTimeMs: result.generation_time_ms,
        firstStepTimeMs: result.first_step_time_ms,
        snapshot: meta.snapshot,
        inputImage: meta.inputImage,
        inputMask: meta.inputMask,
      }

      current.value = entry
      if (historyReady.value) {
        history.value = [entry, ...history.value].slice(0, MAX_HISTORY)
      } else {
        pendingHistory.value = [entry, ...pendingHistory.value]
      }
      previewUrl.value = null
      phase.value = 'idle'
      device.markApi('ok')
    } catch (cause) {
      // 用户点了「停止生成」后，不同浏览器可能以 AbortError 或提前结束流的形式报错，
      // 只要本次请求被我们 abort 过，就按取消处理，不显示错误。
      if (requestController.signal.aborted || isAbortError(cause)) {
        phase.value = 'idle'
        previewUrl.value = null
      } else {
        phase.value = 'error'
        error.value = describeError(
          cause,
          '无法连接生成服务（8081），请确认手机与电脑同网段，且已在 App 内选定模型',
        )
        device.markApi('fail')
      }
    } finally {
      if (controller === requestController) controller = null
    }
  }

  /** 从历史记录恢复展示，不重新请求。 */
  function show(entry: HistoryEntry) {
    current.value = entry
    error.value = null
    if (phase.value === 'error') phase.value = 'idle'
  }

  function remove(id: string) {
    history.value = history.value.filter((entry) => entry.id !== id)
  }

  function clearHistory() {
    history.value = []
  }

  return {
    phase,
    step,
    totalSteps,
    previewUrl,
    current,
    history,
    historyReady,
    error,
    busy,
    generate,
    cancel,
    show,
    remove,
    clearHistory,
    stageInput,
    takeStagedInput,
  }
})
