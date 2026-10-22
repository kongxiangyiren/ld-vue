<script setup lang="ts">
import type { HistoryEntry } from '@/stores/generation'

defineProps<{ entries: HistoryEntry[]; loading?: boolean }>()

const emit = defineEmits<{
  select: [entry: HistoryEntry]
  remove: [id: string]
}>()
</script>

<template>
  <div v-if="loading" class="g-hint">正在读取本机保存的生成记录…</div>

  <div v-else-if="entries.length === 0" class="g-hint">
    还没有生成记录。图片会保存在本机 IndexedDB，刷新页面后仍可查看。
  </div>

  <div v-else class="g-gallery">
    <div v-for="entry in entries" :key="entry.id" class="g-thumb-wrap">
      <button type="button" class="g-thumb" :title="entry.prompt" @click="emit('select', entry)">
        <img :src="entry.dataUrl" :alt="`历史生成：${entry.prompt.slice(0, 40)}`" />
        <span class="g-thumb__badge">seed {{ entry.seed }}</span>
      </button>
      <button
        type="button"
        class="g-thumb__remove"
        aria-label="删除这条生成记录"
        @click.stop="emit('remove', entry.id)"
      >
        ×
      </button>
    </div>
  </div>
</template>
