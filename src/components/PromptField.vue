<script setup lang="ts">
import { onScopeDispose, ref, useId, watch } from 'vue'
import { useDebounceFn } from '@vueuse/core'

import { ldApi } from '@/api/ld'
import { useDeviceStore } from '@/stores/device'

const model = defineModel<string>({ required: true })

withDefaults(
  defineProps<{
    label?: string
    placeholder?: string
    rows?: number
    disabled?: boolean
  }>(),
  {
    label: '提示词',
    placeholder: '描述你想生成的画面，例如：a cute cat sitting on a windowsill, soft morning light',
    rows: 4,
    disabled: false,
  },
)

const device = useDeviceStore()
const id = useId()
const tokenCount = ref<number | null>(null)
const maxLength = ref(77)
const overflow = ref(false)

let controller: AbortController | null = null

const requestTokenCount = useDebounceFn(async (prompt: string) => {
  // 8081 只有在 App 内选定模型后才可用；自动模式下未就绪时不发请求。
  if (!prompt.trim() || (device.mode === 'auto' && !device.running)) {
    tokenCount.value = null
    overflow.value = false
    return
  }

  controller?.abort()
  controller = new AbortController()
  try {
    const result = await ldApi.tokenize(prompt, controller.signal)
    tokenCount.value = result.count
    maxLength.value = result.max_length
    overflow.value = result.overflow_offset >= 0
  } catch {
    // token 计数只是提醒，失败不影响输入与生成。
    tokenCount.value = null
    overflow.value = false
  }
}, 350)

watch(
  model,
  (value) => {
    void requestTokenCount(value)
  },
  { immediate: true },
)

onScopeDispose(() => controller?.abort())
</script>

<template>
  <div class="g-field">
    <div class="flex flex-wrap items-baseline justify-between gap-2">
      <label :for="id" class="g-label">{{ label }}</label>
      <span v-if="tokenCount !== null" class="g-chip" :class="{ 'g-chip--warn': overflow }">
        {{ tokenCount }} / {{ maxLength }} tokens
      </span>
    </div>

    <textarea
      :id="id"
      v-model="model"
      class="g-textarea"
      :rows="rows"
      :placeholder="placeholder"
      :disabled="disabled"
      spellcheck="false"
    />

    <div class="flex flex-wrap items-center justify-between gap-2">
      <p class="g-hint" :class="{ 'g-hint--warn': overflow }">
        <template v-if="overflow">
          超过 {{ maxLength }} token，后端可能截断；仍可继续生成。
        </template>
        <template v-else> token 计数仅作提醒，不限制生成。 </template>
      </p>
      <button
        type="button"
        class="g-btn g-btn--ghost g-btn--sm"
        :disabled="!model || disabled"
        @click="model = ''"
      >
        清空
      </button>
    </div>
  </div>
</template>
