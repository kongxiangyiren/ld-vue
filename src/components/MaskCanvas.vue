<script setup lang="ts">
import { ref, useTemplateRef, watch } from 'vue'

const props = withDefaults(
  defineProps<{
    imageSrc: string
    initialMask?: string | null
    disabled?: boolean
  }>(),
  {
    initialMask: null,
    disabled: false,
  },
)

const emit = defineEmits<{ ready: [hasMask: boolean] }>()

const imageRef = useTemplateRef<HTMLImageElement>('image')
const overlayRef = useTemplateRef<HTMLCanvasElement>('overlay')

const maskCanvas = document.createElement('canvas')
let maskCtx: CanvasRenderingContext2D | null = null
let overlayCtx: CanvasRenderingContext2D | null = null

const ready = ref(false)
const hasMask = ref(false)
const brushSize = ref(36)
const eraser = ref(false)
const maskSize = ref<{ width: number; height: number } | null>(null)

let naturalWidth = 0
let naturalHeight = 0
let painting = false
let lastPoint: { x: number; y: number } | null = null
let appliedMaskUrl: string | null = null

function emitReady(value: boolean) {
  hasMask.value = value
  emit('ready', value)
}

function resetMask() {
  if (!maskCtx || !overlayCtx) return
  // 未涂抹区域保持透明；只有涂抹处是白色。
  maskCtx.globalCompositeOperation = 'source-over'
  maskCtx.clearRect(0, 0, naturalWidth, naturalHeight)
  overlayCtx.clearRect(0, 0, naturalWidth, naturalHeight)
  emitReady(false)
}

function recomputeHasMask() {
  if (!maskCtx || naturalWidth <= 0) {
    emitReady(false)
    return
  }
  const data = maskCtx.getImageData(0, 0, naturalWidth, naturalHeight).data
  let found = false
  for (let index = 3; index < data.length; index += 4) {
    if ((data[index] ?? 0) > 16) {
      found = true
      break
    }
  }
  emitReady(found)
}

function applyInitialMask() {
  if (!ready.value || !props.initialMask || props.initialMask === appliedMaskUrl) return

  const url = props.initialMask
  appliedMaskUrl = url
  const image = new Image()
  image.onload = () => {
    if (!maskCtx || !overlayCtx) return

    const temp = document.createElement('canvas')
    temp.width = naturalWidth
    temp.height = naturalHeight
    const tempCtx = temp.getContext('2d')
    if (!tempCtx) return

    tempCtx.drawImage(image, 0, 0, naturalWidth, naturalHeight)
    const source = tempCtx.getImageData(0, 0, naturalWidth, naturalHeight).data

    const maskImage = maskCtx.createImageData(naturalWidth, naturalHeight)
    const overlayImage = overlayCtx.createImageData(naturalWidth, naturalHeight)

    for (let index = 0; index < source.length; index += 4) {
      const alpha = source[index + 3] ?? 0
      const red = source[index] ?? 0
      const green = source[index + 1] ?? 0
      const blue = source[index + 2] ?? 0
      // 统一成「透明底 + 白色涂抹」：兼容旧格式（黑底白画）和当前格式。
      if (alpha <= 32 || red < 200 || green < 200 || blue < 200) continue

      maskImage.data[index] = 255
      maskImage.data[index + 1] = 255
      maskImage.data[index + 2] = 255
      maskImage.data[index + 3] = 255

      overlayImage.data[index] = 249
      overlayImage.data[index + 1] = 115
      overlayImage.data[index + 2] = 22
      overlayImage.data[index + 3] = 150
    }

    maskCtx.globalCompositeOperation = 'source-over'
    maskCtx.clearRect(0, 0, naturalWidth, naturalHeight)
    overlayCtx.clearRect(0, 0, naturalWidth, naturalHeight)
    maskCtx.putImageData(maskImage, 0, 0)
    overlayCtx.putImageData(overlayImage, 0, 0)
    recomputeHasMask()
  }
  image.src = url
}

function prepareCanvases() {
  const image = imageRef.value
  if (!image?.naturalWidth) return

  naturalWidth = image.naturalWidth
  naturalHeight = image.naturalHeight
  maskSize.value = { width: naturalWidth, height: naturalHeight }

  const overlay = overlayRef.value
  if (overlay) {
    overlay.width = naturalWidth
    overlay.height = naturalHeight
  }
  maskCanvas.width = naturalWidth
  maskCanvas.height = naturalHeight

  overlayCtx = overlay?.getContext('2d') ?? null
  maskCtx = maskCanvas.getContext('2d') ?? null

  appliedMaskUrl = null
  resetMask()
  ready.value = true
  applyInitialMask()
}

function handleImageLoad() {
  prepareCanvases()
}

function pointerPosition(event: PointerEvent) {
  const canvas = overlayRef.value
  if (!canvas) return null
  const rect = canvas.getBoundingClientRect()
  if (!rect.width || !rect.height) return null
  const scale = canvas.width / rect.width
  return {
    x: (event.clientX - rect.left) * scale,
    y: (event.clientY - rect.top) * scale,
    scale,
  }
}

function paintAt(
  point: { x: number; y: number; scale: number },
  previous: { x: number; y: number } | null,
) {
  if (!maskCtx || !overlayCtx) return

  const lineWidth = Math.max(1, brushSize.value * point.scale)
  const erasing = eraser.value

  maskCtx.lineCap = 'round'
  maskCtx.lineJoin = 'round'
  maskCtx.strokeStyle = '#fff'
  maskCtx.fillStyle = '#fff'
  maskCtx.lineWidth = lineWidth
  maskCtx.globalCompositeOperation = erasing ? 'destination-out' : 'source-over'

  overlayCtx.lineCap = 'round'
  overlayCtx.lineJoin = 'round'
  overlayCtx.strokeStyle = erasing ? 'rgba(0,0,0,1)' : 'rgba(249,115,22,0.55)'
  overlayCtx.fillStyle = erasing ? 'rgba(0,0,0,1)' : 'rgba(249,115,22,0.55)'
  overlayCtx.lineWidth = lineWidth
  overlayCtx.globalCompositeOperation = erasing ? 'destination-out' : 'source-over'

  maskCtx.beginPath()
  maskCtx.arc(point.x, point.y, lineWidth / 2, 0, Math.PI * 2)
  maskCtx.fill()
  overlayCtx.beginPath()
  overlayCtx.arc(point.x, point.y, lineWidth / 2, 0, Math.PI * 2)
  overlayCtx.fill()

  if (previous) {
    maskCtx.beginPath()
    maskCtx.moveTo(previous.x, previous.y)
    maskCtx.lineTo(point.x, point.y)
    maskCtx.stroke()

    overlayCtx.beginPath()
    overlayCtx.moveTo(previous.x, previous.y)
    overlayCtx.lineTo(point.x, point.y)
    overlayCtx.stroke()
  }

  maskCtx.globalCompositeOperation = 'source-over'
  overlayCtx.globalCompositeOperation = 'source-over'
}

function onPointerDown(event: PointerEvent) {
  if (props.disabled || !ready.value) return
  const point = pointerPosition(event)
  if (!point) return

  painting = true
  lastPoint = point
  ;(event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId)
  paintAt(point, null)
  event.preventDefault()
}

function onPointerMove(event: PointerEvent) {
  if (!painting) return
  const point = pointerPosition(event)
  if (!point) return
  paintAt(point, lastPoint)
  lastPoint = point
  event.preventDefault()
}

function onPointerUp() {
  if (!painting) return
  painting = false
  lastPoint = null
  recomputeHasMask()
}

function clearMask() {
  appliedMaskUrl = null
  resetMask()
}

function exportMask(): string | null {
  if (!hasMask.value || naturalWidth <= 0) return null
  return maskCanvas.toDataURL('image/png')
}

watch(
  () => props.initialMask,
  (value) => {
    if (!ready.value) return
    if (!value) {
      appliedMaskUrl = null
      resetMask()
      return
    }
    appliedMaskUrl = null
    resetMask()
    applyInitialMask()
  },
)

defineExpose({ exportMask, clearMask })
</script>

<template>
  <div class="flex flex-col gap-2">
    <div class="g-mask">
      <img
        ref="image"
        :src="imageSrc"
        alt="局部重画底图"
        class="g-mask__image"
        draggable="false"
        @load="handleImageLoad"
      />
      <canvas
        ref="overlay"
        class="g-mask__canvas"
        aria-label="涂抹需要重绘的区域"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointercancel="onPointerUp"
        @pointerleave="onPointerUp"
      />
      <div v-if="!ready" class="g-mask__loading">
        <span class="g-spinner" aria-hidden="true" />
      </div>
    </div>

    <div class="flex flex-wrap items-center gap-2">
      <span class="g-label">笔刷</span>
      <input
        v-model.number="brushSize"
        class="g-range w-28"
        type="range"
        min="4"
        max="120"
        step="2"
      />
      <span class="g-hint">{{ brushSize }} px</span>
      <button
        type="button"
        class="g-btn g-btn--sm"
        :class="eraser ? 'g-btn--primary' : 'g-btn--secondary'"
        :disabled="disabled"
        @click="eraser = !eraser"
      >
        {{ eraser ? '橡皮擦' : '画笔' }}
      </button>
      <button
        type="button"
        class="g-btn g-btn--ghost g-btn--sm"
        :disabled="disabled"
        @click="clearMask"
      >
        清除蒙版
      </button>
      <span class="g-chip" :class="{ 'g-chip--accent': hasMask }">
        {{ hasMask ? '已涂抹' : '未涂抹' }}
      </span>
      <span v-if="maskSize" class="g-chip">
        蒙版 {{ maskSize.width }} × {{ maskSize.height }}
      </span>
    </div>

    <p class="g-hint">
      在图片上点击或拖动涂抹需要重绘的区域（界面橙色显示）；提示词只影响重绘部分。
    </p>
    <p class="g-hint">导出的蒙版与底图同尺寸：白色 = 重绘，透明 = 保留。</p>
  </div>
</template>
