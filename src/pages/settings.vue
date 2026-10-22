<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'

import type { Module } from '@kongxiangyiren/ld-api'

import { useDeviceStore } from '@/stores/device'
import { useGenerationStore } from '@/stores/generation'
import { useSettingsStore } from '@/stores/settings'
import { ASPECT_RATIOS, clampSize } from '@/utils/generate'

const settings = useSettingsStore()
const device = useDeviceStore()
const generation = useGenerationStore()

const selectedModelId = ref('')
const resolutionIndex = ref(0)
const selectedWidth = ref(512)
const selectedHeight = ref(512)
const notice = ref<string | null>(null)

const selectedModel = computed<Module | null>(
  () => device.models.find((model) => model.id === selectedModelId.value) ?? null,
)
const resolutions = computed(() => selectedModel.value?.resolutions ?? [])
const canChangeModel = computed(() => !device.loading && !generation.busy)

const statusText = computed(() => {
  if (!device.checked) return '检测中…'
  if (device.mode === 'manual') return '设备接口不可用，已进入手动模式'

  const state = device.status?.state
  if (state === 'running') {
    return `运行中 · ${device.status?.width ?? '?'} × ${device.status?.height ?? '?'}`
  }
  if (state === 'starting') return '模型加载中…'
  if (state === 'error') return `模型错误：${device.status?.message ?? '未知错误'}`
  return '空闲（未加载模型）'
})

const deviceText = computed(() => {
  if (!device.checked) return '检测中…'
  if (!device.connected) return '不可用（已自动切换手动模式）'
  return '已连接'
})

const probeText = computed(() => {
  if (device.probe === 'checking') return '检测中…'
  if (device.probe === 'ok') return '8081 可用'
  if (device.probe === 'fail') return '8081 无法访问'
  return '未检测'
})

function clampConfigSize(key: 'width' | 'height') {
  settings.config[key] = clampSize(settings.config[key])
}

watch(
  () => device.models,
  (models) => {
    const servingId = device.status?.serving_model_id ?? ''
    if (selectedModelId.value && models.some((model) => model.id === selectedModelId.value)) return
    const firstModel = models[0]
    selectedModelId.value =
      servingId && models.some((model) => model.id === servingId)
        ? servingId
        : (firstModel?.id ?? '')
  },
  { immediate: true },
)

watch(
  [selectedModel, () => device.status],
  ([model]) => {
    if (!model) return

    const list = model.resolutions
    if (list.length === 0) {
      resolutionIndex.value = 0
      selectedWidth.value = model.generation_size
      selectedHeight.value = model.generation_size
      return
    }

    const statusWidth = device.status?.width
    const statusHeight = device.status?.height
    const matchedIndex =
      statusWidth !== null &&
      statusWidth !== undefined &&
      statusHeight !== null &&
      statusHeight !== undefined
        ? list.findIndex(([width, height]) => width === statusWidth && height === statusHeight)
        : -1
    const index = matchedIndex >= 0 ? matchedIndex : 0
    const resolution = list[index]
    resolutionIndex.value = index
    selectedWidth.value = resolution?.[0] ?? model.generation_size
    selectedHeight.value = resolution?.[1] ?? model.generation_size
  },
  { immediate: true },
)

watch(resolutionIndex, (index) => {
  const resolution = resolutions.value[index]
  if (!resolution) return
  selectedWidth.value = resolution[0]
  selectedHeight.value = resolution[1]
})

async function refreshDevice() {
  notice.value = null
  await device.refresh()
  notice.value = device.connected
    ? '设备接口已连接'
    : '设备接口不可用：已进入手动模式，只要 8081 可访问就能生成'
}

async function checkApi() {
  await device.checkApi()
  notice.value = `8081 检测结果：${probeText.value}`
}

async function loadSelectedModel() {
  const model = selectedModel.value
  if (!model) return
  const ok = await device.loadModel(model.id, selectedWidth.value, selectedHeight.value)
  notice.value = ok ? `已请求加载「${model.name}」` : null
}

async function stopServingModel() {
  const ok = await device.stopModel()
  notice.value = ok ? '已停止当前模型' : null
}
</script>

<template>
  <div class="mx-auto w-full max-w-[1180px] px-4 pt-6 pb-10 sm:px-6">
    <header class="mb-4">
      <h1 class="g-title">设备与模型</h1>
      <p class="g-hint mt-1">
        设备互连（8808）提供模型列表与状态；HTTP API（8081）负责生成。8808
        不可用时自动进入手动模式。
      </p>
    </header>

    <div class="mb-4 flex flex-col gap-2">
      <div v-if="notice" class="g-banner g-banner--info" role="status">{{ notice }}</div>
      <div v-if="device.error && device.mode === 'auto'" class="g-banner g-banner--error">
        {{ device.error }}
      </div>
    </div>

    <div class="grid gap-4 lg:grid-cols-2">
      <section class="g-card">
        <h2 class="g-card__title">连接状态</h2>
        <dl class="g-kv">
          <dt>设备接口 8808</dt>
          <dd>{{ deviceText }}</dd>
          <dt>生成服务 8081</dt>
          <dd>{{ probeText }}</dd>
          <dt>模型状态</dt>
          <dd>{{ statusText }}</dd>
          <template v-if="device.info">
            <dt>App</dt>
            <dd>
              {{ device.info.app }} {{ device.info.version }}（协议 {{ device.info.protocol }}）
            </dd>
            <dt>设备</dt>
            <dd>{{ device.info.device }}</dd>
          </template>
        </dl>

        <div class="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            class="g-btn g-btn--secondary"
            :disabled="device.loading"
            @click="refreshDevice"
          >
            刷新连接
          </button>
          <button
            type="button"
            class="g-btn g-btn--secondary"
            :disabled="device.probe === 'checking'"
            @click="checkApi"
          >
            检测 8081
          </button>
        </div>

        <p class="g-hint mt-3">
          8081 只有在 App 内选定模型后才会监听。本地开发在
          <code class="g-code inline-block">vite.config.ts</code> 配置端口；Docker 部署用
          <code class="g-code inline-block">LD_API_8808</code> /
          <code class="g-code inline-block">LD_API_8081</code> 环境变量。
        </p>
      </section>

      <section class="g-card">
        <h2 class="g-card__title">手动模式（仅 8081）</h2>
        <p class="g-hint">
          8808 不可用时自动启用。模型名称只用于页面显示与生成记录，不会发送给后端。
        </p>

        <div class="mt-3 flex flex-col gap-3">
          <div class="g-field">
            <label class="g-label" for="manual-model-name">模型名称</label>
            <input
              id="manual-model-name"
              v-model="settings.config.manualModelName"
              class="g-input"
              type="text"
              maxlength="40"
              placeholder="例如：SD1.5 动漫模型"
            />
          </div>

          <div class="g-field">
            <span class="g-label">尺寸策略</span>
            <div class="g-segmented" role="group" aria-label="手动模式尺寸策略">
              <button
                type="button"
                :class="{ 'is-active': settings.config.manualDimensionMode === 'size' }"
                @click="settings.config.manualDimensionMode = 'size'"
              >
                宽 × 高
              </button>
              <button
                type="button"
                :class="{ 'is-active': settings.config.manualDimensionMode === 'aspect' }"
                @click="settings.config.manualDimensionMode = 'aspect'"
              >
                SDXL 宽高比
              </button>
            </div>
          </div>

          <div v-if="settings.config.manualDimensionMode === 'aspect'" class="g-field">
            <label class="g-label" for="manual-aspect">宽高比</label>
            <select id="manual-aspect" v-model="settings.config.aspectRatio" class="g-select">
              <option v-for="ratio in ASPECT_RATIOS" :key="ratio" :value="ratio">
                {{ ratio }}（长边 1024）
              </option>
            </select>
            <p class="g-hint">SDXL 忽略宽高，长边固定 1024；短边按比例向上取 8 的倍数。</p>
          </div>

          <div v-else class="g-field">
            <span class="g-label">宽 × 高</span>
            <div class="flex items-center gap-2">
              <input
                v-model.number="settings.config.width"
                class="g-input"
                type="number"
                min="64"
                max="1536"
                step="8"
                aria-label="宽度"
                @change="clampConfigSize('width')"
              />
              <span class="g-hint">×</span>
              <input
                v-model.number="settings.config.height"
                class="g-input"
                type="number"
                min="64"
                max="1536"
                step="8"
                aria-label="高度"
                @change="clampConfigSize('height')"
              />
            </div>
            <p class="g-hint">
              必须与手机端模型分辨率一致（NPU 不匹配会报错）；SDXL 请切换到宽高比。
            </p>
          </div>

          <div class="flex flex-wrap items-center gap-2">
            <button
              type="button"
              class="g-btn g-btn--secondary"
              :disabled="device.probe === 'checking'"
              @click="checkApi"
            >
              检测 8081
            </button>
            <span class="g-chip">{{ probeText }}</span>
          </div>
        </div>
      </section>

      <section v-if="device.connected" class="g-card lg:col-span-2">
        <h2 class="g-card__title">设备与模型</h2>

        <div v-if="device.models.length === 0" class="g-banner g-banner--warn">
          设备没有返回可用模型，请先在手机 App 中安装模型。
        </div>

        <template v-else>
          <div class="grid gap-2 sm:grid-cols-2">
            <label
              v-for="model in device.models"
              :key="model.id"
              class="g-model"
              :class="{ 'g-model--active': model.id === selectedModelId }"
            >
              <input
                v-model="selectedModelId"
                class="sr-only"
                type="radio"
                :value="model.id"
                :disabled="!canChangeModel"
              />
              <div class="flex items-start justify-between gap-2">
                <p class="text-sm font-semibold">{{ model.name }}</p>
                <span v-if="model.id === device.status?.serving_model_id" class="g-pill g-pill--ok">
                  当前
                </span>
              </div>
              <p class="g-hint mt-1">{{ model.description || model.id }}</p>
              <div class="g-meta mt-2">
                <span class="g-chip">{{ model.run_on_cpu ? 'CPU' : 'NPU' }}</span>
                <span v-if="model.is_sdxl" class="g-chip">SDXL</span>
                <span v-if="model.is_anima" class="g-chip">Anima</span>
                <span v-if="model.is_custom" class="g-chip">自定义</span>
                <span class="g-chip">{{ model.generation_size }} px</span>
                <span class="g-chip">steps {{ model.defaults.steps }}</span>
                <span class="g-chip">cfg {{ model.defaults.cfg }}</span>
              </div>
            </label>
          </div>

          <div class="mt-3 grid gap-3 sm:grid-cols-2">
            <div v-if="resolutions.length" class="g-field">
              <label class="g-label" for="resolution-select">加载分辨率</label>
              <select
                id="resolution-select"
                v-model.number="resolutionIndex"
                class="g-select"
                :disabled="!canChangeModel"
              >
                <option
                  v-for="(resolution, index) in resolutions"
                  :key="`${resolution[0]}x${resolution[1]}`"
                  :value="index"
                >
                  {{ resolution[0] }} × {{ resolution[1] }}
                </option>
              </select>
              <p class="g-hint">NPU 模式的生成尺寸必须与此一致。</p>
            </div>
            <div v-else class="g-field">
              <span class="g-label">加载分辨率</span>
              <div class="g-input" aria-readonly="true">
                {{ selectedWidth }} × {{ selectedHeight }}
              </div>
              <p class="g-hint">
                该模型使用固定尺寸 {{ selectedModel?.generation_size ?? 512 }} px。
              </p>
            </div>
          </div>

          <div class="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              class="g-btn g-btn--primary"
              :disabled="!selectedModel || !canChangeModel"
              @click="loadSelectedModel"
            >
              加载模型
            </button>
            <button
              type="button"
              class="g-btn g-btn--secondary"
              :disabled="!device.running || !canChangeModel"
              @click="stopServingModel"
            >
              停止模型
            </button>
          </div>

          <p v-if="generation.busy" class="g-hint g-hint--warn mt-2">
            生成过程中不能切换或停止模型。
          </p>
          <p class="g-hint mt-2">
            加载模型会应用该模型的默认提示词（模型列表提供非空值时）与 steps / CFG / 采样器；NPU
            模型切换分辨率需要重新加载。
          </p>
        </template>
      </section>

      <section v-else-if="device.checked" class="g-card lg:col-span-2">
        <h2 class="g-card__title">没有连接设备接口</h2>
        <p class="g-hint">
          8808 不可用不影响生成：在手机 App 内选定模型后，8081
          就会开始监听。此时请在上方手动填写模型名称与尺寸，然后直接到
          <RouterLink to="/">文生图</RouterLink>
          或
          <RouterLink to="/img2img">图生图</RouterLink>
          页生成。
        </p>
        <p class="g-hint mt-2">
          本地开发：若手机只监听本机端口，可在电脑执行
          <code class="g-code inline-block">adb forward tcp:8081 tcp:8081</code>，并把
          <code class="g-code inline-block">vite.config.ts</code> 里的
          <code class="g-code inline-block">LD_API_URL</code>
          改为 <code class="g-code inline-block">http://127.0.0.1:8081</code>。
        </p>
        <p class="g-hint mt-2">
          Docker 部署：把
          <code class="g-code inline-block">LD_API_8081</code> 设为
          <code class="g-code inline-block">host.docker.internal:8081</code>，改完执行
          <code class="g-code inline-block">docker compose up -d</code> 重启容器即可。
        </p>
      </section>
    </div>
  </div>
</template>
