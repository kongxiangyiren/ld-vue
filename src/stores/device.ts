import { computed, shallowRef } from 'vue'
import { defineStore } from 'pinia'
import type { Info, Module, Status } from '@kongxiangyiren/ld-api'

import { ldApi, ldDevice } from '@/api/ld'
import { useSettingsStore } from '@/stores/settings'
import { describeError } from '@/utils/error'

export type ApiProbe = 'unknown' | 'checking' | 'ok' | 'fail'
export type DeviceMode = 'checking' | 'auto' | 'manual'

export interface DeviceSelection {
  modelId: string
  width: number
  height: number
}

const PROBE_TIMEOUT_MS = 5000

export const useDeviceStore = defineStore('device', () => {
  const settings = useSettingsStore()

  const info = shallowRef<Info | null>(null)
  const models = shallowRef<Module[]>([])
  const useImg2Img = shallowRef(false)
  const status = shallowRef<Status | null>(null)
  const selection = shallowRef<DeviceSelection | null>(null)
  const loading = shallowRef(false)
  const error = shallowRef<string | null>(null)
  /** 首次 /info 检测是否已完成（成功或失败）。 */
  const checked = shallowRef(false)
  /** 8081 连通性探测，仅用于提示，不阻塞生成。 */
  const probe = shallowRef<ApiProbe>('unknown')

  const connected = computed(() => info.value !== null)
  const mode = computed<DeviceMode>(() => {
    if (!checked.value) return 'checking'
    return info.value ? 'auto' : 'manual'
  })
  const running = computed(() => status.value?.state === 'running')
  const servingModel = computed(
    () => models.value.find((model) => model.id === status.value?.serving_model_id) ?? null,
  )
  const isSdxl = computed(() => servingModel.value?.is_sdxl === true)
  const isNpuLocked = computed(() => {
    const model = servingModel.value
    return model !== null && !model.is_sdxl && model.resolutions.length > 0
  })
  const modelName = computed(() => {
    if (servingModel.value) return servingModel.value.name
    return settings.config.manualModelName.trim() || '自定义模型'
  })

  /** 探测 8081：tokenize 是唯一的轻量只读接口。 */
  async function checkApi(): Promise<void> {
    probe.value = 'checking'
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS)
    try {
      await ldApi.tokenize('probe', controller.signal)
      probe.value = 'ok'
    } catch {
      probe.value = 'fail'
    } finally {
      clearTimeout(timer)
    }
  }

  function markApi(result: 'ok' | 'fail') {
    probe.value = result
  }

  async function refresh(): Promise<void> {
    loading.value = true
    error.value = null
    try {
      const [infoResult, modelsResult, statusResult] = await Promise.all([
        ldDevice.getInfo(),
        ldDevice.getModels(),
        ldDevice.getStatus(),
      ])
      info.value = infoResult
      models.value = modelsResult.models
      useImg2Img.value = modelsResult.use_img2img
      status.value = statusResult

      // 模型处于运行状态时，8081 一定在监听，直接标记生成服务可用。
      if (statusResult.state === 'running') probe.value = 'ok'

      if (statusResult.serving_model_id) {
        selection.value = {
          modelId: statusResult.serving_model_id,
          width: statusResult.width ?? selection.value?.width ?? 512,
          height: statusResult.height ?? selection.value?.height ?? 512,
        }
      }
    } catch (cause) {
      // 8808 不可用：切换到手动模式，只要 8081 可用就能生成。
      info.value = null
      models.value = []
      useImg2Img.value = false
      status.value = null
      selection.value = null
      error.value = describeError(cause, '无法连接设备接口（8808）')
      void checkApi()
    } finally {
      loading.value = false
      checked.value = true
    }
  }

  /** 自动模式下的状态轮询；如果 8808 断开则降级为手动模式。 */
  async function refreshStatus(): Promise<void> {
    if (!info.value) return
    try {
      status.value = await ldDevice.getStatus()
      if (status.value.state === 'running') probe.value = 'ok'
    } catch (cause) {
      info.value = null
      models.value = []
      useImg2Img.value = false
      status.value = null
      selection.value = null
      error.value = describeError(cause, '设备接口已断开（8808）')
      checked.value = true
      void checkApi()
    }
  }

  async function loadModel(modelId: string, width: number, height: number): Promise<boolean> {
    loading.value = true
    error.value = null
    try {
      const result = await ldDevice.selectModel(modelId, width, height)
      if (!result.ok) throw new Error('设备拒绝了模型加载请求')

      selection.value = { modelId, width, height }
      status.value = await ldDevice.getStatus()

      const model = models.value.find((item) => item.id === modelId)
      if (model) settings.applyModelDefaults(model)
      return true
    } catch (cause) {
      error.value = describeError(cause, '加载模型失败，请确认设备接口（8808）可用')
      return false
    } finally {
      loading.value = false
    }
  }

  async function stopModel(): Promise<boolean> {
    const modelId = status.value?.serving_model_id ?? selection.value?.modelId
    if (!modelId) return false

    loading.value = true
    error.value = null
    try {
      const result = await ldDevice.stop(modelId)
      if (!result.ok) throw new Error('设备拒绝了停止请求')
      status.value = await ldDevice.getStatus()
      return true
    } catch (cause) {
      error.value = describeError(cause, '停止模型失败')
      return false
    } finally {
      loading.value = false
    }
  }

  return {
    info,
    models,
    useImg2Img,
    status,
    selection,
    loading,
    error,
    checked,
    probe,
    connected,
    mode,
    running,
    servingModel,
    isSdxl,
    isNpuLocked,
    modelName,
    refresh,
    refreshStatus,
    checkApi,
    markApi,
    loadModel,
    stopModel,
  }
})
