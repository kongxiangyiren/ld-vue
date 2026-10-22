<script setup lang="ts">
import { computed, ref, useTemplateRef, watch } from 'vue'
import { RouterLink, useRouter } from 'vue-router'

import HistoryGallery from '@/components/HistoryGallery.vue'
import ImageStage from '@/components/ImageStage.vue'
import ImageUpload from '@/components/ImageUpload.vue'
import MaskCanvas from '@/components/MaskCanvas.vue'
import ParamPanel from '@/components/ParamPanel.vue'
import PromptField from '@/components/PromptField.vue'
import { useDeviceStore } from '@/stores/device'
import { useGenerationStore, type HistoryEntry } from '@/stores/generation'
import { useSettingsStore } from '@/stores/settings'
import { buildGenerateParams } from '@/utils/generate'
import { applyEntryToSettings, entryMaskImage, entryReferenceImage } from '@/utils/history'
import { getReadiness, type ReadinessTone } from '@/utils/readiness'
import { uploadedImageFromDataUrl, type UploadedImage } from '@/utils/upload'

const props = defineProps<{ mode: 'txt2img' | 'img2img' | 'inpaint' }>()

const settings = useSettingsStore()
const device = useDeviceStore()
const generation = useGenerationStore()
const router = useRouter()

// 画廊「重做/局部重画」进入对应页面时，取走它暂存的素材。
const staged = generation.takeStagedInput()
const upload = ref<UploadedImage | null>(staged?.mode === props.mode ? staged.image : null)
const maskInitial = ref<string | null>(
  staged?.mode === 'inpaint' && props.mode === 'inpaint' ? (staged.maskDataUrl ?? null) : null,
)
const maskReady = ref(false)
const maskCanvasRef = useTemplateRef<{ exportMask: () => string | null }>('maskCanvas')

// 换底图时清掉旧蒙版。
watch(
  () => upload.value?.dataUrl,
  () => {
    maskInitial.value = null
    maskReady.value = false
  },
  { flush: 'sync' },
)

const imageMode = computed(() => props.mode !== 'txt2img')

const title = computed(() => {
  if (props.mode === 'inpaint') return '局部重画'
  if (props.mode === 'img2img') return '图生图'
  return '文生图'
})

const subtitle = computed(() => {
  if (props.mode === 'inpaint') {
    return '上传或选择一张底图，涂抹需要重绘的区域，再用提示词描述新内容。'
  }
  if (props.mode === 'img2img') {
    return '上传参考图，用提示词引导重绘；去噪强度越高，变化越大。'
  }
  return '输入提示词，由手机端模型本地生成；可实时查看扩散进度。'
})

const readiness = computed(() =>
  getReadiness({
    mode: device.mode,
    status: device.status,
    busy: generation.busy,
    prompt: settings.config.prompt,
  }),
)

const imageModeUnsupported = computed(
  () => imageMode.value && device.mode === 'auto' && device.checked && !device.useImg2Img,
)

const uploadMissing = computed(() => imageMode.value && upload.value === null)
const maskMissing = computed(() => props.mode === 'inpaint' && (!upload.value || !maskReady.value))

const canGenerate = computed(
  () =>
    readiness.value.canGenerate &&
    !imageModeUnsupported.value &&
    !uploadMissing.value &&
    !maskMissing.value,
)

interface Notice {
  tone: ReadinessTone
  text: string
  settingsLink: boolean
}

const notice = computed<Notice | null>(() => {
  if (imageModeUnsupported.value) {
    return {
      tone: 'error',
      text:
        props.mode === 'inpaint'
          ? '当前模型不支持图生图/局部重画（use_img2img = false），请换用支持的模型。'
          : '当前模型不支持图生图（use_img2img = false），请换用支持图生图的模型。',
      settingsLink: true,
    }
  }

  const message = readiness.value.message
  if (!message) return null

  return {
    tone: readiness.value.tone,
    text: message,
    settingsLink: readiness.value.action === 'settings',
  }
})

const probeText = computed(() => {
  if (device.probe === 'checking') return '正在检测 8081…'
  if (device.probe === 'ok') return '8081 已就绪'
  if (device.probe === 'fail') return '8081 未确认（仍可直接尝试生成）'
  return '尚未检测 8081'
})

async function startGeneration() {
  if (!canGenerate.value) return

  const maskDataUrl = props.mode === 'inpaint' ? (maskCanvasRef.value?.exportMask() ?? null) : null
  if (props.mode === 'inpaint' && !maskDataUrl) return

  const maskBase64 = maskDataUrl ? maskDataUrl.slice(maskDataUrl.indexOf(',') + 1) : undefined

  const { params, outputSize } = buildGenerateParams({
    mode: props.mode,
    generationMode: device.mode === 'auto' ? 'auto' : 'manual',
    prompt: settings.config.prompt,
    settings: settings.config,
    model: device.servingModel,
    status: device.status,
    selection: device.selection,
    image: imageMode.value ? upload.value?.base64 : undefined,
    mask: maskBase64,
  })

  await generation.generate(params, {
    prompt: settings.config.prompt.trim(),
    negativePrompt: settings.config.negativePrompt,
    steps: settings.config.steps,
    cfg: settings.config.cfg,
    scheduler: settings.config.scheduler,
    mode: props.mode,
    modelName: device.modelName,
    outputSize,
    snapshot: {
      width: settings.config.width,
      height: settings.config.height,
      aspectRatio: settings.config.aspectRatio,
      manualDimensionMode: settings.config.manualDimensionMode,
      denoiseStrength: settings.config.denoiseStrength,
      showProcess: settings.config.showProcess,
      useOpencl: settings.config.useOpencl,
    },
    inputImage: upload.value
      ? { dataUrl: upload.value.dataUrl, name: upload.value.name }
      : undefined,
    inputMask: maskDataUrl ? { dataUrl: maskDataUrl, name: 'mask.png' } : undefined,
  })
}

function applyHistory(entry: HistoryEntry) {
  applyEntryToSettings(settings.config, entry)

  if (entry.mode === props.mode && imageMode.value) {
    const reference = entryReferenceImage(entry)
    if (reference) {
      upload.value = reference
      maskInitial.value = entryMaskImage(entry)
      maskReady.value = false
    }
  }

  generation.show(entry)
}

function clearSource() {
  upload.value = null
  maskInitial.value = null
  maskReady.value = false
}

function useCurrentResult() {
  const entry = generation.current
  if (!entry) return
  const image = uploadedImageFromDataUrl(entry.dataUrl, '当前结果.png')
  if (!image) return
  upload.value = image
  maskInitial.value = null
  maskReady.value = false
}

function startInpaintFromCurrent() {
  const entry = generation.current
  if (!entry) return
  const image = uploadedImageFromDataUrl(entry.dataUrl, '当前结果.png')
  if (!image) return
  generation.stageInput({ mode: 'inpaint', image })
  void router.push('/inpaint')
}

function useSeed(seed: number) {
  settings.config.seed = seed
}

function clearHistory() {
  if (window.confirm('清空本机保存的全部生成记录？')) generation.clearHistory()
}
</script>

<template>
  <div class="mx-auto w-full max-w-[1180px] px-4 pt-6 pb-10 sm:px-6">
    <div class="mb-4 flex flex-wrap items-end justify-between gap-2">
      <div>
        <h1 class="g-title">{{ title }}</h1>
        <p class="g-hint mt-1">{{ subtitle }}</p>
      </div>
      <p class="g-hint">当前模型：{{ device.modelName }}</p>
    </div>

    <div class="flex flex-col gap-2">
      <div v-if="device.mode === 'manual'" class="g-banner g-banner--info">
        <div class="flex flex-1 flex-col gap-1">
          <p>未连接设备接口（8808），已进入手动模式：直接调用 8081 生成。</p>
          <p class="g-hint">
            模型名「{{ device.modelName }}」与尺寸策略可在
            <RouterLink to="/settings">设备与模型</RouterLink>
            修改；{{ probeText }}。
          </p>
        </div>
        <button
          type="button"
          class="g-btn g-btn--ghost g-btn--sm"
          :disabled="device.probe === 'checking'"
          @click="device.checkApi()"
        >
          检测 8081
        </button>
      </div>

      <div v-if="notice" class="g-banner" :class="`g-banner--${notice.tone}`" role="status">
        <span class="flex-1">{{ notice.text }}</span>
        <RouterLink v-if="notice.settingsLink" to="/settings" class="g-btn g-btn--ghost g-btn--sm">
          去设置
        </RouterLink>
      </div>
    </div>

    <div class="mt-4 grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <div class="flex flex-col gap-4">
        <section v-if="mode === 'img2img'" class="g-card">
          <h2 class="g-card__title">参考图</h2>
          <ImageUpload v-model="upload" :disabled="generation.busy" />
          <button
            v-if="generation.current"
            type="button"
            class="g-btn g-btn--secondary g-btn--sm mt-2"
            :disabled="generation.busy"
            @click="useCurrentResult"
          >
            使用当前结果
          </button>
        </section>

        <section v-else-if="mode === 'inpaint'" class="g-card">
          <h2 class="g-card__title">局部重画底图与蒙版</h2>
          <template v-if="upload">
            <MaskCanvas
              ref="maskCanvas"
              :image-src="upload.dataUrl"
              :initial-mask="maskInitial"
              :disabled="generation.busy"
              @ready="maskReady = $event"
            />
            <div class="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                class="g-btn g-btn--ghost g-btn--sm"
                :disabled="generation.busy"
                @click="clearSource"
              >
                更换底图
              </button>
              <button
                v-if="generation.current"
                type="button"
                class="g-btn g-btn--secondary g-btn--sm"
                :disabled="generation.busy"
                @click="useCurrentResult"
              >
                使用当前结果
              </button>
            </div>
          </template>
          <template v-else>
            <ImageUpload v-model="upload" :disabled="generation.busy" />
            <button
              v-if="generation.current"
              type="button"
              class="g-btn g-btn--secondary g-btn--sm mt-2"
              :disabled="generation.busy"
              @click="useCurrentResult"
            >
              使用当前结果
            </button>
          </template>
        </section>

        <section class="g-card">
          <h2 class="g-card__title">提示词</h2>
          <PromptField
            v-model="settings.config.prompt"
            label="正向提示词"
            :disabled="generation.busy"
          />
        </section>

        <section class="g-card">
          <h2 class="g-card__title">生成参数</h2>
          <ParamPanel :mode="mode" />
        </section>

        <section class="g-card">
          <div class="flex flex-col gap-2">
            <button
              type="button"
              class="g-btn g-btn--primary g-btn--lg"
              :disabled="!canGenerate || generation.busy"
              @click="startGeneration"
            >
              <span v-if="generation.busy" class="g-spinner" aria-hidden="true" />
              {{ generation.busy ? '生成中…' : '生成' }}
            </button>

            <button
              v-if="generation.busy"
              type="button"
              class="g-btn g-btn--secondary"
              @click="generation.cancel()"
            >
              停止生成
            </button>

            <p v-if="uploadMissing" class="g-hint">
              {{
                mode === 'inpaint' ? '局部重画需要先上传一张底图。' : '图生图需要先上传一张参考图。'
              }}
            </p>
            <p v-else-if="maskMissing" class="g-hint">请先在底图上涂抹需要重绘的区域。</p>
            <p v-else-if="generation.phase === 'error'" class="g-hint g-hint--warn">
              可在右侧查看错误详情，修正后重试。
            </p>
          </div>
        </section>
      </div>

      <div class="flex flex-col gap-4">
        <section class="g-card">
          <h2 class="g-card__title">输出</h2>
          <ImageStage
            :entry="generation.current"
            :phase="generation.phase"
            :preview-url="generation.previewUrl"
            :step="generation.step"
            :total-steps="generation.totalSteps"
            :error="generation.error"
            @use-seed="useSeed"
          />
          <button
            v-if="generation.current && mode !== 'inpaint'"
            type="button"
            class="g-btn g-btn--secondary g-btn--sm mt-2"
            @click="startInpaintFromCurrent"
          >
            局部重画这张图
          </button>
        </section>

        <section class="g-card">
          <div class="flex items-center justify-between gap-2">
            <h2 class="g-card__title">
              生成记录
              <span class="g-hint">{{ generation.history.length }} 张 · 本机保存</span>
            </h2>
            <div class="flex items-center gap-1">
              <RouterLink to="/gallery" class="g-btn g-btn--ghost g-btn--sm">画廊</RouterLink>
              <button
                v-if="generation.history.length"
                type="button"
                class="g-btn g-btn--ghost g-btn--sm"
                @click="clearHistory"
              >
                清空
              </button>
            </div>
          </div>
          <HistoryGallery
            :entries="generation.history"
            :loading="!generation.historyReady"
            @select="applyHistory"
            @remove="generation.remove"
          />
        </section>
      </div>
    </div>
  </div>
</template>
