<script setup lang="ts">
  import { onMounted } from 'vue';
  import { Monitor, Refresh, VideoPlay } from '@element-plus/icons-vue';
  import type { Module } from '@kongxiangyiren/ld-api';

  import { useLdStore } from '@/stores/ld';

  const ld = useLdStore();

  defineOptions({ name: 'ModelManagerPage' });

  function defaultResolution(model: Module): [number, number] {
    return model.resolutions[0] ?? [512, 512];
  }

  function schedulerLabel(scheduler: Module['defaults']['scheduler']) {
    const labels: Record<Module['defaults']['scheduler'], string> = {
      dpm: 'DPM++ 2M Karras',
      dpm_karras: 'DPM++ 2M + Karras',
      dpm_sde: 'DPM++ 2M SDE',
      dpm_sde_karras: 'DPM++ 2M SDE + Karras',
      euler_a: 'Euler A',
      eulera: 'Euler A',
      euler_a_karras: 'Euler A + Karras',
      euler: 'Euler',
      euler_karras: 'Euler + Karras',
      lcm: 'LCM'
    };
    return labels[scheduler];
  }

  async function refreshAll() {
    try {
      await Promise.all([ld.refreshInfo(), ld.refreshModels(), ld.refreshStatus()]);
      ElMessage.success('模型信息已刷新');
    } catch (error) {
      ElMessage.error(error instanceof Error ? error.message : '刷新失败');
    }
  }

  async function selectModel(model: Module) {
    const [width, height] = defaultResolution(model);
    try {
      await ld.selectModel(model.id, width, height);
      ElMessage.success(`${model.name} 已切换`);
    } catch (error) {
      ElMessage.error(error instanceof Error ? error.message : '模型切换失败');
    }
  }

  async function stopModel(model: Module) {
    try {
      await ld.stopModel(model.id);
      ElMessage.success(`${model.name} 已停止`);
    } catch (error) {
      ElMessage.error(error instanceof Error ? error.message : '模型停止失败');
    }
  }

  onMounted(() => {
    if (!ld.models.length) {
      void ld.refreshModels().catch(() => undefined);
    }
    if (!ld.status) {
      void ld.refreshStatus().catch(() => undefined);
    }
  });
</script>

<template>
  <div class="mx-auto max-w-[1480px] p-4 lg:p-6">
    <div class="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="text-xl font-semibold lg:text-2xl">模型管理</h1>
        <p class="mt-1 text-sm text-muted">
          {{ ld.info ? `${ld.info.device} · ${ld.info.version}` : 'Local Dream' }}
        </p>
      </div>
      <el-button
        :icon="Refresh"
        :loading="ld.loadingModels || ld.loadingStatus"
        @click="refreshAll"
      >
        刷新
      </el-button>
    </div>

    <div class="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
      <div class="rounded-lg border border-line bg-white px-4 py-3">
        <div class="text-xs text-muted">运行状态</div>
        <div class="mt-1 flex items-center gap-2 text-sm font-semibold">
          <span
            class="size-2 rounded-full"
            :class="
              ld.status?.state === 'running'
                ? 'bg-emerald-500'
                : ld.status?.state === 'starting'
                  ? 'bg-amber-500'
                  : ld.status?.state === 'error'
                    ? 'bg-red-500'
                    : 'bg-slate-400'
            "
          ></span>
          {{ ld.statusLabel }}
        </div>
      </div>
      <div class="rounded-lg border border-line bg-white px-4 py-3">
        <div class="text-xs text-muted">模型数量</div>
        <div class="mt-1 text-sm font-semibold">{{ ld.modelCount }}</div>
      </div>
      <div class="rounded-lg border border-line bg-white px-4 py-3">
        <div class="text-xs text-muted">当前模型</div>
        <div class="mt-1 truncate text-sm font-semibold">
          {{ ld.selectedModel?.name ?? '未选择' }}
        </div>
      </div>
      <div class="rounded-lg border border-line bg-white px-4 py-3">
        <div class="text-xs text-muted">设备</div>
        <div class="mt-1 truncate text-sm font-semibold">{{ ld.info?.device ?? '未知' }}</div>
      </div>
    </div>

    <section class="rounded-lg border border-line bg-white">
      <el-table v-loading="ld.loadingModels" :data="ld.models" class="w-full" empty-text="暂无模型">
        <el-table-column label="模型" min-width="220">
          <template #default="{ row }">
            <div class="flex items-center gap-3 py-1">
              <div
                class="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary"
              >
                <el-icon :size="18"><Monitor /></el-icon>
              </div>
              <div class="min-w-0">
                <div class="flex items-center gap-2">
                  <span class="truncate font-medium">{{ row.name }}</span>
                  <span
                    v-if="ld.selectedModel?.id === row.id"
                    class="shrink-0 rounded bg-emerald-100 px-1.5 py-0.5 text-[11px] text-emerald-700"
                  >
                    当前
                  </span>
                </div>
                <div class="mt-0.5 truncate text-xs text-muted">{{ row.description }}</div>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="能力" min-width="150">
          <template #default="{ row }">
            <div class="flex flex-wrap gap-1">
              <span v-if="row.is_sdxl" class="rounded bg-blue-50 px-2 py-0.5 text-xs text-blue-700">
                SDXL
              </span>
              <span
                v-if="row.is_anima"
                class="rounded bg-purple-50 px-2 py-0.5 text-xs text-purple-700"
              >
                Anima
              </span>
              <span
                v-if="row.is_custom"
                class="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600"
              >
                Custom
              </span>
              <span
                v-if="row.run_on_cpu"
                class="rounded bg-amber-50 px-2 py-0.5 text-xs text-amber-700"
              >
                CPU
              </span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="默认参数" min-width="180">
          <template #default="{ row }">
            <div class="text-xs leading-5 text-muted">
              <div>步数 {{ row.defaults.steps }} · CFG {{ row.defaults.cfg }}</div>
              <div>{{ schedulerLabel(row.defaults.scheduler) }}</div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="支持尺寸" min-width="160">
          <template #default="{ row }">
            <div v-if="row.resolutions.length" class="flex max-w-56 flex-wrap gap-1">
              <span
                v-for="[width, height] in row.resolutions.slice(0, 4)"
                :key="`${width}x${height}`"
                class="rounded bg-surface px-1.5 py-0.5 font-mono text-[11px] text-muted"
              >
                {{ width }}×{{ height }}
              </span>
            </div>
            <span v-else class="text-xs text-muted">自适应</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="180" fixed="right">
          <template #default="{ row }">
            <div class="flex gap-2">
              <el-button
                type="primary"
                plain
                size="small"
                :icon="VideoPlay"
                :loading="ld.selecting && ld.selectedModelId === row.id"
                @click="selectModel(row as Module)"
              >
                选择
              </el-button>
              <el-button
                size="small"
                :disabled="ld.status?.serving_model_id !== row.id"
                :loading="ld.stopping && ld.status?.serving_model_id === row.id"
                @click="stopModel(row as Module)"
              >
                停止
              </el-button>
            </div>
          </template>
        </el-table-column>
      </el-table>
    </section>
  </div>
</template>
