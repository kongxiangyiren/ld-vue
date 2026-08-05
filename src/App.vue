<script setup lang="ts">
  import { computed, onMounted } from 'vue';
  import { RouterLink, RouterView, useRoute } from 'vue-router';
  import { Collection, MagicStick, Monitor, Refresh, Setting } from '@element-plus/icons-vue';

  import { useLdStore } from '@/stores/ld';
  import { API_BASE } from '@/utils/config';

  const route = useRoute();
  const ld = useLdStore();

  const navigation = [
    { label: '图片生成', to: '/', icon: MagicStick },
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
  <div class="min-h-screen lg:flex">
    <aside
      class="flex flex-col border-b border-slate-800 bg-ink text-white lg:min-h-screen lg:w-64 lg:border-r lg:border-b-0"
    >
      <div class="flex items-center gap-3 px-5 py-4 lg:py-6">
        <div
          class="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary text-white"
        >
          <el-icon :size="22"><MagicStick /></el-icon>
        </div>
        <div class="min-w-0">
          <div class="truncate text-base font-semibold">AI 图片工坊</div>
          <div class="truncate text-xs text-slate-400">Local Dream</div>
        </div>
      </div>

      <nav
        class="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-1 lg:flex-col lg:overflow-visible lg:px-4 lg:py-2"
      >
        <RouterLink
          v-for="item in navigation"
          :key="item.to"
          :to="item.to"
          class="flex shrink-0 items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors"
          :class="
            isActive(item.to)
              ? 'bg-white/10 text-white'
              : 'text-slate-400 hover:bg-white/5 hover:text-white'
          "
        >
          <el-icon :size="18"><component :is="item.icon" /></el-icon>
          <span>{{ item.label }}</span>
        </RouterLink>
      </nav>

      <div class="hidden border-t border-slate-800 px-4 py-4 lg:block">
        <div class="flex items-center justify-between gap-2 text-xs">
          <span class="text-slate-400">后端</span>
          <button
            class="inline-flex items-center gap-1 text-slate-300 transition-colors hover:text-white"
            type="button"
            @click="refreshBackend"
          >
            <el-icon :size="14"><Refresh /></el-icon>
            刷新
          </button>
        </div>
        <div
          class="mt-2 truncate rounded-md bg-white/5 px-2 py-1.5 font-mono text-[11px] text-slate-300"
        >
          {{ API_BASE }}
        </div>
        <div class="mt-3 flex items-center gap-2 text-xs">
          <span class="size-2 rounded-full bg-emerald-400"></span>
          <span>{{ ld.statusLabel }}</span>
          <span v-if="ld.selectedModel" class="truncate text-slate-500">
            {{ ld.selectedModel.name }}
          </span>
        </div>
      </div>
    </aside>

    <main class="min-w-0 flex-1">
      <header
        class="sticky top-0 z-20 flex items-center gap-3 border-b border-line bg-surface/95 px-4 py-3 backdrop-blur lg:hidden"
      >
        <div class="flex size-9 items-center justify-center rounded-lg bg-primary text-white">
          <el-icon :size="18"><MagicStick /></el-icon>
        </div>
        <div class="min-w-0 flex-1">
          <div class="truncate text-sm font-semibold">AI 图片工坊</div>
          <div class="truncate text-xs text-muted">{{ API_BASE }}</div>
        </div>
        <span class="rounded-full px-2.5 py-1 text-xs font-medium" :class="statusTone">
          {{ ld.statusLabel }}
        </span>
      </header>

      <RouterView />
    </main>
  </div>
</template>
