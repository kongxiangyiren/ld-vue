<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { RouterLink, RouterView, useRoute } from 'vue-router';
import { Collection, MagicStick, Monitor, Refresh, Setting } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';

import { useLdStore } from '@/stores/ld';
import { API_BASE } from '@/utils/config';

const route = useRoute();
const ld = useLdStore();

const navigation = [
  { label: '生成', to: '/', icon: MagicStick },
  { label: '模型管理', to: '/model-management', icon: Monitor },
  { label: '生成画廊', to: '/gallery', icon: Collection },
  { label: '默认参数', to: '/settings', icon: Setting }
];

const isActive = (path: string) =>
  path === '/' ? route.path === '/' : route.path.startsWith(path);

const statusTone = computed(() => {
  const state = ld.status?.state;
  if (state === 'running') return 'bg-emerald-100 text-emerald-700';
  if (state === 'starting') return 'bg-amber-100 text-amber-700';
  if (state === 'error') return 'bg-red-100 text-red-700';
  return 'bg-slate-200 text-slate-600';
});

async function refreshBackend() {
  try {
    await Promise.all([ld.refreshInfo(), ld.refreshModels(), ld.refreshStatus()]);
    ElMessage.success('后端状态已刷新');
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '刷新失败');
  }
}

onMounted(() => {
  void ld.loadInitial();
});
</script>

<template>
  <div class="min-h-screen bg-surface">
    <header class="sticky top-0 z-30 border-b border-line bg-white/95 backdrop-blur">
      <div class="mx-auto max-w-[1600px] px-4 lg:px-6">
        <div class="flex h-14 items-center gap-4">
          <div class="flex min-w-0 items-center gap-2.5">
            <div class="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary text-white">
              <el-icon :size="17"><MagicStick /></el-icon>
            </div>
            <div class="min-w-0">
              <div class="truncate text-sm font-semibold leading-4">AI 图片工坊</div>
              <div class="truncate text-[11px] text-muted">Local Dream</div>
            </div>
          </div>

          <nav class="hidden flex-1 items-center gap-1 lg:flex">
            <RouterLink
              v-for="item in navigation"
              :key="item.to"
              :to="item.to"
              class="flex items-center gap-2 border-b-2 px-3 py-3.5 text-sm font-medium transition-colors"
              :class="
                isActive(item.to)
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted hover:text-ink'
              "
            >
              <el-icon :size="16"><component :is="item.icon" /></el-icon>
              <span>{{ item.label }}</span>
            </RouterLink>
          </nav>

          <div class="ml-auto flex items-center gap-2 lg:ml-0">
            <span
              class="hidden rounded-full px-2.5 py-1 text-xs font-medium sm:inline-flex"
              :class="statusTone"
            >
              {{ ld.statusLabel }}
            </span>
            <button
              class="inline-flex size-9 items-center justify-center rounded-md border border-line text-muted transition-colors hover:border-primary hover:text-primary"
              type="button"
              title="刷新后端"
              @click="refreshBackend"
            >
              <el-icon :size="16"><Refresh /></el-icon>
            </button>
          </div>
        </div>

        <nav class="flex gap-1 overflow-x-auto pb-2 lg:hidden">
          <RouterLink
            v-for="item in navigation"
            :key="item.to"
            :to="item.to"
            class="flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium"
            :class="
              isActive(item.to)
                ? 'bg-primary/10 text-primary'
                : 'text-muted hover:bg-slate-100 hover:text-ink'
            "
          >
            <el-icon :size="15"><component :is="item.icon" /></el-icon>
            <span>{{ item.label }}</span>
          </RouterLink>
        </nav>
      </div>
    </header>

    <main class="mx-auto max-w-[1600px] px-4 py-5 lg:px-6">
      <div class="mb-4 flex items-center justify-between gap-3">
        <div class="min-w-0">
          <div class="truncate font-mono text-xs text-muted">{{ API_BASE }}</div>
          <div v-if="ld.selectedModel" class="mt-1 truncate text-sm font-medium">
            {{ ld.selectedModel.name }}
          </div>
        </div>
        <span class="rounded-full px-2.5 py-1 text-xs font-medium sm:hidden" :class="statusTone">
          {{ ld.statusLabel }}
        </span>
      </div>

      <RouterView />
    </main>
  </div>
</template>
