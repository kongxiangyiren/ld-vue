<script setup lang="ts">
import { computed, nextTick, ref, useTemplateRef } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { useClipboard } from '@vueuse/core'

import { useGenerationStore, type HistoryEntry } from '@/stores/generation'
import { useSettingsStore } from '@/stores/settings'
import {
  buildFilename,
  downloadDataUrl,
  formatDateTime,
  formatDuration,
  generationModeLabel,
  shareText,
} from '@/utils/format'
import { schedulerLabel } from '@/utils/generate'
import { applyEntryToSettings, entryMaskImage, entryReferenceImage } from '@/utils/history'
import { uploadedImageFromDataUrl } from '@/utils/upload'

const generation = useGenerationStore()
const settings = useSettingsStore()
const router = useRouter()

const active = ref<HistoryEntry | null>(null)
const dialogRef = useTemplateRef<HTMLDialogElement>('dialog')

const activeShare = computed(() => (active.value ? shareText(active.value) : ''))
const { copy, copied, isSupported } = useClipboard({ source: activeShare })

async function open(entry: HistoryEntry) {
  active.value = entry
  await nextTick()
  if (dialogRef.value && !dialogRef.value.open) dialogRef.value.showModal()
}

function close() {
  dialogRef.value?.close()
}

function onDialogClose() {
  active.value = null
}

function onDialogClick(event: MouseEvent) {
  if (event.target === dialogRef.value) close()
}

function download(entry: HistoryEntry) {
  downloadDataUrl(entry.dataUrl, buildFilename(entry.seed, entry.width, entry.height))
}

function remove(entry: HistoryEntry) {
  generation.remove(entry.id)
  if (active.value?.id === entry.id) close()
}

function redo(entry: HistoryEntry) {
  applyEntryToSettings(settings.config, entry)

  const reference = entryReferenceImage(entry)
  if (reference) {
    if (entry.mode === 'inpaint') {
      generation.stageInput({
        mode: 'inpaint',
        image: reference,
        maskDataUrl: entryMaskImage(entry) ?? undefined,
      })
    } else {
      generation.stageInput({ mode: 'img2img', image: reference })
    }
  }

  generation.show(entry)
  close()

  if (entry.mode === 'inpaint') {
    void router.push('/inpaint')
  } else if (entry.mode === 'img2img') {
    void router.push('/img2img')
  } else {
    void router.push('/')
  }
}

/** 以这张图为底图进入局部重画。 */
function inpaintFrom(entry: HistoryEntry) {
  const image = uploadedImageFromDataUrl(entry.dataUrl, '历史图片.png')
  if (!image) return

  generation.stageInput({ mode: 'inpaint', image })
  close()
  void router.push('/inpaint')
}

function clearAll() {
  if (!generation.history.length) return
  if (window.confirm('清空本机保存的全部生成记录？')) generation.clearHistory()
}
</script>

<template>
  <div class="mx-auto w-full max-w-[1180px] px-4 pt-6 pb-10 sm:px-6">
    <div class="mb-4 flex flex-wrap items-end justify-between gap-2">
      <div>
        <h1 class="g-title">画廊</h1>
        <p class="g-hint mt-1">
          保存在本机 IndexedDB 的生成记录，最多 20 张；可查看、下载或用原参数重做。
        </p>
      </div>
      <div class="flex items-center gap-2">
        <span class="g-chip">{{ generation.history.length }} / 20</span>
        <button
          v-if="generation.history.length"
          type="button"
          class="g-btn g-btn--ghost"
          @click="clearAll"
        >
          清空全部
        </button>
      </div>
    </div>

    <section class="g-card">
      <div v-if="!generation.historyReady" class="g-hint">正在读取本机保存的生成记录…</div>

      <div
        v-else-if="generation.history.length === 0"
        class="flex flex-col items-center gap-3 py-10 text-center"
      >
        <div class="g-stage__glyph" aria-hidden="true">✦</div>
        <p class="g-hint">还没有生成记录，去生成第一张图片吧。</p>
        <RouterLink to="/" class="g-btn g-btn--primary">去文生图</RouterLink>
      </div>

      <div v-else class="g-gallery-grid">
        <article v-for="entry in generation.history" :key="entry.id" class="g-gallery-card">
          <button
            type="button"
            class="g-gallery-card__thumb"
            :aria-label="`查看：${entry.prompt}`"
            @click="open(entry)"
          >
            <img :src="entry.dataUrl" :alt="`生成记录：${entry.prompt.slice(0, 50)}`" />
          </button>

          <div class="g-gallery-card__body">
            <p class="g-gallery-card__prompt" :title="entry.prompt">{{ entry.prompt }}</p>
            <div class="g-meta">
              <span class="g-chip">{{ entry.width }} × {{ entry.height }}</span>
              <span class="g-chip">seed {{ entry.seed }}</span>
              <span class="g-chip">{{ generationModeLabel(entry.mode) }}</span>
              <span class="g-chip">{{ formatDuration(entry.generationTimeMs) }}</span>
            </div>
            <div class="g-gallery-card__actions">
              <button type="button" class="g-btn g-btn--secondary g-btn--sm" @click="open(entry)">
                查看
              </button>
              <button
                type="button"
                class="g-btn g-btn--secondary g-btn--sm"
                @click="download(entry)"
              >
                下载
              </button>
              <button type="button" class="g-btn g-btn--secondary g-btn--sm" @click="redo(entry)">
                重做
              </button>
              <button type="button" class="g-btn g-btn--ghost g-btn--sm" @click="remove(entry)">
                删除
              </button>
            </div>
          </div>
        </article>
      </div>
    </section>

    <dialog ref="dialog" class="g-dialog" @close="onDialogClose" @click="onDialogClick">
      <div v-if="active" class="g-dialog__body">
        <img :src="active.dataUrl" :alt="active.prompt" class="g-dialog__image" />

        <div class="flex min-w-0 flex-col gap-3">
          <div class="flex items-start justify-between gap-2">
            <h2 class="m-0 text-base font-semibold">生成详情</h2>
            <button
              type="button"
              class="g-btn g-btn--ghost g-btn--sm"
              aria-label="关闭"
              @click="close"
            >
              ×
            </button>
          </div>

          <div>
            <p class="g-label">提示词</p>
            <p class="g-dialog__prompt">{{ active.prompt }}</p>
          </div>

          <div>
            <p class="g-label">反向提示词</p>
            <p class="g-dialog__prompt g-hint">{{ active.negativePrompt || '（空）' }}</p>
          </div>

          <dl class="g-kv">
            <dt>模型</dt>
            <dd>{{ active.modelName }}</dd>
            <dt>参数</dt>
            <dd>
              steps {{ active.steps }} · CFG {{ active.cfg }} ·
              {{ schedulerLabel(active.scheduler) }}
            </dd>
            <dt>种子</dt>
            <dd>{{ active.seed }}</dd>
            <dt>尺寸</dt>
            <dd>{{ active.width }} × {{ active.height }}</dd>
            <dt>耗时</dt>
            <dd>
              {{ formatDuration(active.generationTimeMs) }}（首步
              {{ formatDuration(active.firstStepTimeMs) }}）
            </dd>
            <dt>模式</dt>
            <dd>{{ generationModeLabel(active.mode) }}</dd>
            <dt>时间</dt>
            <dd>{{ formatDateTime(active.createdAt) }}</dd>
          </dl>

          <div class="flex flex-wrap gap-2">
            <button type="button" class="g-btn g-btn--primary" @click="redo(active)">重做</button>
            <button type="button" class="g-btn g-btn--secondary" @click="inpaintFrom(active)">
              局部重画
            </button>
            <button type="button" class="g-btn g-btn--secondary" @click="download(active)">
              下载 PNG
            </button>
            <button
              type="button"
              class="g-btn g-btn--secondary"
              :disabled="!isSupported"
              @click="copy()"
            >
              {{ copied ? '已复制' : '复制参数' }}
            </button>
            <button type="button" class="g-btn g-btn--ghost" @click="remove(active)">删除</button>
          </div>

          <p v-if="active.mode === 'img2img'" class="g-hint">
            图生图重做会一并恢复参考图；旧版本记录若没有参考图，需要重新上传。
          </p>
          <p v-else-if="active.mode === 'inpaint'" class="g-hint">
            局部重画重做会恢复底图与蒙版；「局部重画」按钮会把当前结果作为新底图。
          </p>
        </div>
      </div>
    </dialog>
  </div>
</template>
