<script setup lang="ts">
  import { computed, onMounted, watch } from 'vue';

  import { useLdStore } from '@/stores/ld';
  import { useSettingsStore } from '@/stores/settings';
  import { API_BASE } from '@/utils/config';

  const ld = useLdStore();
  const settings = useSettingsStore();

  defineOptions({ name: 'SettingsPage' });

  const settingsModel = computed(
    () => ld.models.find(item => item.id === ld.selectedModelId) ?? null
  );

  watch(
    () => settings.settings.size,
    size => {
      settings.settings.width = size;
      settings.settings.height = size;
    }
  );

  function schedulerLabel(scheduler: string) {
    const labels: Record<string, string> = {
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
    return labels[scheduler] ?? scheduler;
  }

  function savePreferences() {
    settings.saveSettings();
    ElMessage.success('界面偏好已保存');
  }

  function resetPreferences() {
    settings.resetSettings();
    ElMessage.success('界面偏好已恢复默认');
  }

  onMounted(() => {
    if (!ld.models.length) {
      void ld.refreshModels().catch(() => undefined);
    }
  });
</script>

<template>
  <div class="mx-auto max-w-4xl p-4 lg:p-6">
    <div class="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="text-xl font-semibold lg:text-2xl">默认参数</h1>
        <p class="mt-1 text-sm text-muted">模型自带参数与界面偏好</p>
      </div>
      <div class="flex gap-2">
        <el-button @click="resetPreferences">恢复偏好</el-button>
        <el-button type="primary" @click="savePreferences">保存偏好</el-button>
      </div>
    </div>

    <section class="rounded-lg border border-line bg-white p-4 lg:p-5">
      <div class="mb-4 flex flex-wrap items-center gap-3">
        <label class="text-sm font-medium">模型</label>
        <el-select v-model="ld.selectedModelId" class="w-full max-w-md" placeholder="选择模型">
          <el-option
            v-for="model in ld.models"
            :key="model.id"
            :label="model.name"
            :value="model.id"
          />
        </el-select>
      </div>

      <el-descriptions v-if="settingsModel" :column="2" border>
        <el-descriptions-item label="模型名称">{{ settingsModel.name }}</el-descriptions-item>
        <el-descriptions-item label="采样步数">
          {{ settingsModel.defaults.steps }}
        </el-descriptions-item>
        <el-descriptions-item label="CFG">{{ settingsModel.defaults.cfg }}</el-descriptions-item>
        <el-descriptions-item label="采样器">
          {{ schedulerLabel(settingsModel.defaults.scheduler) }}
        </el-descriptions-item>
        <el-descriptions-item label="正向提示词" :span="2">
          <p class="text-sm leading-6 wrap-break-word whitespace-pre-wrap">
            {{ settingsModel.defaults.prompt }}
          </p>
        </el-descriptions-item>
        <el-descriptions-item label="反向提示词" :span="2">
          <p class="text-sm leading-6 wrap-break-word whitespace-pre-wrap text-muted">
            {{ settingsModel.defaults.negative_prompt }}
          </p>
        </el-descriptions-item>
        <el-descriptions-item label="支持尺寸" :span="2">
          <div v-if="settingsModel.resolutions.length" class="flex flex-wrap gap-1.5">
            <span
              v-for="[width, height] in settingsModel.resolutions"
              :key="`${width}x${height}`"
              class="rounded-md bg-surface px-2 py-1 font-mono text-xs"
            >
              {{ width }} × {{ height }}
            </span>
          </div>
          <span v-else class="text-sm text-muted">自适应</span>
        </el-descriptions-item>
      </el-descriptions>
      <el-empty v-else description="模型未加载" />
    </section>

    <section class="mt-5 rounded-lg border border-line bg-white p-4 lg:p-5">
      <h2 class="mb-4 text-base font-semibold">界面偏好</h2>
      <el-form label-position="top">
        <div class="grid gap-4 lg:grid-cols-2">
          <el-form-item label="随机种子">
            <el-input-number
              v-model="settings.settings.seed"
              :min="-1"
              :max="9999999999"
              class="w-full"
            />
          </el-form-item>

          <el-form-item label="默认批量数量">
            <el-input-number
              v-model="settings.settings.batchCount"
              :min="1"
              :max="4"
              class="w-full"
            />
          </el-form-item>

          <el-form-item label="无分辨率时的默认尺寸">
            <el-select v-model="settings.settings.size" class="w-full">
              <el-option label="512 × 512" :value="512" />
              <el-option label="768 × 768" :value="768" />
              <el-option label="1024 × 1024" :value="1024" />
              <el-option label="1280 × 1280" :value="1280" />
              <el-option label="1536 × 1536" :value="1536" />
            </el-select>
          </el-form-item>

          <el-form-item label="图生图去噪强度">
            <div class="w-full">
              <div class="mb-1 flex justify-between text-xs text-muted">
                <span>0.1</span>
                <span>{{ settings.settings.denoiseStrength }}</span>
                <span>1</span>
              </div>
              <el-slider
                v-model="settings.settings.denoiseStrength"
                :min="0.1"
                :max="1"
                :step="0.05"
              />
            </div>
          </el-form-item>

          <el-form-item label="扩散过程预览">
            <el-switch v-model="settings.settings.showDiffusionProcess" />
          </el-form-item>

          <el-form-item label="预览间隔">
            <div class="w-full">
              <div class="mb-1 flex justify-between text-xs text-muted">
                <span>1</span>
                <span>{{ settings.settings.showDiffusionStride }}</span>
                <span>10</span>
              </div>
              <el-slider
                v-model="settings.settings.showDiffusionStride"
                :min="1"
                :max="10"
                :step="1"
                :disabled="!settings.settings.showDiffusionProcess"
              />
            </div>
          </el-form-item>

          <el-form-item label="OpenCL">
            <el-switch v-model="settings.settings.useOpencl" />
          </el-form-item>
        </div>
      </el-form>
    </section>

    <section class="mt-5 rounded-lg border border-line bg-white p-4 lg:p-5">
      <h2 class="text-base font-semibold">后端连接</h2>
      <div class="mt-4 rounded-md bg-surface px-3 py-3">
        <div class="text-xs text-muted">API 地址</div>
        <div class="mt-1 font-mono text-sm break-all">{{ API_BASE }}</div>
      </div>
      <div class="mt-3 text-xs text-muted">
        生产环境可通过
        <code class="rounded bg-surface px-1.5 py-0.5">VITE_LD_API_BASE</code>
        配置同源或已允许跨域的 Local Dream 地址。
      </div>
    </section>
  </div>
</template>
