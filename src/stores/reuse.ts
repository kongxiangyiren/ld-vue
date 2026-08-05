import { ref } from 'vue';
import { defineStore } from 'pinia';

export interface ReusePayload {
  prompt: string;
  negativePrompt: string;
  steps: number;
  cfg: number;
  seed: number;
  scheduler: string;
  width: number;
  height: number;
  denoiseStrength: number;
  modelName: string;
}

export const useReuseStore = defineStore('reuse', () => {
  const payload = ref<ReusePayload | null>(null);

  function setPayload(value: ReusePayload) {
    payload.value = value;
  }

  function consume() {
    const value = payload.value;
    payload.value = null;
    return value;
  }

  return { payload, setPayload, consume };
});
