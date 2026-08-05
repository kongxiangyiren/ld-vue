import { reactive } from 'vue';
import { defineStore } from 'pinia';

export type SchedulerOption =
  | 'dpm'
  | 'dpm_karras'
  | 'dpm_sde'
  | 'dpm_sde_karras'
  | 'euler_a'
  | 'eulera'
  | 'euler_a_karras'
  | 'euler'
  | 'euler_karras'
  | 'lcm';

export interface GeneratorSettings {
  prompt: string;
  negativePrompt: string;
  steps: number;
  cfg: number;
  seed: number;
  scheduler: SchedulerOption;
  size: number;
  width: number;
  height: number;
  denoiseStrength: number;
  batchCount: number;
  showDiffusionProcess: boolean;
  showDiffusionStride: number;
  useOpencl: boolean;
}

const STORAGE_KEY = 'ld:settings';

const defaultSettings: GeneratorSettings = {
  prompt: '',
  negativePrompt:
    'lowres, bad anatomy, bad hands, text, error, missing fingers, extra digit, fewer digits, cropped, worst quality, low quality, jpeg artifacts, signature, watermark, blurry',
  steps: 20,
  cfg: 7.5,
  seed: -1,
  scheduler: 'dpm',
  size: 512,
  width: 512,
  height: 512,
  denoiseStrength: 0.6,
  batchCount: 1,
  showDiffusionProcess: true,
  showDiffusionStride: 4,
  useOpencl: false
};

function loadSettings(): GeneratorSettings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return { ...defaultSettings };
    }
    return { ...defaultSettings, ...(JSON.parse(stored) as Partial<GeneratorSettings>) };
  } catch {
    return { ...defaultSettings };
  }
}

export const useSettingsStore = defineStore('settings', () => {
  const settings = reactive<GeneratorSettings>(loadSettings());

  function saveSettings() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }

  function resetSettings() {
    Object.assign(settings, defaultSettings);
    saveSettings();
  }

  return { settings, saveSettings, resetSettings };
});
