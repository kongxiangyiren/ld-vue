<script setup lang="ts">
import { ref, useTemplateRef } from 'vue'

import { readImageFile, type UploadedImage } from '@/utils/upload'

const file = defineModel<UploadedImage | null>({ required: true })

const props = defineProps<{ disabled?: boolean }>()

const inputRef = useTemplateRef<HTMLInputElement>('input')
const error = ref<string | null>(null)
const dragging = ref(false)

function openPicker() {
  if (props.disabled) return
  inputRef.value?.click()
}

async function loadFile(picked: File) {
  error.value = null
  try {
    file.value = await readImageFile(picked)
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '图片读取失败'
  }
}

async function onInputChange(event: Event) {
  const target = event.target as HTMLInputElement
  const picked = target.files?.[0]
  if (picked) await loadFile(picked)
  target.value = ''
}

async function onDrop(event: DragEvent) {
  dragging.value = false
  if (props.disabled) return
  const picked = event.dataTransfer?.files?.[0]
  if (picked) await loadFile(picked)
}
</script>

<template>
  <div class="flex flex-col gap-2">
    <div
      class="g-upload"
      :class="{ 'g-upload--active': dragging }"
      @dragover.prevent="dragging = true"
      @dragleave="dragging = false"
      @drop.prevent="onDrop"
    >
      <template v-if="file">
        <img :src="file.dataUrl" alt="参考图预览" class="g-upload__preview" />
        <div class="flex flex-wrap justify-center gap-2">
          <button
            type="button"
            class="g-btn g-btn--secondary g-btn--sm"
            :disabled="disabled"
            @click="openPicker"
          >
            更换图片
          </button>
          <button
            type="button"
            class="g-btn g-btn--ghost g-btn--sm"
            :disabled="disabled"
            @click="file = null"
          >
            清除
          </button>
        </div>
        <p class="g-hint w-full truncate">{{ file.name }}</p>
      </template>

      <template v-else>
        <div class="g-upload__glyph" aria-hidden="true">＋</div>
        <button
          type="button"
          class="g-btn g-btn--secondary"
          :disabled="disabled"
          @click="openPicker"
        >
          选择图片
        </button>
        <p class="g-hint">也可以把 PNG / JPEG 拖到这里，最大 20MB</p>
      </template>

      <input
        ref="input"
        class="sr-only"
        type="file"
        accept="image/png,image/jpeg"
        :disabled="disabled"
        @change="onInputChange"
      />
    </div>
    <p v-if="error" class="g-hint g-hint--warn" role="alert">{{ error }}</p>
  </div>
</template>
