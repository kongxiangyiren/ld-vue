<script setup lang="ts">
import { computed } from 'vue'
import { useClipboard } from '@vueuse/core'

import type { GenerationPhase, HistoryEntry } from '@/stores/generation'
import {
  buildFilename,
  downloadDataUrl,
  formatDuration,
  generationModeLabel,
  shareText,
} from '@/utils/format'

const props = defineProps<{
  entry: HistoryEntry | null
  phase: GenerationPhase
  previewUrl: string | null
  step: number
  totalSteps: number
  error: string | null
}>()

const emit = defineEmits<{ useSeed: [seed: number] }>()

const progress = computed(() => {
  if (props.totalSteps <= 0) return 0
  return Math.min(100, Math.max(0, Math.round((props.step / props.totalSteps) * 100)))
})

const share = computed(() => (props.entry ? shareText(props.entry) : ''))
const { copy, copied, isSupported } = useClipboard({ source: share })

function download() {
  if (!props.entry) return
  const { dataUrl, seed, width, height } = props.entry
  downloadDataUrl(dataUrl, buildFilename(seed, width, height))
}
</script>

<template>
  <div class="flex flex-col gap-3">
    <div class="g-stage">
      <img
        v-if="previewUrl && phase === 'running'"
        :src="previewUrl"
        alt="扩散过程预览"
        class="g-stage__image"
      />
      <img v-else-if="entry" :src="entry.dataUrl" alt="生成结果" class="g-stage__image" />
      <div v-else-if="phase === 'running'" class="g-stage__empty">
        <div class="g-spinner" aria-hidden="true" />
        <p>正在生成，等待第一步结果…</p>
      </div>
      <div v-else-if="error" class="g-stage__empty g-stage__empty--error" role="alert">
        <p class="font-medium">生成失败</p>
        <p class="g-hint">{{ error }}</p>
      </div>
      <div v-else class="g-stage__empty">
        <div class="g-stage__glyph" aria-hidden="true">✦</div>
        <p>生成结果会显示在这里</p>
      </div>

      <div v-if="phase === 'running'" class="g-stage__progress">
        <div class="flex items-center justify-between gap-2">
          <span>生成中…</span>
          <span>{{ step }} / {{ totalSteps }}</span>
        </div>
        <div
          class="g-progress"
          role="progressbar"
          aria-label="生成进度"
          :aria-valuenow="step"
          aria-valuemin="0"
          :aria-valuemax="totalSteps"
        >
          <div class="g-progress__bar" :style="{ width: `${progress}%` }" />
        </div>
      </div>
    </div>

    <div v-if="entry" class="g-meta">
      <span class="g-chip">{{ entry.width }} × {{ entry.height }}</span>
      <button
        type="button"
        class="g-chip g-chip--accent"
        title="把这个种子填回参数，便于复现"
        @click="emit('useSeed', entry.seed)"
      >
        seed {{ entry.seed }}
      </button>
      <span class="g-chip">{{ formatDuration(entry.generationTimeMs) }}</span>
      <span class="g-chip">首步 {{ formatDuration(entry.firstStepTimeMs) }}</span>
      <span class="g-chip">{{ generationModeLabel(entry.mode) }}</span>
      <span class="g-chip">{{ entry.modelName }}</span>
    </div>

    <div v-if="entry" class="flex flex-wrap gap-2">
      <button type="button" class="g-btn g-btn--secondary" @click="download">下载 PNG</button>
      <button
        type="button"
        class="g-btn g-btn--secondary"
        :disabled="!isSupported"
        :title="isSupported ? '复制提示词与生成参数' : '当前浏览器不支持剪贴板'"
        @click="copy()"
      >
        {{ copied ? '已复制' : '复制参数' }}
      </button>
    </div>
  </div>
</template>
