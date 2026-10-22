<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'

import RangeField from '@/components/RangeField.vue'
import { useDeviceStore } from '@/stores/device'
import { useSettingsStore } from '@/stores/settings'
import { randomSeed } from '@/utils/format'
import { ASPECT_RATIOS, SCHEDULER_OPTIONS, clampSize } from '@/utils/generate'

defineProps<{ mode: 'txt2img' | 'img2img' | 'inpaint' }>()

const settings = useSettingsStore()
const device = useDeviceStore()

const manual = computed(() => device.mode === 'manual')
const showingAspect = computed(() =>
  manual.value ? settings.config.manualDimensionMode === 'aspect' : device.isSdxl,
)
const showingLockedSize = computed(() => !manual.value && device.isNpuLocked)
const showOpencl = computed(() => manual.value || device.servingModel?.run_on_cpu === true)

const lockedSize = computed(() => {
  const width = device.status?.width ?? device.selection?.width ?? 512
  const height = device.status?.height ?? device.selection?.height ?? 512
  return `${width} × ${height}`
})

function clampConfigSize(key: 'width' | 'height') {
  settings.config[key] = clampSize(settings.config[key])
}

// 种子留空 = 随机（请求不发送 seed），而不是 -1。
const seedText = computed({
  get: () => (settings.config.seed === null ? '' : String(settings.config.seed)),
  set: (value: string) => {
    const trimmed = value.trim()
    if (trimmed === '') {
      settings.config.seed = null
      return
    }
    const parsed = Number(trimmed)
    settings.config.seed = Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : null
  },
})
</script>

<template>
  <div class="flex flex-col gap-3">
    <p v-if="manual" class="g-hint">
      手动模式：模型名「{{ device.modelName }}」，尺寸需与手机端一致，可在
      <RouterLink to="/settings">设备与模型</RouterLink> 修改。
    </p>

    <RangeField
      v-model="settings.config.steps"
      label="采样步数"
      :min="1"
      :max="50"
      :step="1"
      suffix=" 步"
    />

    <RangeField
      v-model="settings.config.cfg"
      label="CFG 系数"
      :min="1"
      :max="20"
      :step="0.5"
      hint="NPU 模式下 CFG = 1.0 会跳过无条件计算，生成明显更快。"
    />

    <RangeField
      v-if="mode !== 'txt2img'"
      v-model="settings.config.denoiseStrength"
      label="去噪强度"
      :min="0.05"
      :max="1"
      :step="0.05"
      hint="数值越高越偏离参考图/蒙版；0.6 是常用起点。"
    />

    <details class="g-accordion">
      <summary>反向提示词</summary>
      <div class="g-accordion__body">
        <textarea
          v-model="settings.config.negativePrompt"
          class="g-textarea"
          rows="3"
          spellcheck="false"
          aria-label="反向提示词"
        />
      </div>
    </details>

    <details class="g-accordion" open>
      <summary>种子、采样与尺寸</summary>
      <div class="g-accordion__body">
        <div class="g-field">
          <label class="g-label" for="seed-input">种子</label>
          <div class="flex gap-2">
            <input
              id="seed-input"
              v-model="seedText"
              class="g-input"
              type="text"
              inputmode="numeric"
              placeholder="留空 = 随机"
              autocomplete="off"
            />
            <button
              type="button"
              class="g-btn g-btn--secondary"
              @click="settings.config.seed = null"
            >
              随机
            </button>
            <button
              type="button"
              class="g-btn g-btn--ghost"
              @click="settings.config.seed = randomSeed()"
            >
              骰子
            </button>
          </div>
          <p class="g-hint">留空表示每次随机（不发送 seed）；生成完成后可点击结果里的种子复现。</p>
        </div>

        <div class="g-field">
          <label class="g-label" for="scheduler-select">采样方法</label>
          <select id="scheduler-select" v-model="settings.config.scheduler" class="g-select">
            <option v-for="option in SCHEDULER_OPTIONS" :key="option.value" :value="option.value">
              {{ option.label }}
            </option>
          </select>
        </div>

        <div class="g-field">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <span class="g-label">输出尺寸</span>
            <div v-if="manual" class="g-segmented" role="group" aria-label="尺寸策略">
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

          <template v-if="showingAspect">
            <select v-model="settings.config.aspectRatio" class="g-select" aria-label="宽高比">
              <option v-for="ratio in ASPECT_RATIOS" :key="ratio" :value="ratio">
                {{ ratio }}（长边 1024）
              </option>
            </select>
            <p class="g-hint">SDXL NPU 模式忽略宽高：长边固定 1024，短边按比例向上取 8 的倍数。</p>
          </template>

          <template v-else-if="showingLockedSize">
            <div class="g-input" aria-readonly="true">{{ lockedSize }}</div>
            <p class="g-hint">NPU 模型必须使用加载模型时选定的分辨率，可在「设备与模型」页切换。</p>
          </template>

          <template v-else>
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
            <p class="g-hint">宽高需为 8 的倍数；手动模式下要与手机端模型的分辨率一致。</p>
          </template>
        </div>

        <label class="flex items-start gap-2">
          <input
            v-model="settings.config.showProcess"
            type="checkbox"
            class="mt-1"
            :style="{ accentColor: 'var(--g-accent)' }"
          />
          <span>
            <span class="g-label">显示扩散过程</span>
            <span class="g-hint block"
              >还需要在手机 App 内打开「显示生成过程」，否则只显示进度条。</span
            >
          </span>
        </label>

        <label v-if="showOpencl" class="flex items-start gap-2">
          <input
            v-model="settings.config.useOpencl"
            type="checkbox"
            class="mt-1"
            :style="{ accentColor: 'var(--g-accent)' }"
          />
          <span>
            <span class="g-label">使用 OpenCL</span>
            <span class="g-hint block">仅 CPU 模型有效；切换 MNN 后端到 GPU，首次运行较慢。</span>
          </span>
        </label>
      </div>
    </details>
  </div>
</template>
