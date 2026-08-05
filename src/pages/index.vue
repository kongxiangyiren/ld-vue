<script setup lang="ts">
  import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
  import { Download, Picture, Refresh, UploadFilled, VideoPlay } from '@element-plus/icons-vue';

  import type { GenerateImageParams, Module } from '@kongxiangyiren/ld-api';

  import { useGalleryStore } from '@/stores/gallery';
  import { useLdStore } from '@/stores/ld';
  import { useSettingsStore, type SchedulerOption } from '@/stores/settings';
  import {
    base64FromDataUrl,
    downloadDataUrl,
    rawRgbToImageUrl,
    readFileAsDataUrl
  } from '@/utils/image';

  interface ResultMeta {
    seed: number;
    width: number;
    height: number;
    generationTimeMs: number;
  }

  interface DimensionOption {
    label: string;
    value: string;
    width: number;
    height: number;
  }

  const ld = useLdStore();
  const gallery = useGalleryStore();
  const settings = useSettingsStore();

  defineOptions({ name: 'GeneratorPage' });

  const TOKEN_LIMIT = 77;
  const form = reactive({ ...settings.settings });
  const mode = ref<'txt2img' | 'img2img'>('txt2img');
  const generating = ref(false);
  const progress = ref(0);
  const positiveTokenCount = ref<number | null>(null);
  const negativeTokenCount = ref<number | null>(null);
  const resultImage = ref('');
  const resultMeta = ref<ResultMeta | null>(null);
  const progressImage = ref('');
  const imageDataUrl = ref('');
  const imageBase64 = ref('');
  const maskDataUrl = ref('');
  const maskBase64 = ref('');
  const imageInput = ref<HTMLInputElement>();
  const maskInput = ref<HTMLInputElement>();
  let tokenTimer: ReturnType<typeof setTimeout> | undefined;
  let tokenController: AbortController | null = null;

  const positiveOverLimit = computed(() => (positiveTokenCount.value ?? 0) > TOKEN_LIMIT);
  const negativeOverLimit = computed(() => (negativeTokenCount.value ?? 0) > TOKEN_LIMIT);

  const schedulerOptions: Array<{ label: string; value: SchedulerOption }> = [
    { label: 'DPM++ 2M Karras', value: 'dpm' },
    { label: 'DPM++ 2M + Karras', value: 'dpm_karras' },
    { label: 'DPM++ 2M SDE', value: 'dpm_sde' },
    { label: 'DPM++ 2M SDE + Karras', value: 'dpm_sde_karras' },
    { label: 'Euler A', value: 'euler_a' },
    { label: 'Euler A + Karras', value: 'euler_a_karras' },
    { label: 'Euler', value: 'euler' },
    { label: 'Euler + Karras', value: 'euler_karras' },
    { label: 'LCM', value: 'lcm' }
  ];

  const dimensionOptions = computed<DimensionOption[]>(() => {
    const model = formModel.value;
    const resolutions = model?.resolutions;
    const defaultSize = 512;
    const candidates: Array<[number, number]> =
      resolutions && resolutions.length > 0
        ? resolutions
        : [
            [defaultSize, defaultSize],
            [512, 512],
            [768, 768],
            [1024, 1024],
            [1280, 1280],
            [1536, 1536]
          ];

    const seen = new Set<string>();
    return candidates.flatMap(([width, height]) => {
      const value = `${width}x${height}`;
      if (seen.has(value)) {
        return [];
      }
      seen.add(value);
      return [{ label: `${width} × ${height}`, value, width, height }];
    });
  });

  const currentDimension = computed(() => `${form.width}x${form.height}`);
  const formModel = computed(
    () => ld.models.find(item => item.id === ld.selectedModelId) ?? null
  );
  const hasSelectedModel = computed(() => Boolean(formModel.value));

  function applyModelDefaults(model: Module | null) {
    if (!model) {
      return;
    }

    form.prompt = model.defaults.prompt;
    form.negativePrompt = model.defaults.negative_prompt;
    form.steps = model.defaults.steps;
    form.cfg = model.defaults.cfg;
    form.scheduler = model.defaults.scheduler;

    const resolutionDefaultSize = model.generation_size || 1024;
    if (model.resolutions.length) {
      const preferred =
        model.resolutions.find(
          ([width, height]) => width === resolutionDefaultSize && height === resolutionDefaultSize
        ) ??
        model.resolutions[0];
      if (preferred) {
        form.width = preferred[0];
        form.height = preferred[1];
      }
    } else {
      form.width = 512;
      form.height = 512;
    }
  }

  watch(
    () => ld.selectedModelId,
    modelId => {
      const model = ld.models.find(item => item.id === modelId);
      applyModelDefaults(model ?? null);
    },
    { immediate: true, flush: 'sync' }
  );

  watch(
    [() => form.prompt, () => form.negativePrompt],
    () => {
      if (tokenTimer) {
        clearTimeout(tokenTimer);
      }
      tokenTimer = setTimeout(() => {
        void refreshTokenCounts();
      }, 300);
    },
    { immediate: true }
  );

  async function refreshTokenCounts() {
    tokenController?.abort();
    const controller = new AbortController();
    tokenController = controller;

    const [positive, negative] = await Promise.allSettled([
      form.prompt.trim()
        ? ld.tokenize(form.prompt, controller.signal)
        : Promise.resolve({ count: 0, max_length: TOKEN_LIMIT }),
      form.negativePrompt.trim()
        ? ld.tokenize(form.negativePrompt, controller.signal)
        : Promise.resolve({ count: 0, max_length: TOKEN_LIMIT })
    ]);

    if (controller.signal.aborted) {
      return;
    }

    positiveTokenCount.value = positive.status === 'fulfilled' ? positive.value.count : null;
    negativeTokenCount.value = negative.status === 'fulfilled' ? negative.value.count : null;
  }

  async function refreshBackend() {
    try {
      await Promise.all([ld.refreshModels(), ld.refreshStatus()]);
    } catch (error) {
      ElMessage.error(error instanceof Error ? error.message : '模型列表加载失败');
    }
  }

  async function handleModelChange(modelId: string) {
    if (!modelId) {
      return;
    }

    const previousId = ld.selectedModelId;
    ld.selectedModelId = modelId;

    try {
      await ld.selectModel(modelId, form.width, form.height);
    } catch (error) {
      ld.selectedModelId = previousId;
      const previousModel = ld.models.find(item => item.id === previousId) ?? null;
      applyModelDefaults(previousModel);
      ElMessage.error(error instanceof Error ? error.message : '模型切换失败');
    }
  }

  async function handleDimensionChange(value: string) {
    const [width, height] = value.split('x').map(Number);
    if (!width || !height) {
      return;
    }

    const previousWidth = form.width;
    const previousHeight = form.height;
    form.width = width;
    form.height = height;

    const model = formModel.value;
    if (!model) {
      return;
    }

    try {
      await ld.selectModel(model.id, form.width, form.height);
    } catch (error) {
      form.width = previousWidth;
      form.height = previousHeight;
      ElMessage.error(error instanceof Error ? error.message : '模型尺寸切换失败');
    }
  }

  async function ensureModelReady() {
    if (!ld.models.length) {
      await ld.refreshModels();
    }

    const model = formModel.value ?? ld.models[0] ?? null;
    if (!model) {
      throw new Error('没有可用模型');
    }

    await ld.refreshStatus();
    const current = ld.status;
    if (current?.state === 'error') {
      throw new Error(current.message ?? '模型加载异常');
    }

    const isReady =
      current?.state === 'running' &&
      current.serving_model_id === model.id &&
      current.width === form.width &&
      current.height === form.height;

    if (!isReady) {
      await ld.selectModel(model.id, form.width, form.height);
    }
    return model;
  }

  async function handleGenerate() {
    if (!form.prompt.trim()) {
      ElMessage.warning('请输入正向提示词');
      return;
    }

    if (mode.value === 'img2img' && !imageBase64.value) {
      ElMessage.warning('图生图模式需要上传参考图');
      return;
    }

    generating.value = true;
    progress.value = 0;
    resultImage.value = '';
    progressImage.value = '';
    resultMeta.value = null;

    try {
      const model = await ensureModelReady();
      if (!(await validateTokenLimits())) {
        return;
      }

      const params: Record<string, unknown> = {
        prompt: form.prompt,
        negative_prompt: form.negativePrompt,
        steps: form.steps,
        cfg: form.cfg,
        scheduler: form.scheduler,
        use_opencl: form.useOpencl
      };

      if (form.seed !== -1) {
        params.seed = form.seed;
      }

      if (form.showDiffusionProcess) {
        params.show_diffusion_process = true;
        params.show_diffusion_stride = form.showDiffusionStride;
      }

      if (mode.value === 'img2img' && imageBase64.value) {
        params.image = imageBase64.value;
        params.denoise_strength = form.denoiseStrength;
        if (maskBase64.value) {
          params.mask = maskBase64.value;
        }
      }

      if (form.width === form.height) {
        params.size = form.width;
      } else {
        params.width = form.width;
        params.height = form.height;
      }

      const result = await ld.generate(params as unknown as GenerateImageParams, {
        onProgress: event => {
          progress.value = event.total_steps > 0 ? event.step / event.total_steps : 0;
          if (event.image) {
            void rawRgbToImageUrl(event.image, form.width, form.height)
              .then(url => {
                progressImage.value = url;
              })
              .catch(() => {
                // Preview conversion must not interrupt the generation stream.
              });
          }
        }
      });

      const imageUrl = await rawRgbToImageUrl(result.image, result.width, result.height);
      resultImage.value = imageUrl;
      resultMeta.value = {
        seed: result.seed,
        width: result.width,
        height: result.height,
        generationTimeMs: result.generation_time_ms
      };

      await gallery.addItem({
        prompt: form.prompt,
        negativePrompt: form.negativePrompt,
        imageDataUrl: imageUrl,
        width: result.width,
        height: result.height,
        seed: result.seed,
        steps: form.steps,
        cfg: form.cfg,
        scheduler: form.scheduler,
        modelName: model.name,
        generationTimeMs: result.generation_time_ms
      });
      ElMessage.success('生成完成');
    } catch (error) {
      ElMessage.error(error instanceof Error ? error.message : '生成失败');
    } finally {
      generating.value = false;
    }
  }

  async function validateTokenLimits() {
    const [positive, negative] = await Promise.all([
      form.prompt.trim()
        ? ld.tokenize(form.prompt)
        : Promise.resolve({ count: 0, max_length: TOKEN_LIMIT }),
      form.negativePrompt.trim()
        ? ld.tokenize(form.negativePrompt)
        : Promise.resolve({ count: 0, max_length: TOKEN_LIMIT })
    ]);

    positiveTokenCount.value = positive.count;
    negativeTokenCount.value = negative.count;

    if (positive.count > TOKEN_LIMIT || negative.count > TOKEN_LIMIT) {
      ElMessage.warning(`正反提示词不能超过 ${TOKEN_LIMIT} Tokens`);
      return false;
    }

    return true;
  }

  async function onImageChange(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      return;
    }

    try {
      const dataUrl = await readFileAsDataUrl(file);
      imageDataUrl.value = dataUrl;
      imageBase64.value = base64FromDataUrl(dataUrl);
      mode.value = 'img2img';
    } catch (error) {
      ElMessage.error(error instanceof Error ? error.message : '读取参考图失败');
    } finally {
      input.value = '';
    }
  }

  async function onMaskChange(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      return;
    }

    try {
      const dataUrl = await readFileAsDataUrl(file);
      maskDataUrl.value = dataUrl;
      maskBase64.value = base64FromDataUrl(dataUrl);
    } catch (error) {
      ElMessage.error(error instanceof Error ? error.message : '读取蒙版失败');
    } finally {
      input.value = '';
    }
  }

  function clearImage() {
    imageDataUrl.value = '';
    imageBase64.value = '';
    maskDataUrl.value = '';
    maskBase64.value = '';
    mode.value = 'txt2img';
  }

  function clearMask() {
    maskDataUrl.value = '';
    maskBase64.value = '';
  }

  function handleDownload() {
    if (!resultImage.value) {
      return;
    }
    downloadDataUrl(resultImage.value, `ld-${Date.now()}.png`);
  }

  onMounted(() => {
    if (!ld.models.length) {
      void ld.refreshModels().catch(() => undefined);
    }
  });

  onBeforeUnmount(() => {
    tokenController?.abort();
    if (tokenTimer) {
      clearTimeout(tokenTimer);
    }
  });
</script>

<template>
  <div class="mx-auto max-w-370 p-4 lg:p-6">
    <div class="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="text-xl font-semibold lg:text-2xl">图片生成</h1>
        <p class="mt-1 text-sm text-muted">
          {{ ld.selectedModel?.name ?? '模型未加载' }}
        </p>
      </div>
      <div class="flex gap-2">
        <el-button
          :icon="Refresh"
          :loading="ld.loadingModels || ld.loadingStatus"
          @click="refreshBackend"
        >
          刷新
        </el-button>
      </div>
    </div>

    <div class="grid gap-5 xl:grid-cols-[minmax(0,430px)_minmax(0,1fr)]">
      <section class="rounded-lg border border-line bg-white p-4">
        <div class="space-y-4">
          <el-radio-group v-model="mode" class="w-full">
            <el-radio-button value="txt2img" class="flex-1">文生图</el-radio-button>
            <el-radio-button value="img2img" class="flex-1">图生图</el-radio-button>
          </el-radio-group>

          <div>
            <label class="mb-1.5 block text-sm font-medium">模型</label>
            <el-select
              :model-value="ld.selectedModelId"
              class="w-full"
              placeholder="选择模型"
              :loading="ld.loadingModels || ld.selecting"
              :disabled="ld.selecting"
              @change="handleModelChange"
            >
              <el-option
                v-for="model in ld.models"
                :key="model.id"
                :label="model.name"
                :value="model.id"
              />
            </el-select>
          </div>

          <div>
            <div class="mb-1.5 flex items-center justify-between gap-3">
              <label class="text-sm font-medium">正向提示词</label>
              <span class="text-xs" :class="positiveOverLimit ? 'text-red-600' : 'text-muted'">
                {{ positiveTokenCount ?? 0 }} / {{ TOKEN_LIMIT }} Tokens
              </span>
            </div>
            <el-input
              v-model="form.prompt"
              type="textarea"
              :rows="5"
              placeholder="a beautiful landscape, cinematic light"
              resize="vertical"
            />
          </div>

          <div>
            <div class="mb-1.5 flex items-center justify-between gap-3">
              <label class="text-sm font-medium">反向提示词</label>
              <span class="text-xs" :class="negativeOverLimit ? 'text-red-600' : 'text-muted'">
                {{ negativeTokenCount ?? 0 }} / {{ TOKEN_LIMIT }} Tokens
              </span>
            </div>
            <el-input v-model="form.negativePrompt" type="textarea" :rows="3" resize="vertical" />
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="mb-1.5 block text-sm font-medium">尺寸</label>
              <el-select
                :model-value="currentDimension"
                class="w-full"
                :loading="ld.selecting"
                :disabled="ld.selecting"
                @change="handleDimensionChange"
              >
                <el-option
                  v-for="option in dimensionOptions"
                  :key="option.value"
                  :label="option.label"
                  :value="option.value"
                />
              </el-select>
            </div>
            <div>
              <label class="mb-1.5 block text-sm font-medium">采样器</label>
              <el-select v-model="form.scheduler" class="w-full">
                <el-option
                  v-for="option in schedulerOptions"
                  :key="option.value"
                  :label="option.label"
                  :value="option.value"
                />
              </el-select>
            </div>
          </div>

          <div>
            <div class="mb-1 flex items-center justify-between">
              <label class="text-sm font-medium">采样步数</label>
              <span class="text-xs text-muted">{{ form.steps }}</span>
            </div>
            <el-slider v-model="form.steps" :min="1" :max="60" :step="1" />
          </div>

          <div>
            <div class="mb-1 flex items-center justify-between">
              <label class="text-sm font-medium">CFG</label>
              <span class="text-xs text-muted">{{ form.cfg }}</span>
            </div>
            <el-slider v-model="form.cfg" :min="1" :max="20" :step="0.5" />
          </div>

          <div class="grid grid-cols-2 items-end gap-3">
            <div>
              <label class="mb-1.5 block text-sm font-medium">随机种子</label>
              <el-input-number v-model="form.seed" :min="-1" :max="99999999999" class="w-full" />
            </div>
            <div class="flex items-center justify-between gap-3 pb-1">
              <span class="text-sm font-medium">OpenCL</span>
              <el-switch v-model="form.useOpencl" />
            </div>
          </div>

          <div class="flex items-center justify-between gap-3">
            <span class="text-sm font-medium">过程预览</span>
            <el-switch v-model="form.showDiffusionProcess" />
          </div>

          <div v-if="form.showDiffusionProcess">
            <div class="mb-1 flex items-center justify-between">
              <label class="text-sm font-medium">预览间隔</label>
              <span class="text-xs text-muted">每 {{ form.showDiffusionStride }} 步</span>
            </div>
            <el-slider v-model="form.showDiffusionStride" :min="1" :max="10" :step="1" />
          </div>

          <div v-if="mode === 'img2img'">
            <div class="mb-1.5 flex items-center justify-between">
              <label class="text-sm font-medium">参考图</label>
              <div class="flex gap-2">
                <button type="button" class="text-xs text-primary" @click="imageInput?.click()">
                  上传
                </button>
                <button
                  v-if="imageDataUrl"
                  type="button"
                  class="text-xs text-red-600 hover:text-red-500"
                  @click="clearImage"
                >
                  清除
                </button>
              </div>
            </div>
            <input
              ref="imageInput"
              class="hidden"
              type="file"
              accept="image/*"
              @change="onImageChange"
            />
            <div
              class="flex min-h-32 items-center justify-center overflow-hidden rounded-md border border-dashed border-line bg-surface"
            >
              <img
                v-if="imageDataUrl"
                :src="imageDataUrl"
                class="max-h-64 w-full object-contain"
                alt="参考图"
              />
              <button
                v-else
                type="button"
                class="flex flex-col items-center gap-2 py-8 text-sm text-muted transition-colors hover:text-primary"
                @click="imageInput?.click()"
              >
                <el-icon :size="22"><UploadFilled /></el-icon>
                选择参考图
              </button>
            </div>

            <div class="mt-4">
              <div class="mb-1 flex items-center justify-between">
                <label class="text-sm font-medium">蒙版</label>
                <div class="flex gap-2">
                  <button
                    v-if="imageDataUrl"
                    type="button"
                    class="text-xs text-primary"
                    @click="maskInput?.click()"
                  >
                    上传
                  </button>
                  <button
                    v-if="maskDataUrl"
                    type="button"
                    class="text-xs text-red-600 hover:text-red-500"
                    @click="clearMask"
                  >
                    清除
                  </button>
                </div>
              </div>
              <input
                ref="maskInput"
                class="hidden"
                type="file"
                accept="image/*"
                @change="onMaskChange"
              />
              <div
                class="flex min-h-24 items-center justify-center overflow-hidden rounded-md border border-dashed border-line bg-surface"
              >
                <img
                  v-if="maskDataUrl"
                  :src="maskDataUrl"
                  class="max-h-48 w-full object-contain"
                  alt="蒙版"
                />
                <span v-else class="py-6 text-xs text-muted">可选，用于局部重绘</span>
              </div>
            </div>

            <div>
              <div class="mb-1 flex items-center justify-between">
                <label class="text-sm font-medium">去噪强度</label>
                <span class="text-xs text-muted">{{ form.denoiseStrength }}</span>
              </div>
              <el-slider v-model="form.denoiseStrength" :min="0.1" :max="1" :step="0.05" />
            </div>
          </div>

          <el-button
            class="w-full"
            type="primary"
            size="large"
            :icon="VideoPlay"
            :loading="generating"
            :disabled="(!hasSelectedModel && !ld.models.length) || ld.selecting"
            @click="handleGenerate"
          >
            {{ generating ? '生成中' : '生成图片' }}
          </el-button>
        </div>
      </section>

      <section class="flex flex-col rounded-lg border border-line bg-white p-4">
        <div class="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 class="text-base font-semibold">输出预览</h2>
            <p v-if="resultMeta" class="mt-0.5 text-xs text-muted">
              {{ resultMeta.width }} × {{ resultMeta.height }} · 耗时
              {{ (resultMeta.generationTimeMs / 1000).toFixed(2) }}s
            </p>
            <p v-else class="mt-0.5 text-xs text-muted">{{ form.width }} × {{ form.height }}</p>
          </div>
          <div class="flex items-center gap-3">
            <span v-if="generating" class="text-sm font-medium text-primary">
              {{ Math.round(progress * 100) }}%
            </span>
            <el-progress
              v-if="generating"
              class="w-28"
              :percentage="Math.round(progress * 100)"
              :show-text="false"
            />
            <el-button :icon="Download" :disabled="!resultImage" @click="handleDownload">
              下载
            </el-button>
          </div>
        </div>

        <div
          class="relative flex min-h-105 flex-1 items-center justify-center overflow-hidden rounded-lg border border-dashed border-line bg-surface lg:min-h-140"
        >
          <img
            v-if="resultImage"
            :src="resultImage"
            class="max-h-[calc(100vh-280px)] w-full object-contain"
            alt="生成结果"
          />
          <img
            v-else-if="progressImage"
            :src="progressImage"
            class="max-h-[calc(100vh-280px)] w-full object-contain opacity-80"
            alt="生成预览"
          />
          <div v-else class="flex flex-col items-center gap-3 text-muted">
            <el-icon :size="36"><Picture /></el-icon>
            <span class="text-sm">等待生成</span>
          </div>

          <div
            v-if="generating"
            class="absolute top-4 left-4 rounded-full bg-ink/80 px-3 py-1.5 text-xs font-medium text-white"
          >
            采样 {{ Math.round(progress * (form.steps || 1)) }} / {{ form.steps }}
          </div>
        </div>

        <div v-if="resultMeta" class="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div class="rounded-md bg-surface px-3 py-2.5">
            <div class="text-xs text-muted">种子</div>
            <div class="mt-0.5 truncate font-mono text-sm">{{ resultMeta.seed }}</div>
          </div>
          <div class="rounded-md bg-surface px-3 py-2.5">
            <div class="text-xs text-muted">尺寸</div>
            <div class="mt-0.5 text-sm">{{ resultMeta.width }} × {{ resultMeta.height }}</div>
          </div>
          <div class="rounded-md bg-surface px-3 py-2.5">
            <div class="text-xs text-muted">采样器</div>
            <div class="mt-0.5 truncate text-sm">{{ form.scheduler }}</div>
          </div>
          <div class="rounded-md bg-surface px-3 py-2.5">
            <div class="text-xs text-muted">耗时</div>
            <div class="mt-0.5 text-sm">{{ (resultMeta.generationTimeMs / 1000).toFixed(2) }}s</div>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>
