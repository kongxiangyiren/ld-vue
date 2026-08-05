import { LdApi, type GenerateImageParams, type Module } from '@kongxiangyiren/ld-api';
import { computed, ref } from 'vue';
import { defineStore } from 'pinia';

import { API_BASE } from '@/utils/config';
import { enableBrowserStream } from '@/utils/ld-browser';

const STORAGE_MODEL_KEY = 'ld:selected-model';

type Info = Awaited<ReturnType<LdApi['getInfo']>>;
type Status = Awaited<ReturnType<LdApi['getStatus']>>;
type ModelsResponse = Awaited<ReturnType<LdApi['getModels']>>;

function readStoredModelId() {
  try {
    return localStorage.getItem(STORAGE_MODEL_KEY) ?? '';
  } catch {
    return '';
  }
}

export const useLdStore = defineStore('ld', () => {
  const api = new LdApi(API_BASE, 0);
  enableBrowserStream(api);

  const info = ref<Info | null>(null);
  const models = ref<Module[]>([]);
  const upscalers = ref<ModelsResponse['upscalers']>([]);
  const status = ref<Status | null>(null);
  const storedModelId = readStoredModelId();
  const selectedModelId = ref(storedModelId);

  const loadingModels = ref(false);
  const loadingStatus = ref(false);
  const selecting = ref(false);
  const stopping = ref(false);

  const selectedModel = computed(() =>
    status.value?.serving_model_id
      ? (models.value.find(model => model.id === status.value?.serving_model_id) ?? null)
      : null
  );

  const modelCount = computed(() => models.value.length);
  const statusLabel = computed(() => {
    if (!status.value) return '未连接';
    const labels: Record<NonNullable<Status['state']>, string> = {
      idle: '空闲',
      starting: '加载中',
      running: '运行中',
      error: '异常'
    };
    return labels[status.value.state];
  });

  async function refreshInfo() {
    info.value = await api.getInfo();
  }

  async function refreshModels() {
    loadingModels.value = true;
    try {
      const result = await api.getModels();
      models.value = result.models;
      upscalers.value = result.upscalers;

      const stillExists = models.value.some(model => model.id === selectedModelId.value);
      if (!stillExists) {
        selectedModelId.value = models.value[0]?.id ?? '';
      }
    } finally {
      loadingModels.value = false;
    }
  }

  async function refreshStatus() {
    loadingStatus.value = true;
    try {
      status.value = await api.getStatus();
    } finally {
      loadingStatus.value = false;
    }
  }

  function delay(ms: number) {
    return new Promise<void>(resolve => {
      setTimeout(resolve, ms);
    });
  }

  async function waitForModel(modelId: string, width: number, height: number) {
    const deadline = Date.now() + 180_000;
    while (Date.now() < deadline) {
      await refreshStatus();
      const current = status.value;
      if (current?.state === 'error') {
        throw new Error(current.message ?? '模型加载失败');
      }
      if (
        current?.serving_model_id === modelId &&
        current?.state === 'running' &&
        current?.width === width &&
        current?.height === height
      ) {
        return;
      }
      await delay(500);
    }
    throw new Error('模型切换超时');
  }

  async function ensureModel(modelId: string, width: number, height: number) {
    await refreshStatus();
    if (status.value?.state === 'error') {
      throw new Error(status.value.message ?? '模型加载异常');
    }
    await selectModel(modelId, width, height);
  }

  async function loadInitial() {
    await Promise.allSettled([refreshInfo(), refreshModels()]);
    try {
      await refreshStatus();
    } catch {
      // 状态接口失败时不阻断页面加载。
    }
    if (!storedModelId && status.value?.serving_model_id) {
      selectedModelId.value = status.value.serving_model_id;
      localStorage.setItem(STORAGE_MODEL_KEY, selectedModelId.value);
    }
  }

  async function selectModel(modelId: string, width: number, height: number) {
    const servingId = status.value?.serving_model_id;
    const sameModel = servingId === modelId;
    const sameSize =
      status.value?.state === 'running' &&
      status.value?.width === width &&
      status.value?.height === height;

    if (sameModel && sameSize) {
      selectedModelId.value = modelId;
      localStorage.setItem(STORAGE_MODEL_KEY, modelId);
      await waitForModel(modelId, width, height);
      return { ok: true };
    }

    selecting.value = true;
    try {
      if (servingId && servingId !== modelId) {
        const stopResult = await api.stop(servingId);
        if (!stopResult.ok) {
          throw new Error('原模型停止失败');
        }
      }

      const result = await api.selectModel(modelId, width, height);
      if (!result.ok) {
        throw new Error('模型选择失败');
      }
      selectedModelId.value = modelId;
      localStorage.setItem(STORAGE_MODEL_KEY, modelId);
      await waitForModel(modelId, width, height);
      return result;
    } finally {
      selecting.value = false;
    }
  }

  async function stopModel(modelId: string) {
    stopping.value = true;
    try {
      const result = await api.stop(modelId);
      await refreshStatus();
      return result;
    } finally {
      stopping.value = false;
    }
  }

  async function tokenize(prompt: string, signal?: AbortSignal) {
    return await api.tokenize(prompt, signal);
  }

  function generate(params: GenerateImageParams, options?: Parameters<LdApi['generateImage']>[1]) {
    return api.generateImage(params, options);
  }

  return {
    api,
    info,
    models,
    upscalers,
    status,
    selectedModelId,
    selectedModel,
    modelCount,
    statusLabel,
    loadingModels,
    loadingStatus,
    selecting,
    stopping,
    loadInitial,
    refreshInfo,
    refreshModels,
    refreshStatus,
    selectModel,
    ensureModel,
    stopModel,
    tokenize,
    generate
  };
});
