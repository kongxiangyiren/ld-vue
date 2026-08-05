import { ref } from 'vue';
import { defineStore } from 'pinia';

import { dbAll, dbClear, dbDelete, dbPut } from '@/utils/db';

export interface GenerationRecord {
  id: string;
  createdAt: number;
  prompt: string;
  negativePrompt: string;
  imageDataUrl: string;
  width: number;
  height: number;
  seed: number;
  steps: number;
  cfg: number;
  scheduler: string;
  modelName: string;
  generationTimeMs: number;
}

export type NewGenerationRecord = Omit<GenerationRecord, 'id' | 'createdAt'>;

function createId() {
  return (
    globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`
  );
}

export const useGalleryStore = defineStore('gallery', () => {
  const items = ref<GenerationRecord[]>([]);
  const loading = ref(false);
  const loaded = ref(false);

  async function loadItems() {
    loading.value = true;
    try {
      const rows = await dbAll<GenerationRecord>();
      items.value = rows.sort((left, right) => right.createdAt - left.createdAt).slice(0, 80);
    } finally {
      loading.value = false;
      loaded.value = true;
    }
  }

  async function addItem(input: NewGenerationRecord) {
    const record: GenerationRecord = {
      ...input,
      id: createId(),
      createdAt: Date.now()
    };
    items.value.unshift(record);
    items.value = items.value.slice(0, 80);
    await dbPut(record);
    return record;
  }

  async function removeItem(id: string) {
    items.value = items.value.filter(item => item.id !== id);
    await dbDelete(id);
  }

  async function clearItems() {
    items.value = [];
    await dbClear();
  }

  return { items, loading, loaded, loadItems, addItem, removeItem, clearItems };
});
