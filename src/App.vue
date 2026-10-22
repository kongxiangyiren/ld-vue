<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { RouterLink, RouterView } from 'vue-router'
import { useIntervalFn } from '@vueuse/core'

import { useDeviceStore } from '@/stores/device'

const device = useDeviceStore()

interface StatusPill {
  tone: 'ok' | 'warn' | 'err' | 'idle'
  text: string
}

const pill = computed<StatusPill>(() => {
  if (!device.checked) return { tone: 'idle', text: '检测中…' }

  if (device.mode === 'manual') {
    if (device.probe === 'ok') return { tone: 'ok', text: '仅生成服务在线' }
    if (device.probe === 'fail') return { tone: 'warn', text: '生成服务未确认' }
    return { tone: 'idle', text: '检测生成服务…' }
  }

  const status = device.status
  if (status?.state === 'running') {
    const size = `${status.width ?? '?'}×${status.height ?? '?'}`
    return { tone: 'ok', text: `运行中 · ${device.modelName} · ${size}` }
  }
  if (status?.state === 'starting') return { tone: 'warn', text: '模型加载中…' }
  if (status?.state === 'error') return { tone: 'err', text: '模型异常' }
  return { tone: 'idle', text: '未加载模型' }
})

onMounted(() => {
  void device.refresh()
})

// 只在设备接口可用时轮询状态；8808 离线时不反复请求。
useIntervalFn(() => {
  if (device.mode === 'auto') void device.refreshStatus()
}, 3000)
</script>

<template>
  <div class="flex min-h-screen flex-col">
    <header class="g-header">
      <div class="mx-auto flex w-full max-w-[1180px] items-center gap-3 px-4 py-3 sm:px-6">
        <div class="g-brand-mark" aria-hidden="true">✦</div>

        <div class="min-w-0 flex-1">
          <p class="truncate text-base leading-tight font-semibold">
            Local Dream
            <span class="g-muted hidden sm:inline">· 本地 AI 绘图</span>
          </p>
          <p class="g-hint hidden truncate sm:block">手机端本地扩散模型 · 图片不离开局域网</p>
        </div>

        <RouterLink
          to="/settings"
          class="g-pill"
          :class="`g-pill--${pill.tone}`"
          :title="pill.text"
        >
          <span class="g-pill__dot" aria-hidden="true" />
          <span class="truncate">{{ pill.text }}</span>
        </RouterLink>
      </div>

      <nav class="mx-auto w-full max-w-[1180px] px-4 sm:px-6" aria-label="主导航">
        <div class="g-tabs">
          <RouterLink to="/" class="g-tab" active-class="g-tab--active">文生图</RouterLink>
          <RouterLink to="/img2img" class="g-tab" active-class="g-tab--active">图生图</RouterLink>
          <RouterLink to="/inpaint" class="g-tab" active-class="g-tab--active">局部重画</RouterLink>
          <RouterLink to="/gallery" class="g-tab" active-class="g-tab--active">画廊</RouterLink>
          <RouterLink to="/settings" class="g-tab" active-class="g-tab--active">
            设备与模型
          </RouterLink>
        </div>
      </nav>
    </header>

    <main class="flex-1">
      <RouterView />
    </main>

    <footer class="g-footer">
      <div
        class="mx-auto flex w-full max-w-[1180px] flex-wrap items-center justify-between gap-2 px-4 py-6 text-xs sm:px-6"
      >
        <span>
          由
          <a href="https://ld-guide.chino.icu/zh/features/http-api" target="_blank" rel="noopener">
            Local Dream HTTP API
          </a>
          驱动 · 生成记录保存在本机浏览器的 IndexedDB
        </span>
        <span>@kongxiangyiren/ld-api</span>
      </div>
    </footer>
  </div>
</template>
